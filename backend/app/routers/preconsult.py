from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, desc, select
from sqlalchemy.orm import Session

from ..deps import CurrentUser, current_user, db_dep, require_role
from ..errors import conflict, forbidden, not_found
from ..models import Appointment, Consent, Doctor, Patient, Preconsultation
from ..schemas import (
    AppointmentOut,
    ConsentOut,
    PreconsultIn,
    PreconsultOut,
    SessionConsentIn,
)
from ..services.livekit import mint_token, room_for_appointment
from ..services.signature import decode_signature


router = APIRouter(prefix="/appointments", tags=["preconsult"])


def _hw():
    return require_role("healthworker")


def _appt(db: Session, aid: int) -> Appointment:
    a = db.get(Appointment, aid)
    if not a:
        raise not_found("appointment_not_found")
    return a


def _master_consent_active(db: Session, patient_id: int) -> bool:
    """True only if the active master consent is both agreed and signed.

    FEEDBACK §1: an unsigned legacy consent stays valid for historical reads
    (the CHECK constraint grandfathers pre-migration rows) but doesn't gate
    new HW writes — that forces a re-consent flow with a fresh signature
    when an old patient shows up again.
    """
    p = db.get(Patient, patient_id)
    if not p or not p.master_consent_id:
        return False
    mc = db.get(Consent, p.master_consent_id)
    return bool(mc and mc.agreed and mc.revoked_at is None and mc.signature_image is not None)


def _latest_session_consent(db: Session, appt_id: int) -> Consent | None:
    return db.scalar(
        select(Consent)
        .where(and_(Consent.appointment_id == appt_id, Consent.scope == "session"))
        .order_by(desc(Consent.captured_at))
        .limit(1)
    )


# ── Session consent ───────────────────────────────────────────────────

@router.post("/{appt_id}/consent", response_model=dict, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(_hw())])
def record_session_consent(appt_id: int, payload: SessionConsentIn, db: Session = Depends(db_dep)):
    appt = _appt(db, appt_id)
    if appt.status in ("completed", "cancelled"):
        raise conflict("invalid_state", currentStatus=appt.status)

    if payload.agreed and not _master_consent_active(db, appt.patient_id):
        raise conflict("master_consent_required")

    # FEEDBACK §1: signature only when the patient agrees. Declines stay
    # signature-less — capturing a signature on a "no" would be meaningless.
    signature_bytes: bytes | None = (
        decode_signature(payload.signatureImage) if payload.agreed else None
    )

    consent = Consent(
        patient_id=appt.patient_id,
        scope="session",
        agreed=payload.agreed,
        appointment_id=appt_id,
        captured_at=payload.capturedAt or datetime.now(timezone.utc),
        signature_image=signature_bytes,
        signature_method="signature" if signature_bytes else None,
    )
    db.add(consent)

    if payload.agreed and appt.status == "scheduled":
        appt.status = "consent_pending"

    db.commit()
    db.refresh(consent)
    db.refresh(appt)
    return {
        "consent": ConsentOut.model_validate(consent).model_dump(),
        "appointment": AppointmentOut.model_validate(appt).model_dump(),
    }


@router.get("/{appt_id}/consent", response_model=ConsentOut | None,
            dependencies=[Depends(_hw())])
def get_session_consent(appt_id: int, db: Session = Depends(db_dep)):
    consent = _latest_session_consent(db, appt_id)
    return ConsentOut.model_validate(consent) if consent else None


# ── Preconsult vitals ────────────────────────────────────────────────

EDITABLE_PRECONSULT_STATES = ("consent_pending", "data_collection")


@router.get("/{appt_id}/preconsult", response_model=dict, dependencies=[Depends(_hw())])
def get_preconsult(appt_id: int, db: Session = Depends(db_dep)):
    appt = _appt(db, appt_id)
    pre = db.scalar(select(Preconsultation).where(Preconsultation.appointment_id == appt_id))
    return {
        "preconsult": PreconsultOut.model_validate(pre).model_dump() if pre else None,
        "appointment": AppointmentOut.model_validate(appt).model_dump(),
        "editable": appt.status in EDITABLE_PRECONSULT_STATES,
    }


