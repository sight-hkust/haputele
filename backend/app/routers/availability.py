from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import CurrentUser, current_user, db_dep
from ..errors import forbidden, not_found, unprocessable
from ..models import Doctor, DoctorAvailability
from ..schemas import (
    AvailabilityBulkCreate,
    AvailabilityCreate,
    AvailabilityOut,
    AvailabilityUpdate,
)


# Two routers — one nested under /doctors for collection ops, one flat for
# single-row + cross-doctor reads. Mirrors the consultations.py split.
doctor_router = APIRouter(prefix="/doctors", tags=["availability"])
flat_router = APIRouter(prefix="/availability", tags=["availability"])


MAX_RANGE = timedelta(days=92)


def _doctor_for_user(db: Session, user: CurrentUser) -> Doctor:
    d = db.scalar(select(Doctor).where(Doctor.username == user.username))
    if not d:
        raise forbidden("doctor_profile_missing")
    return d


def _can_write_for(db: Session, user: CurrentUser, doctor_id: int) -> None:
    """A doctor may only write their own; healthworker may write any."""
    if user.role == "healthworker":
        return
    if user.role == "doctor":
        d = _doctor_for_user(db, user)
        if d.doctor_id != doctor_id:
            raise forbidden("not_your_availability")
        return
    raise forbidden()


def _can_read_for(db: Session, user: CurrentUser, doctor_id: int) -> None:
    if user.role in ("admin", "healthworker"):
        return
    if user.role == "doctor":
        d = _doctor_for_user(db, user)
        if d.doctor_id != doctor_id:
            raise forbidden("not_your_availability")
        return
    raise forbidden()


def _check_window(start_at: datetime, end_at: datetime) -> None:
    if end_at <= start_at:
        raise unprocessable("invalid_time_range")


def _require_doctor(db: Session, doctor_id: int) -> Doctor:
    d = db.get(Doctor, doctor_id)
    if not d or not d.active:
        raise not_found("doctor_not_found")
    return d


def _month_range(now: datetime) -> tuple[datetime, datetime]:
    """Default range when caller omits ?from / ?to — start of current UTC
    month through start of next month."""
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _resolve_range(
    from_: Optional[datetime], to: Optional[datetime]
) -> tuple[datetime, datetime]:
    if from_ is None and to is None:
        return _month_range(datetime.now(timezone.utc))
    if from_ is None or to is None:
        raise unprocessable("range_required")
    if to <= from_:
        raise unprocessable("invalid_time_range")
    if to - from_ > MAX_RANGE:
        raise unprocessable("range_too_wide", maxDays=MAX_RANGE.days)
    return from_, to


# ── Per-doctor collection ─────────────────────────────────────────────


