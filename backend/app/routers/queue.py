from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dateutils import snap_to_monday
from ..deps import CurrentUser, current_user, db_dep, require_role
from ..errors import conflict, not_found, unprocessable
from ..models import Appointment, Doctor, Patient, QueueEntry
from ..routers.appointments import _slot_taken
from ..schemas import (
    AppointmentOut,
    QueueBookIn,
    QueueCancelIn,
    QueueEntryCreate,
    QueueEntryOut,
    QueueEntryUpdate,
)


router = APIRouter(prefix="/queue", tags=["queue"])


def _get_entry(db: Session, qid: int) -> QueueEntry:
    e = db.get(QueueEntry, qid)
    if not e:
        raise not_found("queue_entry_not_found")
    return e


def _existing_pending(db: Session, patient_id: int, source: str) -> list[QueueEntry]:
    return list(
        db.scalars(
            select(QueueEntry).where(
                QueueEntry.patient_id == patient_id,
                QueueEntry.source == source,
                QueueEntry.status == "pending",
            )
        ).all()
    )


@router.post("", response_model=QueueEntryOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role("healthworker"))])
def create_queue_entry(payload: QueueEntryCreate, db: Session = Depends(db_dep),
                       user: CurrentUser = Depends(current_user)) -> QueueEntryOut:
    # 'follow_up' entries are server-generated only — created inside
    # consultation submit, never by a manual POST.
    if payload.source == "follow_up":
        raise unprocessable("follow_up_source_reserved")

    patient = db.get(Patient, payload.patientId)
    if not patient or patient.deleted_at is not None:
        raise not_found("patient_not_found")
    # Consent-first: a registered patient implies a master consent row was
    # written in the same transaction as POST /patients (§3). No extra check.

    if payload.preferredDoctorId is not None:
        d = db.get(Doctor, payload.preferredDoctorId)
        if not d or not d.active:
            raise not_found("doctor_not_found")

    if not payload.force:
        existing = _existing_pending(db, payload.patientId, payload.source)
        if existing:
            raise conflict(
                "duplicate_pending",
                existing=[QueueEntryOut.model_validate(e).model_dump(mode="json") for e in existing],
            )

    entry = QueueEntry(
        patient_id=payload.patientId,
        source=payload.source,
        priority=payload.priority,
        preferred_doctor_id=payload.preferredDoctorId,
        target_date=snap_to_monday(payload.targetDate),
        notes=payload.notes,
        source_meta=payload.sourceMeta,
        created_by=user.username,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return QueueEntryOut.model_validate(entry)


@router.get("", response_model=list[QueueEntryOut])
def list_queue(
    status_: Optional[str] = Query(default=None, alias="status"),
    source: Optional[str] = None,
    priority: Optional[str] = None,
    preferredDoctorId: Optional[int] = None,
    patientId: Optional[int] = None,
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    db: Session = Depends(db_dep),
    _user: CurrentUser = Depends(require_role("admin", "healthworker")),
) -> list[QueueEntryOut]:
    stmt = select(QueueEntry).order_by(
        # urgent first, then nearest target_date, then oldest first
        QueueEntry.priority.desc(),  # 'urgent' > 'routine' lexicographically
        QueueEntry.target_date.asc().nullslast(),
        QueueEntry.created_at.asc(),
    )
    if status_:
        stmt = stmt.where(QueueEntry.status == status_)
    if source:
        stmt = stmt.where(QueueEntry.source == source)
    if priority:
        stmt = stmt.where(QueueEntry.priority == priority)
    if preferredDoctorId is not None:
        stmt = stmt.where(QueueEntry.preferred_doctor_id == preferredDoctorId)
    if patientId is not None:
        stmt = stmt.where(QueueEntry.patient_id == patientId)
    if from_:
        stmt = stmt.where(QueueEntry.created_at >= from_)
    if to:
        stmt = stmt.where(QueueEntry.created_at <= to)
    rows = db.scalars(stmt).all()
    return [QueueEntryOut.model_validate(r) for r in rows]


@router.get("/{qid}", response_model=QueueEntryOut,
            dependencies=[Depends(require_role("admin", "healthworker"))])
def get_queue_entry(qid: int, db: Session = Depends(db_dep)) -> QueueEntryOut:
    return QueueEntryOut.model_validate(_get_entry(db, qid))


@router.patch("/{qid}", response_model=QueueEntryOut,
              dependencies=[Depends(require_role("healthworker"))])
def update_queue_entry(qid: int, payload: QueueEntryUpdate,
                       db: Session = Depends(db_dep)) -> QueueEntryOut:
    entry = _get_entry(db, qid)
    if entry.status != "pending":
        raise conflict("queue_not_pending", currentStatus=entry.status)

    data = payload.model_dump(exclude_unset=True)
    if "preferredDoctorId" in data and data["preferredDoctorId"] is not None:
        d = db.get(Doctor, data["preferredDoctorId"])
        if not d or not d.active:
            raise not_found("doctor_not_found")
    field_map = {
        "priority": "priority",
        "preferredDoctorId": "preferred_doctor_id",
        "targetDate": "target_date",
        "notes": "notes",
        "sourceMeta": "source_meta",
    }
    for k, v in data.items():
        col = field_map.get(k)
        if col is not None:
            if k == "targetDate":
                v = snap_to_monday(v)
            setattr(entry, col, v)
    db.commit()
    db.refresh(entry)
    return QueueEntryOut.model_validate(entry)


@router.post("/{qid}/book", response_model=dict,
             dependencies=[Depends(require_role("healthworker"))])
def book_queue_entry(qid: int, payload: QueueBookIn, db: Session = Depends(db_dep)):
    entry = _get_entry(db, qid)
    if entry.status != "pending":
        raise conflict("queue_not_pending", currentStatus=entry.status)

    doctor = db.get(Doctor, payload.doctorId)
    if not doctor or not doctor.active:
        raise not_found("doctor_not_found")
    if _slot_taken(db, payload.doctorId, payload.scheduledAt):
        raise conflict("doctor_slot_taken")

    appt = Appointment(
        patient_id=entry.patient_id,
        doctor_id=payload.doctorId,
        scheduled_at=payload.scheduledAt,
        status="scheduled",
    )
    db.add(appt)
    db.flush()  # get appt.appointment_id without committing

    entry.status = "booked"
    entry.appointment_id = appt.appointment_id
    entry.booked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(entry)
    db.refresh(appt)
    return {
        "queueEntry": QueueEntryOut.model_validate(entry).model_dump(mode="json"),
        "appointment": AppointmentOut.model_validate(appt).model_dump(mode="json"),
    }


@router.post("/{qid}/cancel", response_model=QueueEntryOut,
             dependencies=[Depends(require_role("healthworker"))])
def cancel_queue_entry(qid: int, payload: QueueCancelIn,
                       db: Session = Depends(db_dep)) -> QueueEntryOut:
    entry = _get_entry(db, qid)
    if entry.status != "pending":
        raise conflict("queue_not_pending", currentStatus=entry.status)
    entry.status = "cancelled"
    entry.cancelled_at = datetime.now(timezone.utc)
    entry.cancellation_reason = payload.reason
    db.commit()
    db.refresh(entry)
    return QueueEntryOut.model_validate(entry)
