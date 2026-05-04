from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import CurrentUser, current_user, db_dep, require_role
from ..errors import conflict, forbidden, not_found
from ..dateutils import snap_to_monday
from ..models import Appointment, Consultation, Doctor, QueueEntry
from ..routers.appointments import _slot_taken
from ..schemas import (
    AppointmentOut,
    ConsultationOut,
    ConsultationPatch,
    ConsultationSubmitIn,
    FollowUpAppointment,
    FollowUpWeeks,
)
from ..services.signature import decode_signature


def _doctor(db: Session, user: CurrentUser) -> Doctor:
    d = db.scalar(select(Doctor).where(Doctor.username == user.username))
    if not d:
        raise forbidden("doctor_profile_missing")
    return d


def _own_consultation(db: Session, cid: int, user: CurrentUser) -> tuple[Consultation, Appointment]:
    c = db.get(Consultation, cid)
    if not c:
        raise not_found("consultation_not_found")
    appt = db.get(Appointment, c.appointment_id)
    if not appt:
        raise not_found("appointment_not_found")
    if user.role == "doctor":
        d = _doctor(db, user)
        if appt.doctor_id != d.doctor_id:
            raise forbidden("not_your_consultation")
    return c, appt


# Per spec, draft creation lives under the appointment path.
appts_router = APIRouter(prefix="/appointments", tags=["consultations"])


@appts_router.post("/{appt_id}/consultation/draft", response_model=dict,
                   dependencies=[Depends(require_role("doctor"))])
def create_or_get_draft(appt_id: int, db: Session = Depends(db_dep),
                        user: CurrentUser = Depends(current_user)):
    appt = db.get(Appointment, appt_id)
    if not appt:
        raise not_found("appointment_not_found")
    d = _doctor(db, user)
    if appt.doctor_id != d.doctor_id:
        raise forbidden("not_your_appointment")
    if appt.status not in ("in_progress", "awaiting_notes"):
        raise conflict("invalid_state", currentStatus=appt.status)

    consult = db.scalar(select(Consultation).where(Consultation.appointment_id == appt_id))
    if not consult:
        consult = Consultation(appointment_id=appt_id, status="draft")
        db.add(consult)
        db.commit()
        db.refresh(consult)

    return {
        "consultationId": consult.consultation_id,
        "draft": ConsultationOut.from_row(consult).model_dump(),
    }


# Direct consultation routes
cons_router = APIRouter(prefix="/consultations", tags=["consultations"])


@cons_router.get("/{cid}", response_model=ConsultationOut,
                 dependencies=[Depends(require_role("doctor", "healthworker"))])
def get_consultation(cid: int, db: Session = Depends(db_dep),
                     user: CurrentUser = Depends(current_user)) -> ConsultationOut:
    c, _ = _own_consultation(db, cid, user)
    return ConsultationOut.from_row(c)


@cons_router.patch("/{cid}", response_model=ConsultationOut,
                   dependencies=[Depends(require_role("doctor"))])
def patch_consultation(cid: int, payload: ConsultationPatch, db: Session = Depends(db_dep),
                       user: CurrentUser = Depends(current_user)) -> ConsultationOut:
    c, _ = _own_consultation(db, cid, user)
    if c.status == "completed":
        raise conflict("consultation_locked")

    if payload.notes is not None:
        notes = payload.notes
        if notes.complaint is not None:
            c.notes_complaint = notes.complaint
        if notes.onset is not None:
            c.notes_onset = notes.onset
        if notes.symptoms is not None:
            c.notes_symptoms = notes.symptoms
        if notes.observations is not None:
            c.notes_observations = notes.observations

    if payload.diagnoses is not None:
        c.diagnoses = [d.model_dump(exclude_none=True) for d in payload.diagnoses]

    if payload.medications is not None:
        c.medications = [m.model_dump(exclude_none=True) for m in payload.medications]

    if payload.labs is not None:
        c.labs = [l.model_dump(exclude_none=True) for l in payload.labs]
    if payload.referrals is not None:
        c.referrals = [r.model_dump(exclude_none=True) for r in payload.referrals]

    db.commit()
    db.refresh(c)
    return ConsultationOut.from_row(c)


@cons_router.post("/{cid}/submit", response_model=dict,
                  dependencies=[Depends(require_role("doctor"))])
def submit_consultation(cid: int, payload: ConsultationSubmitIn, db: Session = Depends(db_dep),
                        user: CurrentUser = Depends(current_user)):
    c, appt = _own_consultation(db, cid, user)
    if c.status != "draft":
        raise conflict("consultation_locked")
    # decode_signature raises signature_required / invalid_signature_format /
    # signature_too_large depending on what's wrong with the payload.
    signature_bytes = decode_signature(payload.signature)
    # Doctor may submit while the meeting is still live (in_progress) or after
    # the healthworker has ended it (awaiting_notes). The submit itself
    # finalizes the appointment; we don't make the doctor wait on the HW.
    if appt.status not in ("in_progress", "awaiting_notes"):
        raise conflict("invalid_state", currentStatus=appt.status)

    signed_at = datetime.now(timezone.utc)
    follow_up_appt: Appointment | None = None
    follow_up_queue: QueueEntry | None = None

    if isinstance(payload.followUp, FollowUpAppointment):
        # Doctor books an exact follow-up appointment for themselves.
        if _slot_taken(db, appt.doctor_id, payload.followUp.scheduledAt):
            raise conflict("doctor_slot_taken")
        follow_up_appt = Appointment(
            patient_id=appt.patient_id,
            doctor_id=appt.doctor_id,
            scheduled_at=payload.followUp.scheduledAt,
            status="scheduled",
        )
        db.add(follow_up_appt)
        db.flush()
        c.follow_up_date = payload.followUp.scheduledAt.date()
        c.follow_up_appointment_id = follow_up_appt.appointment_id
    elif isinstance(payload.followUp, FollowUpWeeks):
        # Doctor recommends N weeks; create a follow-up queue entry.
        # Snap to Monday-of-week so the queue's target_date reads as
        # "the week of …" — the doctor's intent is fuzzy by N-week semantics.
        target = snap_to_monday(signed_at.date() + timedelta(weeks=payload.followUp.weeks))
        c.follow_up_date = target
        c.follow_up_weeks = payload.followUp.weeks
        follow_up_queue = QueueEntry(
            patient_id=appt.patient_id,
            source="follow_up",
            preferred_doctor_id=appt.doctor_id,
            target_date=target,
            source_meta={
                "sourceConsultationId": c.consultation_id,
                "followUpWeeks": payload.followUp.weeks,
            },
            created_by=user.username,
        )
        db.add(follow_up_queue)
        db.flush()

    c.signature = signature_bytes
    c.signed_at = signed_at
    c.status = "completed"
    appt.status = "completed"
    db.commit()
    db.refresh(c)
    db.refresh(appt)
    out: dict = {
        "consultation": ConsultationOut.from_row(c).model_dump(mode="json"),
        "appointment": AppointmentOut.model_validate(appt).model_dump(mode="json"),
    }
    if follow_up_appt is not None:
        db.refresh(follow_up_appt)
        out["followUpAppointment"] = AppointmentOut.model_validate(follow_up_appt).model_dump(mode="json")
    if follow_up_queue is not None:
        from ..schemas import QueueEntryOut  # local import to avoid cycle at import time
        db.refresh(follow_up_queue)
        out["followUpQueueEntry"] = QueueEntryOut.model_validate(follow_up_queue).model_dump(mode="json")
    return out