@doctor_router.post(
    "/{doctor_id}/availability",
    response_model=AvailabilityOut,
    status_code=status.HTTP_201_CREATED,
)
def create_availability(
    doctor_id: int,
    payload: AvailabilityCreate,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> AvailabilityOut:
    _can_write_for(db, user, doctor_id)
    _require_doctor(db, doctor_id)
    _check_window(payload.startAt, payload.endAt)

    row = DoctorAvailability(
        doctor_id=doctor_id,
        start_at=payload.startAt,
        end_at=payload.endAt,
        note=payload.note,
        created_by=user.username,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AvailabilityOut.model_validate(row)


@doctor_router.post(
    "/{doctor_id}/availability/bulk",
    response_model=list[AvailabilityOut],
    status_code=status.HTTP_201_CREATED,
)
def create_availability_bulk(
    doctor_id: int,
    payload: AvailabilityBulkCreate,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> list[AvailabilityOut]:
    _can_write_for(db, user, doctor_id)
    _require_doctor(db, doctor_id)
    for w in payload.windows:
        _check_window(w.startAt, w.endAt)

    rows = [
        DoctorAvailability(
            doctor_id=doctor_id,
            start_at=w.startAt,
            end_at=w.endAt,
            note=w.note,
            created_by=user.username,
        )
        for w in payload.windows
    ]
    db.add_all(rows)
    db.commit()
    for r in rows:
        db.refresh(r)
    return [AvailabilityOut.model_validate(r) for r in rows]


@doctor_router.get(
    "/{doctor_id}/availability",
    response_model=list[AvailabilityOut],
)
def list_doctor_availability(
    doctor_id: int,
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> list[AvailabilityOut]:
    _can_read_for(db, user, doctor_id)
    _require_doctor(db, doctor_id)
    start, end = _resolve_range(from_, to)

    stmt = (
        select(DoctorAvailability)
        .where(
            DoctorAvailability.doctor_id == doctor_id,
            DoctorAvailability.start_at < end,
            DoctorAvailability.end_at > start,
        )
        .order_by(DoctorAvailability.start_at)
    )
    rows = db.scalars(stmt).all()
    return [AvailabilityOut.model_validate(r) for r in rows]


@doctor_router.delete(
    "/{doctor_id}/availability",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_doctor_availability_range(
    doctor_id: int,
    from_: datetime = Query(alias="from"),
    to: datetime = Query(...),
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
):
    """Delete every availability window for this doctor that overlaps the
    given range. Used by the week-grid editor to atomically replace a
    week's windows in one call (paired with the bulk-create endpoint)."""
    _can_write_for(db, user, doctor_id)
    _require_doctor(db, doctor_id)
    if to <= from_:
        raise unprocessable("invalid_time_range")
    if to - from_ > MAX_RANGE:
        raise unprocessable("range_too_wide", maxDays=MAX_RANGE.days)

    rows = db.scalars(
        select(DoctorAvailability).where(
            DoctorAvailability.doctor_id == doctor_id,
            DoctorAvailability.start_at < to,
            DoctorAvailability.end_at > from_,
        )
    ).all()
    for r in rows:
        db.delete(r)
    db.commit()
    return None


# ── Single-row + cross-doctor ─────────────────────────────────────────


@flat_router.get("", response_model=list[AvailabilityOut])
def list_availability(
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    doctorId: Optional[int] = None,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> list[AvailabilityOut]:
    if user.role == "doctor":
        # Doctors only see their own; ignore any client-supplied doctorId.
        doctorId = _doctor_for_user(db, user).doctor_id
    elif user.role not in ("admin", "healthworker"):
        raise forbidden()

    start, end = _resolve_range(from_, to)
    stmt = (
        select(DoctorAvailability)
        .where(
            DoctorAvailability.start_at < end,
            DoctorAvailability.end_at > start,
        )
        .order_by(DoctorAvailability.start_at)
    )
    if doctorId is not None:
        stmt = stmt.where(DoctorAvailability.doctor_id == doctorId)
    rows = db.scalars(stmt).all()
    return [AvailabilityOut.model_validate(r) for r in rows]


def _get_row(db: Session, aid: int) -> DoctorAvailability:
    row = db.get(DoctorAvailability, aid)
    if not row:
        raise not_found("availability_not_found")
    return row


@flat_router.patch("/{aid}", response_model=AvailabilityOut)
def update_availability(
    aid: int,
    payload: AvailabilityUpdate,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> AvailabilityOut:
    row = _get_row(db, aid)
    _can_write_for(db, user, row.doctor_id)

    new_start = payload.startAt if payload.startAt is not None else row.start_at
    new_end = payload.endAt if payload.endAt is not None else row.end_at
    _check_window(new_start, new_end)

    row.start_at = new_start
    row.end_at = new_end
    if "note" in payload.model_dump(exclude_unset=True):
        row.note = payload.note
    db.commit()
    db.refresh(row)
    return AvailabilityOut.model_validate(row)


@flat_router.delete("/{aid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_availability(
    aid: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
):
    row = _get_row(db, aid)
    _can_write_for(db, user, row.doctor_id)
    db.delete(row)
    db.commit()
    return None
