"""Issue #77: cancelled appointments are archived, not deleted.

Cancel must keep the appointment and any booked queue row, free the doctor
slot for a new active booking, optionally insert a fresh pending queue entry,
and refuse a second cancel so the reason and queue audit trail stay stable.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


@pytest.fixture
def hw_client(client, healthworker_account):
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
        p = Patient(given_name="Cancel", family_name="Patient", gender="female")
        db.add(p)
        db.commit()
        return p.patient_id
    finally:
        db.close()


def _future_slot() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0).isoformat()


def _create_appointment(hw_client, patient_id: int, doctor_id: int, slot: str):
    return hw_client.post(
        "/appointments",
        json={"patientId": patient_id, "doctorId": doctor_id, "scheduledAt": slot},
        headers=_csrf(hw_client),
    )


def _cancel(hw_client, appt_id: int, **body):
    return hw_client.post(
        f"/appointments/{appt_id}/cancel",
        json=body,
        headers=_csrf(hw_client),
    )


def test_cancel_archives_the_row(hw_client, patient_id, seeded_doctor):
    slot = _future_slot()
    created = _create_appointment(hw_client, patient_id, seeded_doctor.doctor_id, slot)
    assert created.status_code == 201, created.text
    appt_id = created.json()["id"]

    r = _cancel(hw_client, appt_id, reason="patient requested")
    assert r.status_code == 200, r.text
    body = r.json()["appointment"]
    assert body["id"] == appt_id
    assert body["status"] == "cancelled"
    assert body["cancellationReason"] == "patient requested"

    listed = hw_client.get("/appointments", params={"patientId": patient_id})
    assert listed.status_code == 200, listed.text
    ids = [a["id"] for a in listed.json()]
    assert appt_id in ids


def test_cancel_without_requeue_preserves_nested_nulls(
    hw_client, patient_id, seeded_doctor
):
    created = _create_appointment(
        hw_client, patient_id, seeded_doctor.doctor_id, _future_slot()
    )
    response = _cancel(hw_client, created.json()["id"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert "queueEntry" not in body
    assert "cancellationReason" in body["appointment"]
    assert body["appointment"]["cancellationReason"] is None


def test_second_cancel_is_rejected(hw_client, patient_id, seeded_doctor):
    created = _create_appointment(
        hw_client, patient_id, seeded_doctor.doctor_id, _future_slot()
    )
    appt_id = created.json()["id"]
    assert _cancel(hw_client, appt_id, reason="first").status_code == 200

    r = _cancel(hw_client, appt_id, reason="second", requeue={"source": "walk_in"})
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "invalid_state"
    assert r.json()["detail"]["currentStatus"] == "cancelled"

    from app.database import SessionLocal
    from app.models import Appointment, QueueEntry
    from sqlalchemy import select

    db = SessionLocal()
    try:
        appt = db.get(Appointment, appt_id)
        assert appt.cancellation_reason == "first"
        extras = list(
            db.scalars(select(QueueEntry).where(QueueEntry.patient_id == patient_id))
        )
        assert extras == []
    finally:
        db.close()


def test_cancelled_future_slot_can_be_rebooked(hw_client, patient_id, seeded_doctor):
    slot = _future_slot()
    first = _create_appointment(hw_client, patient_id, seeded_doctor.doctor_id, slot)
    assert first.status_code == 201, first.text
    assert _cancel(hw_client, first.json()["id"], reason="reschedule").status_code == 200

    from app.database import SessionLocal
    from app.models import Patient

    db = SessionLocal()
    try:
        other = Patient(given_name="Other", family_name="Patient", gender="male")
        db.add(other)
        db.commit()
        other_id = other.patient_id
    finally:
        db.close()

    second = _create_appointment(hw_client, other_id, seeded_doctor.doctor_id, slot)
    assert second.status_code == 201, second.text
    assert second.json()["id"] != first.json()["id"]
    assert second.json()["status"] == "scheduled"


def test_cancel_closes_booked_queue_entry(
    hw_client, patient_id, seeded_doctor, healthworker_account
):
    slot = _future_slot()
    created = _create_appointment(hw_client, patient_id, seeded_doctor.doctor_id, slot)
    appt_id = created.json()["id"]

    from app.database import SessionLocal
    from app.models import QueueEntry

    db = SessionLocal()
    try:
        entry = QueueEntry(
            patient_id=patient_id,
            source="walk_in",
            status="booked",
            priority="routine",
            appointment_id=appt_id,
            booked_at=datetime.now(timezone.utc),
            created_by=healthworker_account[0],
        )
        db.add(entry)
        db.commit()
        queue_id = entry.queue_id
    finally:
        db.close()

    r = _cancel(hw_client, appt_id, reason="no-show")
    assert r.status_code == 200, r.text
    assert "queueEntry" not in r.json()

    db = SessionLocal()
    try:
        entry = db.get(QueueEntry, queue_id)
        assert entry.status == "cancelled"
        assert entry.cancellation_reason == "appointment_cancelled"
        assert entry.cancelled_at is not None
        assert entry.appointment_id == appt_id
    finally:
        db.close()


def test_cancel_with_requeue_inserts_a_fresh_pending_entry(
    hw_client, patient_id, seeded_doctor
):
    created = _create_appointment(
        hw_client, patient_id, seeded_doctor.doctor_id, _future_slot()
    )
    appt_id = created.json()["id"]

    r = _cancel(
        hw_client,
        appt_id,
        reason="wants next week",
        requeue={
            "source": "walk_in",
            "priority": "urgent",
            "preferredDoctorId": seeded_doctor.doctor_id,
            "notes": "reschedule next week",
        },
    )
    assert r.status_code == 200, r.text
    qe = r.json()["queueEntry"]
    assert qe["status"] == "pending"
    assert qe["patientId"] == patient_id
    assert qe["priority"] == "urgent"
    assert qe["preferredDoctorId"] == seeded_doctor.doctor_id
    assert qe["sourceMeta"]["fromCancelledAppointmentId"] == appt_id


def test_in_progress_cancel_requests_room_delete(
    hw_client, patient_id, seeded_doctor, monkeypatch
):
    from app.database import SessionLocal
    from app.models import Appointment

    db = SessionLocal()
    try:
        appt = Appointment(
            patient_id=patient_id,
            doctor_id=seeded_doctor.doctor_id,
            scheduled_at=datetime.now(timezone.utc) + timedelta(hours=1),
            status="in_progress",
        )
        db.add(appt)
        db.commit()
        appt_id = appt.appointment_id
    finally:
        db.close()

    calls: list[int] = []
    monkeypatch.setattr(
        "app.routers.appointments.delete_room_best_effort",
        lambda aid: calls.append(aid),
    )
    r = _cancel(hw_client, appt_id, reason="connection lost")
    assert r.status_code == 200, r.text
    assert calls == [appt_id]


def test_scheduled_cancel_does_not_touch_livekit(
    hw_client, patient_id, seeded_doctor, monkeypatch
):
    created = _create_appointment(
        hw_client, patient_id, seeded_doctor.doctor_id, _future_slot()
    )
    calls: list[int] = []
    monkeypatch.setattr(
        "app.routers.appointments.delete_room_best_effort",
        lambda aid: calls.append(aid),
    )
    r = _cancel(hw_client, created.json()["id"])
    assert r.status_code == 200, r.text
    assert calls == []


def test_delete_room_noops_when_livekit_unconfigured(monkeypatch):
    from app.config import settings
    from app.services.livekit import delete_room_best_effort

    monkeypatch.setattr(settings, "LIVEKIT_URL", "")
    monkeypatch.setattr(settings, "LIVEKIT_API_KEY", "")
    monkeypatch.setattr(settings, "LIVEKIT_API_SECRET", "")

    def boom(*_a, **_k):
        raise AssertionError("must not start a LiveKit delete thread")

    monkeypatch.setattr("app.services.livekit.threading.Thread", boom)
    delete_room_best_effort(1)
