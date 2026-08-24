from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from threading import Barrier

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.deps import CurrentUser
from app.routers import appointments as appointments_router
from app.routers import consultations as consultations_router
from app.routers.queue import book_queue_entry
from app.schemas import (
    AppointmentCreate,
    ConsultationSubmitIn,
    FollowUpAppointment,
    QueueBookIn,
)


@pytest.fixture
def booking_records(seeded_doctor, healthworker_account):
    from app.database import SessionLocal
    from app.models import Patient, QueueEntry

    db = SessionLocal()
    try:
        patient = Patient(
            given_name="Concurrency",
            family_name="Patient",
            gender="female",
        )
        db.add(patient)
        db.flush()
        queue_entry = QueueEntry(
            patient_id=patient.patient_id,
            source="walk_in",
            created_by=healthworker_account[0],
        )
        db.add(queue_entry)
        db.commit()
        return patient.patient_id, seeded_doctor.doctor_id, queue_entry.queue_id
    finally:
        db.close()


@pytest.fixture
def draft_consultation(seeded_doctor):
    from app.database import SessionLocal
    from app.models import Appointment, Consultation, Patient

    db = SessionLocal()
    try:
        patient = Patient(
            given_name="Followup",
            family_name="Patient",
            gender="female",
            dob=date(1990, 5, 17),
        )
        db.add(patient)
        db.flush()
        appointment = Appointment(
            patient_id=patient.patient_id,
            doctor_id=seeded_doctor.doctor_id,
            scheduled_at=_future_slot(days=1),
            status="awaiting_notes",
        )
        db.add(appointment)
        db.flush()
        consultation = Consultation(
            appointment_id=appointment.appointment_id,
            status="draft",
        )
        db.add(consultation)
        db.commit()
        return (
            consultation.consultation_id,
            appointment.appointment_id,
            patient.patient_id,
            seeded_doctor.doctor_id,
            seeded_doctor.username,
        )
    finally:
        db.close()


def _future_slot(days: int = 2) -> datetime:
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(
        microsecond=0
    )


def _active_slot_count(doctor_id: int, scheduled_at: datetime) -> int:
    from app.database import SessionLocal
    from app.models import Appointment

    db = SessionLocal()
    try:
        return db.scalar(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.doctor_id == doctor_id,
                Appointment.scheduled_at == scheduled_at,
                Appointment.status != "cancelled",
            )
        )
    finally:
        db.close()


def test_concurrent_create_forces_unique_constraint_race(
    monkeypatch, booking_records
):
    """Both pre-checks see a free slot; the DB decides one winner."""
    from app.database import SessionLocal

    patient_id, doctor_id, _ = booking_records
    scheduled_at = _future_slot()
    payload = AppointmentCreate(
        patientId=patient_id,
        doctorId=doctor_id,
        scheduledAt=scheduled_at,
    )
    both_checked = Barrier(2)
    original_slot_taken = appointments_router._slot_taken

    def synchronized_slot_taken(db, checked_doctor, checked_at, exclude_id=None):
        taken = original_slot_taken(
            db, checked_doctor, checked_at, exclude_id=exclude_id
        )
        both_checked.wait(timeout=5)
        return taken

    monkeypatch.setattr(
        appointments_router, "_slot_taken", synchronized_slot_taken
    )

    def create_once(_):
        db = SessionLocal()
        try:
            appointments_router.create_appointment(payload, db)
            return 201, None
        except HTTPException as exc:
            return exc.status_code, exc.detail["error"]
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(create_once, range(2)))

    assert sorted(status for status, _ in results) == [201, 409]
    assert next(error for status, error in results if status == 409) == (
        "doctor_slot_taken"
    )
    assert _active_slot_count(doctor_id, scheduled_at) == 1


def test_concurrent_queue_booking_claims_entry_once(booking_records):
    """The row lock prevents one queue entry creating two appointments."""
    from app.database import SessionLocal
    from app.models import QueueEntry

    _, doctor_id, queue_id = booking_records
    scheduled_at = _future_slot(days=3)
    payload = QueueBookIn(doctorId=doctor_id, scheduledAt=scheduled_at)
    start = Barrier(2)

    def book_once(_):
        db = SessionLocal()
        try:
            start.wait(timeout=5)
            result = book_queue_entry(queue_id, payload, db)
            return 200, result["appointment"]["id"]
        except HTTPException as exc:
            return exc.status_code, exc.detail["error"]
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(book_once, range(2)))

    assert sorted(status for status, _ in results) == [200, 409]
    assert next(error for status, error in results if status == 409) == (
        "queue_not_pending"
    )
    assert _active_slot_count(doctor_id, scheduled_at) == 1

    db = SessionLocal()
    try:
        entry = db.get(QueueEntry, queue_id)
        assert entry.status == "booked"
        assert entry.appointment_id is not None
    finally:
        db.close()


def test_concurrent_consultation_submit_creates_one_follow_up(
    monkeypatch, draft_consultation
):
    """The consultation lock prevents two different follow-ups."""
    from app.database import SessionLocal
    from app.models import Appointment, Consultation

    consultation_id, original_id, patient_id, doctor_id, username = (
        draft_consultation
    )
    monkeypatch.setattr(
        consultations_router, "decode_signature", lambda _value: b"signature"
    )
    monkeypatch.setattr(
        consultations_router, "put_bytes", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        consultations_router,
        "object_key",
        lambda *_args, **_kwargs: "test/signature.png",
    )

    payloads = [
        ConsultationSubmitIn(
            signature="test",
            followUp=FollowUpAppointment(
                kind="appointment", scheduledAt=_future_slot(days=4)
            ),
        ),
        ConsultationSubmitIn(
            signature="test",
            followUp=FollowUpAppointment(
                kind="appointment", scheduledAt=_future_slot(days=5)
            ),
        ),
    ]
    user = CurrentUser(username=username, role="doctor")
    start = Barrier(2)

    def submit_once(payload):
        db = SessionLocal()
        try:
            start.wait(timeout=5)
            result = consultations_router.submit_consultation(
                consultation_id, payload, db, user
            )
            return 200, result["followUpAppointment"]["id"]
        except HTTPException as exc:
            return exc.status_code, exc.detail["error"]
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(submit_once, payloads))

    assert sorted(status for status, _ in results) == [200, 409]
    assert next(error for status, error in results if status == 409) == (
        "consultation_locked"
    )

    db = SessionLocal()
    try:
        follow_up_count = db.scalar(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.patient_id == patient_id,
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_id != original_id,
            )
        )
        consultation = db.get(Consultation, consultation_id)
        assert follow_up_count == 1
        assert consultation.status == "completed"
        assert consultation.follow_up_appointment_id is not None
    finally:
        db.close()
