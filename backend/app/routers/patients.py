from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..deps import db_dep, require_role
from ..errors import not_found, unprocessable
from ..models import Appointment, Consent, Consultation, Patient, Profile
from ..services.signature import decode_signature
from ..services.system_config import get_system_config
from ..schemas import (
    AppointmentOut,
    ConsentOut,
    HistoryConsultationItem,
    PatientCreate,
    PatientHistoryOut,
    PatientOut,
    PatientUpdate,
    ProfileIn,
    ProfileOut,
    ReConsentIn,
    RevokeConsentIn,
)


router = APIRouter(prefix="/patients", tags=["patients"])


def _hw_or_doctor():
    return require_role("healthworker", "doctor")


def _hw_only():
    return require_role("healthworker")


def _live_patient(db: Session, pid: int) -> Patient:
    p = db.get(Patient, pid)
    if not p or p.deleted_at is not None:
        raise not_found("patient_not_found")
    return p


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(_hw_only())])
def create_patient(payload: PatientCreate, db: Session = Depends(db_dep)):
    if not payload.masterConsent.agreed:
        raise unprocessable("master_consent_not_agreed")

    # FEEDBACK §1: an "agreed" click is not defensible by itself — capture a
    # signature alongside the consent record before the patient row exists.
    signature_bytes = decode_signature(payload.masterConsent.signatureImage)

    if payload.nationalId:
        existing = db.scalar(select(Patient).where(Patient.n_id == payload.nationalId))
        if existing:
            raise unprocessable("national_id_taken")

    patient = Patient(
        given_name=payload.given,
        family_name=payload.family,
        dob=payload.dob,
        gender=payload.gender,
        plang=payload.language,
        screening_ref=payload.screeningRef,
        n_id=payload.nationalId,
        contact=payload.contact,
        address=payload.address,
    )
    db.add(patient)
    db.flush()  # get patient_id

    consent = Consent(
        patient_id=patient.patient_id,
        scope="master",
        version=payload.masterConsent.version or get_system_config().master_consent_version,
        agreed=True,
        captured_at=payload.masterConsent.capturedAt or datetime.now(timezone.utc),
        signature_image=signature_bytes,
        signature_method="signature",
    )
    db.add(consent)
    db.flush()

    patient.master_consent_id = consent.consent_id

    profile = Profile(patient_id=patient.patient_id)
    db.add(profile)

    db.commit()
    db.refresh(patient)
    db.refresh(consent)

    return {
        "patient": PatientOut.model_validate(patient).model_dump(),
        "masterConsent": ConsentOut.model_validate(consent).model_dump(),
    }


@router.get("", response_model=dict, dependencies=[Depends(_hw_or_doctor())])
def list_patients(
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(db_dep),
):
    stmt = select(Patient).where(Patient.deleted_at.is_(None))
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                Patient.given_name.ilike(like),
                Patient.family_name.ilike(like),
                Patient.n_id.ilike(like),
            )
        )
    stmt = stmt.order_by(Patient.patient_id.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.scalars(stmt).all()
    return {
        "patients": [PatientOut.model_validate(r).model_dump() for r in rows],
        "page": page,
    }


@router.get("/{patient_id}", response_model=dict,
            dependencies=[Depends(_hw_or_doctor())])
def get_patient(patient_id: int, db: Session = Depends(db_dep)):
    p = _live_patient(db, patient_id)
    profile = db.scalar(select(Profile).where(Profile.patient_id == patient_id))
    return {
        "patient": PatientOut.model_validate(p).model_dump(),
        "profile": ProfileOut.model_validate(profile).model_dump() if profile else None,
    }


@router.patch("/{patient_id}", response_model=PatientOut,
              dependencies=[Depends(_hw_only())])
def update_patient(patient_id: int, payload: PatientUpdate, db: Session = Depends(db_dep)) -> PatientOut:
    p = _live_patient(db, patient_id)
    field_map = {
        "given": "given_name",
        "family": "family_name",
        "dob": "dob",
        "gender": "gender",
        "language": "plang",
        "screeningRef": "screening_ref",
        "nationalId": "n_id",
        "contact": "contact",
        "address": "address",
    }
    for k, v in payload.model_dump(exclude_unset=True).items():
        col = field_map.get(k)
        if col is not None:
            setattr(p, col, v)
    db.commit()
    db.refresh(p)
    return PatientOut.model_validate(p)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(_hw_only())])
def delete_patient(patient_id: int, db: Session = Depends(db_dep)):
    p = _live_patient(db, patient_id)
    p.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return None


