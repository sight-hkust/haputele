from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..deps import CurrentUser, current_user, db_dep, require_role
from ..errors import conflict, forbidden, not_found
from ..dateutils import snap_to_monday
from ..models import (
    Appointment,
    AppointmentAttachment,
    Consent,
    Consultation,
    Doctor,
    Patient,
    Preconsultation,
    Profile,
    QueueEntry,
)
from ..schemas import (
    AppointmentCancelIn,
    AppointmentCreate,
    AppointmentDetailOut,
    AppointmentOut,
    AppointmentUpdate,
    AttachmentMetaOut,
    CalendarAppointmentOut,
    ConsultationOut,
    PatientOut,
    PreconsultOut,
    ProfileOut,
    QueueEntryOut,
)


router = APIRouter(prefix="/appointments", tags=["appointments"])


LIVE_STATES = (
    "scheduled",
    "consent_pending",
    "data_collection",
    "in_progress",
    "awaiting_notes",
)
TERMINAL = ("completed", "cancelled")


def _doctor_for_user(db: Session, user: CurrentUser) -> Doctor:
    d = db.scalar(select(Doctor).where(Doctor.username == user.username))
    if not d:
        raise forbidden("doctor_profile_missing")
    return d


def _get_appt(db: Session, aid: int) -> Appointment:
    a = db.get(Appointment, aid)
    if not a:
        raise not_found("appointment_not_found")
    return a


def _scope_appt_for_user(db: Session, appt: Appointment, user: CurrentUser) -> None:
    if user.role == "doctor":
        d = _doctor_for_user(db, user)
        if appt.doctor_id != d.doctor_id:
            raise forbidden("not_your_appointment")


