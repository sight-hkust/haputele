"""Regression: a failed LiveKit token mint must not strand the appointment.

start-meeting used to commit data_collection → in_progress BEFORE minting the
LiveKit token. With LiveKit unconfigured (or unreachable) the mint raised 422,
but the already-committed transition survived — so every retry 409'd with
invalid_state and the meeting could never be started for that appointment.
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
    """TestClient already logged in as the healthworker."""
    username, password = healthworker_account
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def data_collection_appointment(seeded_doctor):
    """A patient + appointment sitting in data_collection, ready to start."""
    from app.database import SessionLocal
    from app.models import Appointment, Patient

    db = SessionLocal()
    try:
        patient = Patient(given_name="Test", family_name="Patient", gender="female")
        db.add(patient)
        db.flush()
        appt = Appointment(
            patient_id=patient.patient_id,
            doctor_id=seeded_doctor.doctor_id,
            scheduled_at=datetime.now(timezone.utc) + timedelta(hours=1),
            status="data_collection",
        )
        db.add(appt)
        db.commit()
        return appt.appointment_id
    finally:
        db.close()


def _appt_status(appt_id: int) -> str:
    from app.database import SessionLocal
    from app.models import Appointment

    db = SessionLocal()
    try:
        return db.get(Appointment, appt_id).status
    finally:
        db.close()


def _set_livekit(monkeypatch, url: str, key: str, secret: str) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "LIVEKIT_URL", url)
    monkeypatch.setattr(settings, "LIVEKIT_API_KEY", key)
    monkeypatch.setattr(settings, "LIVEKIT_API_SECRET", secret)


def test_failed_token_mint_leaves_appointment_retryable(
    hw_client, data_collection_appointment, monkeypatch
):
    appt_id = data_collection_appointment

    # LiveKit unconfigured → the mint inside start-meeting raises 422 ...
    _set_livekit(monkeypatch, "", "", "")
    r = hw_client.post(f"/appointments/{appt_id}/start-meeting", headers=_csrf(hw_client))
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "livekit_not_configured"

    # ... and the appointment must still be in data_collection, not stranded
    # in_progress with no meeting.
    assert _appt_status(appt_id) == "data_collection"

    # With LiveKit configured (mint_token signs the JWT locally — no server
    # involved), the retry succeeds and only now flips the status.
    _set_livekit(
        monkeypatch,
        "wss://livekit.test.example",
        "test_api_key",
        "test_api_secret_at_least_32_chars_long",
    )
    r = hw_client.post(f"/appointments/{appt_id}/start-meeting", headers=_csrf(hw_client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["appointment"]["status"] == "in_progress"
    assert body["room"] == f"appt-{appt_id}"
    assert body["token"]
    assert _appt_status(appt_id) == "in_progress"