# ── Profile ──────────────────────────────────────────────────────────

@router.put("/{patient_id}/profile", response_model=ProfileOut,
            dependencies=[Depends(_hw_only())])
def upsert_profile(patient_id: int, payload: ProfileIn, db: Session = Depends(db_dep)) -> ProfileOut:
    _live_patient(db, patient_id)
    profile = db.scalar(select(Profile).where(Profile.patient_id == patient_id))
    if not profile:
        profile = Profile(patient_id=patient_id)
        db.add(profile)
    profile.diseases = [d.model_dump(exclude_none=True) for d in payload.diseaseHistory]
    profile.surgeries = [s.model_dump(exclude_none=True) for s in payload.surgicalHistory]
    profile.allergies = [a.model_dump(exclude_none=True) for a in payload.allergies]
    profile.existing_medications = [m.model_dump(exclude_none=True) for m in payload.medications]
    profile.smoking = payload.lifestyle.smoking
    profile.alcohol = payload.lifestyle.alcohol
    profile.occupation = payload.lifestyle.occupation
    profile.physical_activity = payload.lifestyle.physicalActivity
    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)
    return ProfileOut.model_validate(profile)


# ── History ──────────────────────────────────────────────────────────

@router.get("/{patient_id}/history", response_model=PatientHistoryOut,
            dependencies=[Depends(_hw_or_doctor())])
def patient_history(patient_id: int, db: Session = Depends(db_dep)) -> PatientHistoryOut:
    _live_patient(db, patient_id)
    appts = db.scalars(
        select(Appointment).where(Appointment.patient_id == patient_id).order_by(Appointment.scheduled_at.desc())
    ).all()
    consults = db.scalars(
        select(Consultation)
        .join(Appointment, Appointment.appointment_id == Consultation.appointment_id)
        .where(and_(Appointment.patient_id == patient_id, Consultation.status == "completed"))
        .order_by(Consultation.signed_at.desc())
    ).all()

    consult_items = [
        HistoryConsultationItem(
            consultationId=c.consultation_id,
            appointmentId=c.appointment_id,
            date=c.signed_at,
            diagnoses=c.diagnoses or [],
            prescription=c.medications or [],
            notes={
                "complaint": c.notes_complaint,
                "onset": c.notes_onset,
                "symptoms": c.notes_symptoms,
                "observations": c.notes_observations,
            },
        )
        for c in consults
    ]
    return PatientHistoryOut(
        appointments=[AppointmentOut.model_validate(a) for a in appts],
        consultations=consult_items,
    )


@router.get("/{patient_id}/consultations", response_model=list[HistoryConsultationItem],
            dependencies=[Depends(_hw_or_doctor())])
def patient_consultations(patient_id: int, db: Session = Depends(db_dep)) -> list[HistoryConsultationItem]:
    return patient_history(patient_id, db).consultations  # type: ignore[arg-type]


# ── Master consent (re-consent / revoke) ─────────────────────────────

@router.post("/{patient_id}/consents", response_model=dict, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(_hw_only())])
def re_consent(patient_id: int, payload: ReConsentIn, db: Session = Depends(db_dep)):
    p = _live_patient(db, patient_id)
    if not payload.agreed:
        raise unprocessable("master_consent_not_agreed")
    signature_bytes = decode_signature(payload.signatureImage)
    consent = Consent(
        patient_id=p.patient_id,
        scope="master",
        version=payload.version or get_system_config().master_consent_version,
        agreed=True,
        captured_at=payload.capturedAt or datetime.now(timezone.utc),
        signature_image=signature_bytes,
        signature_method="signature",
    )
    db.add(consent)
    db.flush()
    p.master_consent_id = consent.consent_id
    db.commit()
    db.refresh(consent)
    return {"masterConsent": ConsentOut.model_validate(consent).model_dump()}


@router.post("/{patient_id}/consents/revoke", response_model=dict,
             dependencies=[Depends(_hw_only())])
def revoke_consent(patient_id: int, payload: RevokeConsentIn, db: Session = Depends(db_dep)):
    p = _live_patient(db, patient_id)
    if not p.master_consent_id:
        raise unprocessable("no_active_master_consent")
    consent = db.get(Consent, p.master_consent_id)
    if not consent:
        raise unprocessable("no_active_master_consent")
    consent.revoked_at = datetime.now(timezone.utc)
    consent.reason = payload.reason
    db.commit()
    db.refresh(consent)
    return {"masterConsent": ConsentOut.model_validate(consent).model_dump()}