def _slot_taken(db: Session, doctor_id: int, scheduled_at: datetime, exclude_id: int | None = None) -> bool:
    stmt = select(Appointment).where(
        and_(
            Appointment.doctor_id == doctor_id,
            Appointment.scheduled_at == scheduled_at,
            Appointment.status != "cancelled",
        )
    )
    if exclude_id is not None:
        stmt = stmt.where(Appointment.appointment_id != exclude_id)
    return db.scalar(stmt) is not None


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role("healthworker"))])
def create_appointment(payload: AppointmentCreate, db: Session = Depends(db_dep)) -> AppointmentOut:
    patient = db.get(Patient, payload.patientId)
    if not patient or patient.deleted_at is not None:
        raise not_found("patient_not_found")
    doctor = db.get(Doctor, payload.doctorId)
    if not doctor or not doctor.active:
        raise not_found("doctor_not_found")
    if _slot_taken(db, payload.doctorId, payload.scheduledAt):
        raise conflict("doctor_slot_taken")

    appt = Appointment(
        patient_id=payload.patientId,
        doctor_id=payload.doctorId,
        scheduled_at=payload.scheduledAt,
        status="scheduled",
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return AppointmentOut.model_validate(appt)


@router.get("", response_model=list[CalendarAppointmentOut])
def list_appointments(
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    status_: Optional[str] = Query(default=None, alias="status"),
    patientId: Optional[int] = None,
    doctorId: Optional[int] = None,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
):
    if user.role == "doctor":
        doctorId = _doctor_for_user(db, user).doctor_id
    elif user.role not in ("admin", "healthworker"):
        raise forbidden()

    stmt = (
        select(Appointment, Patient, Doctor)
        .join(Patient, Patient.patient_id == Appointment.patient_id)
        .join(Doctor, Doctor.doctor_id == Appointment.doctor_id)
    )
    if from_:
        stmt = stmt.where(Appointment.scheduled_at >= from_)
    if to:
        stmt = stmt.where(Appointment.scheduled_at <= to)
    if status_:
        stmt = stmt.where(Appointment.status == status_)
    if patientId is not None:
        stmt = stmt.where(Appointment.patient_id == patientId)
    if doctorId is not None:
        stmt = stmt.where(Appointment.doctor_id == doctorId)
    rows = db.execute(stmt.order_by(Appointment.scheduled_at)).all()

    out: list[CalendarAppointmentOut] = []
    for appt, patient, doctor in rows:
        base = AppointmentOut.model_validate(appt).model_dump()
        out.append(
            CalendarAppointmentOut(
                **base,
                patientName=f"{patient.given_name} {patient.family_name}",
                doctorName=f"Dr. {doctor.given_name} {doctor.family_name}",
            )
        )
    return out


@router.get("/{appt_id}", response_model=AppointmentDetailOut)
def get_appointment(appt_id: int, db: Session = Depends(db_dep),
                    user: CurrentUser = Depends(current_user)) -> AppointmentDetailOut:
    if user.role not in ("admin", "doctor", "healthworker"):
        raise forbidden()
    appt = _get_appt(db, appt_id)
    _scope_appt_for_user(db, appt, user)

    patient = db.get(Patient, appt.patient_id)
    profile = db.scalar(select(Profile).where(Profile.patient_id == appt.patient_id)) if patient else None
    pre = db.scalar(select(Preconsultation).where(Preconsultation.appointment_id == appt_id))
    consult = db.scalar(select(Consultation).where(Consultation.appointment_id == appt_id))
    attachments = db.scalars(
        select(AppointmentAttachment)
        .where(AppointmentAttachment.appointment_id == appt_id)
        .order_by(AppointmentAttachment.uploaded_at)
    ).all()

    master_status: str = "ok"
    if patient and patient.master_consent_id:
        mc = db.get(Consent, patient.master_consent_id)
        # FEEDBACK §1: an unsigned legacy consent flips the gate to
        # needs_reconsent so the HW re-records it with a signature on the
        # next visit. The CHECK grandfathers the row at the DB level; the
        # gate is enforced by the application here.
        if (
            not mc
            or mc.revoked_at is not None
            or not mc.agreed
            or mc.signature_key is None
        ):
            master_status = "needs_reconsent"
    else:
        master_status = "needs_reconsent"

    return AppointmentDetailOut(
        appointment=AppointmentOut.model_validate(appt),
        patient=PatientOut.model_validate(patient) if patient else None,
        profile=ProfileOut.model_validate(profile) if profile else None,
        preconsult=PreconsultOut.model_validate(pre) if pre else None,
        consultation=ConsultationOut.from_row(consult) if consult else None,
        masterConsentStatus=master_status,
        attachments=[AttachmentMetaOut.model_validate(a) for a in attachments],
    )


@router.patch("/{appt_id}", response_model=AppointmentOut,
              dependencies=[Depends(require_role("healthworker"))])
def update_appointment(appt_id: int, payload: AppointmentUpdate, db: Session = Depends(db_dep)) -> AppointmentOut:
    appt = _get_appt(db, appt_id)
    if appt.status in TERMINAL:
        raise conflict("invalid_state", currentStatus=appt.status)

    new_doctor = appt.doctor_id if payload.doctorId is None else payload.doctorId
    new_time = appt.scheduled_at if payload.scheduledAt is None else payload.scheduledAt
    if payload.doctorId is not None:
        d = db.get(Doctor, payload.doctorId)
        if not d or not d.active:
            raise not_found("doctor_not_found")
    if (new_doctor, new_time) != (appt.doctor_id, appt.scheduled_at):
        if _slot_taken(db, new_doctor, new_time, exclude_id=appt.appointment_id):
            raise conflict("doctor_slot_taken")
    appt.doctor_id = new_doctor
    appt.scheduled_at = new_time
    db.commit()
    db.refresh(appt)
    return AppointmentOut.model_validate(appt)


@router.post("/{appt_id}/cancel", response_model=dict,
             dependencies=[Depends(require_role("healthworker"))])
def cancel_appointment(appt_id: int, payload: AppointmentCancelIn,
                       db: Session = Depends(db_dep),
                       user: CurrentUser = Depends(current_user)):
    appt = _get_appt(db, appt_id)
    if appt.status == "completed":
        raise conflict("invalid_state", currentStatus=appt.status)

    now = datetime.now(timezone.utc)
    appt.status = "cancelled"
    appt.cancellation_reason = payload.reason

    # Auto-cancel any queue entry that booked this appointment, so the
    # pending list stays clean. The original entry's audit trail remains
    # intact (status='cancelled', cancellation_reason='appointment_cancelled').
    # Re-queueing — if HW wants it — happens via the optional `requeue` block
    # below and creates a fresh entry, regardless of how the original
    # appointment was created.
    linked = db.scalars(
        select(QueueEntry).where(
            QueueEntry.appointment_id == appt_id,
            QueueEntry.status == "booked",
        )
    ).all()
    for entry in linked:
        entry.status = "cancelled"
        entry.cancelled_at = now
        entry.cancellation_reason = "appointment_cancelled"

    new_entry: QueueEntry | None = None
    if payload.requeue is not None:
        rq = payload.requeue
        if rq.preferredDoctorId is not None:
            d = db.get(Doctor, rq.preferredDoctorId)
            if not d or not d.active:
                raise not_found("doctor_not_found")
        new_entry = QueueEntry(
            patient_id=appt.patient_id,
            source=rq.source,
            priority=rq.priority,
            preferred_doctor_id=rq.preferredDoctorId if rq.preferredDoctorId is not None else appt.doctor_id,
            target_date=snap_to_monday(rq.targetDate),
            notes=rq.notes,
            source_meta={**rq.sourceMeta, "fromCancelledAppointmentId": appt_id},
            created_by=user.username,
        )
        db.add(new_entry)

    db.commit()
    db.refresh(appt)
    out: dict = {"appointment": AppointmentOut.model_validate(appt).model_dump(mode="json")}
    if new_entry is not None:
        db.refresh(new_entry)
        out["queueEntry"] = QueueEntryOut.model_validate(new_entry).model_dump(mode="json")
    return out
