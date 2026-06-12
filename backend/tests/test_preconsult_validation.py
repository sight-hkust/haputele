"""Preconsult vitals plausibility bounds.

PreconsultIn used to accept any integer, so a fat-fingered BP of 1200 or a
30→3000 temperature typo saved silently and the doctor opened the call to
nonsense. These tests pin the bounds (mirrored in frontend/src/lib/vitals.ts)
and the diastolic<systolic cross-field rule, and confirm a real reading still
saves end-to-end.
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
def ready_appointment(seeded_doctor):
    """Patient with an active master consent + an agreed session consent, on an
    appointment sitting in data_collection — i.e. vitals are fully unlocked, so
    a rejection can only come from body validation."""
    from app.database import SessionLocal
    from app.models import Appointment, Consent, Patient

    db = SessionLocal()
    try:
        patient = Patient(given_name="Test", family_name="Patient", gender="female")
        db.add(patient)
        db.flush()

        master = Consent(
            patient_id=patient.patient_id,
            scope="master",
            # The consents_check constraint (migration 0001) requires a master
            # consent to carry a version (and no appointment_id).
            version="v1",
            agreed=True,
            captured_at=datetime.now(timezone.utc),
            signature_key="signatures/master/test.png",
            signature_method="signature",
        )
        db.add(master)
        db.flush()
        patient.master_consent_id = master.consent_id

        appt = Appointment(
            patient_id=patient.patient_id,
            doctor_id=seeded_doctor.doctor_id,
            scheduled_at=datetime.now(timezone.utc) + timedelta(hours=1),
            status="data_collection",
        )
        db.add(appt)
        db.flush()

        db.add(Consent(
            patient_id=patient.patient_id,
            scope="session",
            agreed=True,
            appointment_id=appt.appointment_id,
            captured_at=datetime.now(timezone.utc),
            signature_key="signatures/consent/test.png",
            signature_method="signature",
        ))
        db.commit()
        return appt.appointment_id
    finally:
        db.close()


def _preconsult(appt_id: int):
    from app.database import SessionLocal
    from app.models import Preconsultation
    from sqlalchemy import select

    db = SessionLocal()
    try:
        return db.scalar(select(Preconsultation).where(Preconsultation.appointment_id == appt_id))
    finally:
        db.close()


def test_out_of_range_vital_is_rejected_with_field_location(hw_client, ready_appointment):
    appt_id = ready_appointment
    r = hw_client.put(
        f"/appointments/{appt_id}/preconsult",
        json={"sysBp": 1200},  # impossible — typo for 120
        headers=_csrf(hw_client),
    )
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["error"] == "validation_failed"
    # The client relies on the offending field name being the tail of `loc`.
    locs = [e["loc"][-1] for e in detail["errors"]]
    assert "sysBp" in locs
    # Nothing should have been written.
    assert _preconsult(appt_id) is None


def test_diastolic_at_or_above_systolic_is_rejected(hw_client, ready_appointment):
    appt_id = ready_appointment
    r = hw_client.put(
        f"/appointments/{appt_id}/preconsult",
        json={"sysBp": 80, "diaBp": 120},  # swapped pair
        headers=_csrf(hw_client),
    )
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["error"] == "validation_failed"
    # The model-level rule carries a sentinel the client pins to the diaBp field.
    blob = " ".join(e.get("msg", "") for e in detail["errors"])
    assert "diaBp_must_be_below_sysBp" in blob


def test_plausible_vitals_save(hw_client, ready_appointment):
    appt_id = ready_appointment
    r = hw_client.put(
        f"/appointments/{appt_id}/preconsult",
        json={
            "height": 170, "weight": 65,
            "sysBp": 120, "diaBp": 80,
            "pulse": 72, "temperature": 36.7,
            "primaryComplaint": "Cough for 3 days",
        },
        headers=_csrf(hw_client),
    )
    assert r.status_code == 200, r.text
    body = r.json()["preconsult"]
    assert body["sysBp"] == 120 and body["diaBp"] == 80
    assert body["temperature"] == pytest.approx(36.7)

    pre = _preconsult(appt_id)
    assert pre is not None and pre.systolic == 120 and pre.diastolic == 80