@router.put("/{appt_id}/preconsult", response_model=dict, dependencies=[Depends(_hw())])
def upsert_preconsult(appt_id: int, payload: PreconsultIn, db: Session = Depends(db_dep)):
    appt = _appt(db, appt_id)
    if appt.status not in EDITABLE_PRECONSULT_STATES:
        raise conflict("preconsult_locked", currentStatus=appt.status)

    consent = _latest_session_consent(db, appt_id)
    if not consent or not consent.agreed:
        raise conflict("session_consent_required")

    if not _master_consent_active(db, appt.patient_id):
        raise conflict("master_consent_required")

    pre = db.scalar(select(Preconsultation).where(Preconsultation.appointment_id == appt_id))
    if not pre:
        pre = Preconsultation(appointment_id=appt_id)
        db.add(pre)

    if payload.height is not None:
        pre.height = payload.height
    if payload.weight is not None:
        pre.weight = payload.weight
    if payload.sysBp is not None:
        pre.systolic = payload.sysBp
    if payload.diaBp is not None:
        pre.diastolic = payload.diaBp
    if payload.pulse is not None:
        pre.pulse = payload.pulse
    if payload.temperature is not None:
        pre.temperature = Decimal(str(payload.temperature))
    # FEEDBACK §2: explicit None-check lets a HW clear the complaint by
    # sending an empty string; sending null leaves the existing value alone.
    if payload.primaryComplaint is not None:
        pre.primary_complaint = payload.primaryComplaint or None
    pre.submitted_at = datetime.now(timezone.utc)

    if appt.status == "consent_pending":
        appt.status = "data_collection"

    db.commit()
    db.refresh(pre)
    db.refresh(appt)
    return {
        "preconsult": PreconsultOut.model_validate(pre).model_dump(),
        "appointment": AppointmentOut.model_validate(appt).model_dump(),
    }


# ── Meeting transitions ──────────────────────────────────────────────

def _full_name(given: str | None, family: str | None) -> str:
    return " ".join(part for part in (given, family) if part).strip()


def _hw_token_for(db: Session, appt: Appointment, user: CurrentUser) -> dict:
    # Healthworker joins the call alongside the patient — the doctor sees the
    # patient's name on the tile, since the patient is not a software user.
    patient = db.get(Patient, appt.patient_id)
    display = _full_name(patient.given_name, patient.family_name) if patient else "Patient"
    jwt, server_url = mint_token(
        room=room_for_appointment(appt.appointment_id),
        identity=f"hw-{user.username}",
        name=display or "Patient",
    )
    return {"room": room_for_appointment(appt.appointment_id), "token": jwt, "serverUrl": server_url}


def _doctor_token_for(db: Session, appt: Appointment, user: CurrentUser) -> dict:
    doctor = db.get(Doctor, appt.doctor_id)
    if not doctor or doctor.username != user.username:
        raise forbidden()
    display = _full_name(doctor.given_name, doctor.family_name) or doctor.username
    jwt, server_url = mint_token(
        room=room_for_appointment(appt.appointment_id),
        identity=f"doctor-{doctor.doctor_id}",
        name=display,
    )
    return {"room": room_for_appointment(appt.appointment_id), "token": jwt, "serverUrl": server_url}


@router.post("/{appt_id}/start-meeting", response_model=dict, dependencies=[Depends(_hw())])
def start_meeting(
    appt_id: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
):
    appt = _appt(db, appt_id)
    if appt.status != "data_collection":
        raise conflict("invalid_state", currentStatus=appt.status)
    appt.status = "in_progress"
    db.commit()
    db.refresh(appt)
    return {
        "appointment": AppointmentOut.model_validate(appt).model_dump(),
        **_hw_token_for(db, appt, user),
    }


@router.post("/{appt_id}/meeting-token", response_model=dict)
def meeting_token(
    appt_id: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
):
    appt = _appt(db, appt_id)
    if appt.status not in ("data_collection", "in_progress"):
        raise conflict("invalid_state", currentStatus=appt.status)

    if user.role == "healthworker":
        return _hw_token_for(db, appt, user)
    if user.role == "doctor":
        return _doctor_token_for(db, appt, user)
    raise forbidden()


@router.post("/{appt_id}/end-meeting", response_model=AppointmentOut, dependencies=[Depends(_hw())])
def end_meeting(appt_id: int, db: Session = Depends(db_dep)) -> AppointmentOut:
    appt = _appt(db, appt_id)
    if appt.status != "in_progress":
        raise conflict("invalid_state", currentStatus=appt.status)
    appt.status = "awaiting_notes"
    db.commit()
    db.refresh(appt)
    return AppointmentOut.model_validate(appt)
