"""Regression: concurrent appointment creation must not double-book.

`_slot_taken` is a pre-check — two POST /appointments (the "Book
appointment" double-click, or rapid concurrent requests) can both see the
slot free and then race on the partial unique index
`appointments_doctor_slot_unique` (doctor_id, scheduled_at WHERE
status <> 'cancelled'). The loser's commit used to surface as an unhandled
500; the appointment-create / queue-book / consultation-followup sites now
catch the IntegrityError, roll back, and raise the same 409
`doctor_slot_taken` the pre-check would. This test drives that race
deterministically and asserts exactly one booking survives.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

import pytest


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
def bookable_slot(seeded_doctor):
    """A patient + a fixed future slot, shared by the racing requests.

    Returns (patient_id, doctor_id, scheduledAt ISO string).
    """
    from app.database import SessionLocal
    from app.models import Patient

    db = SessionLocal()
    try:
        patient = Patient(given_name="Race", family_name="Patient", gender="female")
        db.add(patient)
        db.commit()
        slot = (datetime.now(timezone.utc) + timedelta(days=2)).replace(
            microsecond=0
        ).isoformat()
        return patient.patient_id, seeded_doctor.doctor_id, slot
    finally:
        db.close()


def _create_appointment(client, patient_id, doctor_id, slot):
    """Fire one POST /appointments. Returns the response."""
    return client.post(
        "/appointments",
        json={
            "patientId": patient_id,
            "doctorId": doctor_id,
            "scheduledAt": slot,
        },
        headers=_csrf(client),
    )


def _active_appointments_for_slot(doctor_id: int, slot: str) -> int:
    from app.database import SessionLocal
    from app.models import Appointment

    db = SessionLocal()
    try:
        rows = db.scalars(
            Appointment.__table__.select().where(
                Appointment.doctor_id == doctor_id,
                Appointment.scheduled_at == datetime.fromisoformat(slot),
                Appointment.status != "cancelled",
            )
        ).all()
        return len(rows)
    finally:
        db.close()


def test_concurrent_create_does_not_double_book(hw_client, bookable_slot):
    """Two simultaneous POSTs to the same slot: one 201, one 409, one row.

    Uses a fresh TestClient per thread so each races on its own DB session
    against the shared partial unique index.
    """
    patient_id, doctor_id, slot = bookable_slot

    def fire(_):
        # Reuse the same live app instance via a fresh TestClient so the
        # CSPI/cookie state is per-thread (httpx TestClient is not
        # thread-safe to share).
        from fastapi.testclient import TestClient
        import app.main as app_main
        with TestClient(app_main.app) as c:
            # Log in as the healthworker inside this thread's client.
            r = c.post(
                "/auth/login",
                json={"username": "test_hw", "password": "TestHW-Password-123"},
            )
            assert r.status_code == 200, r.text
            return _create_appointment(c, patient_id, doctor_id, slot)

    with ThreadPoolExecutor(max_workers=2) as ex:
        responses = list(ex.map(fire, range(2)))

    statuses = sorted(r.status_code for r in responses)
    assert statuses == [201, 409], [
        f"expected one 201 and one 409, got {statuses}: "
        f"{[r.text for r in responses]}"
    ]
    # The losing request reports the friendly conflict, not a raw 500.
    loser = next(r for r in responses if r.status_code == 409)
    assert loser.json()["detail"]["error"] == "doctor_slot_taken"

    # Exactly one appointment row exists for that active slot — no double-booking.
    assert _active_appointments_for_slot(doctor_id, slot) == 1


def test_sequential_slot_taken_conflict_still_works(hw_client, bookable_slot):
    """Sanity guard: the existing pre-check conflict path is unchanged.

    Booking a slot twice sequentially must keep returning 409
    doctor_slot_taken (the optimistic check), not regress to a 500.
    """
    patient_id, doctor_id, slot = bookable_slot

    first = _create_appointment(hw_client, patient_id, doctor_id, slot)
    assert first.status_code == 201, first.text

    second = _create_appointment(hw_client, patient_id, doctor_id, slot)
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["error"] == "doctor_slot_taken"

    assert _active_appointments_for_slot(doctor_id, slot) == 1
