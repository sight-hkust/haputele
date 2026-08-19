"""Issue #72: appointments must not be bookable at a time that has passed.

The slot picker hides elapsed slots, but it filters against the *browser*
clock — a tab left open overnight, or any direct API call, would otherwise
still write a past appointment. These tests pin the server-side guard.

The rule is deliberately not "scheduledAt < now": a slot stays bookable
while you are still inside it, so a health worker can start the consultation
right away. `BOOKING_GRACE` (one slot width) is that window.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.dateutils import BOOKING_GRACE


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


@pytest.fixture
def hw_client(client, healthworker_account):
    """TestClient already logged in as the healthworker."""
    username, password = healthworker_account
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def patient_id(initialized_system) -> int:
    from app.database import SessionLocal
    from app.models import Patient

    db = SessionLocal()
    try:
        p = Patient(given_name="Past", family_name="Booking", gender="female")
        db.add(p)
        db.commit()
        return p.patient_id
    finally:
        db.close()


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat()


def _create(hw_client, patient_id: int, doctor_id: int, scheduled_at: str):
    return hw_client.post(
        "/appointments",
        json={"patientId": patient_id, "doctorId": doctor_id, "scheduledAt": scheduled_at},
        headers=_csrf(hw_client),
    )


# ── POST /appointments ────────────────────────────────────────────────

def test_create_rejects_fully_elapsed_slot(hw_client, patient_id, seeded_doctor):
    r = _create(hw_client, patient_id, seeded_doctor.doctor_id, _iso(timedelta(hours=-2)))
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "appointment_in_past"


def test_create_allows_the_slot_currently_in_progress(hw_client, patient_id, seeded_doctor):
    """Started 5 min ago, so the 15-min slot is still running — bookable."""
    r = _create(hw_client, patient_id, seeded_doctor.doctor_id, _iso(timedelta(minutes=-5)))
    assert r.status_code == 201, r.text


def test_create_allows_future_slot(hw_client, patient_id, seeded_doctor):
    r = _create(hw_client, patient_id, seeded_doctor.doctor_id, _iso(timedelta(hours=1)))
    assert r.status_code == 201, r.text


def test_create_boundary_is_exactly_one_slot_width(hw_client, patient_id, seeded_doctor):
    """The instant the slot's own window closes, it stops being bookable."""
    r = _create(
        hw_client, patient_id, seeded_doctor.doctor_id,
        _iso(-BOOKING_GRACE - timedelta(seconds=30)),
    )
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "appointment_in_past"


def test_create_rejects_naive_timestamp_without_crashing(hw_client, patient_id, seeded_doctor):
    """A naive scheduledAt must fail validation, not blow up the past-check."""
    naive = datetime.now().replace(tzinfo=None).isoformat()
    r = _create(hw_client, patient_id, seeded_doctor.doctor_id, naive)
    assert r.status_code == 422, r.text
    assert "timezone offset" in r.text


# ── PATCH /appointments/{id} ──────────────────────────────────────────

@pytest.fixture
def past_appointment(patient_id, seeded_doctor) -> int:
    """A still-live appointment whose scheduled time is already behind us."""
    from app.database import SessionLocal
    from app.models import Appointment

    db = SessionLocal()
    try:
        appt = Appointment(
            patient_id=patient_id,
            doctor_id=seeded_doctor.doctor_id,
            scheduled_at=datetime.now(timezone.utc) - timedelta(hours=3),
            status="scheduled",
        )
        db.add(appt)
        db.commit()
        return appt.appointment_id
    finally:
        db.close()


@pytest.fixture
def second_doctor(initialized_system) -> int:
    import secrets

    from app.database import SessionLocal
    from app.models import Account, Doctor
    from app.security import hash_password

    db = SessionLocal()
    try:
        username = "dr_test_second"
        db.add(Account(
            username=username,
            password=hash_password(secrets.token_urlsafe(32)),
            role="doctor",
        ))
        db.add(Doctor(
            username=username,
            given_name="Second", family_name="Doctor",
            contact="+94 11 000 0001",
            email="dr_second@example.com",
            slmc_registration_number="SLMC-TEST-2",
            qualifications="MBBS",
            practitioner_address="Test Address",
            institute_name="Test Clinic",
            institute_contact="+94 11 111 1112",
            rubber_stamp_key="test/stub-stamp-key.png",
            active=True,
            approved_at=datetime.now(timezone.utc),
        ))
        db.commit()
        return db.query(Doctor).filter_by(username=username).first().doctor_id
    finally:
        db.close()


def test_patch_rejects_moving_time_into_the_past(hw_client, past_appointment):
    r = hw_client.patch(
        f"/appointments/{past_appointment}",
        json={"scheduledAt": _iso(timedelta(hours=-2))},
        headers=_csrf(hw_client),
    )
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "appointment_in_past"


def test_patch_reassigns_doctor_on_a_past_appointment(
    hw_client, past_appointment, second_doctor
):
    """Reassigning the doctor must not trip the guard on an unchanged time.

    An appointment that has already started is exactly the one most likely
    to need a doctor swap, so this path stays open.
    """
    r = hw_client.patch(
        f"/appointments/{past_appointment}",
        json={"doctorId": second_doctor},
        headers=_csrf(hw_client),
    )
    assert r.status_code == 200, r.text
    assert r.json()["doctorId"] == second_doctor


# ── POST /queue/{qid}/book ────────────────────────────────────────────

@pytest.fixture
def pending_queue_entry(patient_id, healthworker_account) -> int:
    from app.database import SessionLocal
    from app.models import QueueEntry

    db = SessionLocal()
    try:
        entry = QueueEntry(
            patient_id=patient_id,
            source="walk_in",
            status="pending",
            priority="routine",
            created_by=healthworker_account[0],
        )
        db.add(entry)
        db.commit()
        return entry.queue_id
    finally:
        db.close()


def test_queue_book_rejects_past_slot(hw_client, pending_queue_entry, seeded_doctor):
    r = hw_client.post(
        f"/queue/{pending_queue_entry}/book",
        json={"doctorId": seeded_doctor.doctor_id, "scheduledAt": _iso(timedelta(hours=-2))},
        headers=_csrf(hw_client),
    )
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "appointment_in_past"


def test_queue_book_allows_future_slot(hw_client, pending_queue_entry, seeded_doctor):
    r = hw_client.post(
        f"/queue/{pending_queue_entry}/book",
        json={"doctorId": seeded_doctor.doctor_id, "scheduledAt": _iso(timedelta(hours=2))},
        headers=_csrf(hw_client),
    )
    assert r.status_code == 200, r.text
