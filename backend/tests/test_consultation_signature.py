"""Consultation submit signature behaviour.

A doctor may finalise a consultation by drawing a signature (as before) or,
if they have saved a default e-signature, by omitting the signature — in
which case a COPY of the saved bytes is stored on the consultation. The
copy is what guarantees a later change to the saved signature can't mutate
an already-signed consultation.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone

import pytest

from app.database import SessionLocal
from app.models import Account, Appointment, Consultation, Doctor, Patient
from app.security import hash_password
from app.services.storage import get_bytes, object_key, put_bytes


_PNG_A = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\x9a\x9c\xa9\x83\x00\x00\x00\x00IEND\xaeB`\x82"
)
# A second, byte-distinct PNG (different IDAT) for the immutability test.
_PNG_B = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x10IDATx\x9cc``\xf8"
    b"\xcf\xc0\xc0\xc0\x00\x00\x04\x00\x01\xff\xff?\x00\x00\x00\x00IEND\xaeB`\x82"
)
_PNG_A_URL = "data:image/png;base64," + base64.b64encode(_PNG_A).decode("ascii")
_PNG_B_URL = "data:image/png;base64," + base64.b64encode(_PNG_B).decode("ascii")

_CREDS = ("dr_sig", "DrSig-Password-123")


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


@pytest.fixture
def scenario(initialized_system):
    """Seed a doctor (known password), patient, in_progress appointment, and
    a draft consultation. Returns (doctor_id, consultation_id)."""
    db = SessionLocal()
    try:
        db.add(Account(username=_CREDS[0], password=hash_password(_CREDS[1]), role="doctor"))
        doctor = Doctor(
            username=_CREDS[0],
            given_name="Sig", family_name="Doc",
            contact="+94 11 555 0000",
            email="dr_sig@example.com",
            slmc_registration_number="SLMC-SIG-1",
            qualifications="MBBS",
            practitioner_address="5 Sig St",
            institute_name="Sig Clinic",
            rubber_stamp_key="test/stub-stamp-key.png",
            active=True,
            approved_at=datetime.now(timezone.utc),
        )
        patient = Patient(given_name="Pat", family_name="Ient", gender="female")
        db.add(doctor)
        db.add(patient)
        db.flush()
        appt = Appointment(
            patient_id=patient.patient_id,
            doctor_id=doctor.doctor_id,
            scheduled_at=datetime.now(timezone.utc),
            status="in_progress",
        )
        db.add(appt)
        db.flush()
        consult = Consultation(appointment_id=appt.appointment_id, status="draft")
        db.add(consult)
        db.commit()
        return doctor.doctor_id, consult.consultation_id
    finally:
        db.close()


@pytest.fixture
def doctor_client(client, scenario):
    r = client.post("/auth/login", json={"username": _CREDS[0], "password": _CREDS[1]})
    assert r.status_code == 200, r.text
    return client


def _set_saved_signature(doctor_id: int, png: bytes) -> None:
    """Attach a saved e-signature to the doctor, bypassing the API."""
    key = object_key("doctors/signatures", "png")
    put_bytes(key, png, "image/png")
    db = SessionLocal()
    try:
        d = db.get(Doctor, doctor_id)
        d.default_signature_key = key
        db.commit()
    finally:
        db.close()


def _consultation_signature_bytes(cid: int) -> bytes | None:
    db = SessionLocal()
    try:
        c = db.get(Consultation, cid)
        if not c.signature_key:
            return None
        return get_bytes(c.signature_key)
    finally:
        db.close()


def test_submit_with_explicit_signature(doctor_client, scenario):
    _, cid = scenario
    r = doctor_client.post(
        f"/consultations/{cid}/submit", json={"signature": _PNG_A_URL},
        headers=_csrf(doctor_client),
    )
    assert r.status_code == 200, r.text
    assert _consultation_signature_bytes(cid) == _PNG_A


def test_submit_omitted_without_default_is_422(doctor_client, scenario):
    _, cid = scenario
    r = doctor_client.post(
        f"/consultations/{cid}/submit", json={}, headers=_csrf(doctor_client)
    )
    assert r.status_code == 422, r.text


def test_submit_omitted_uses_saved_default(doctor_client, scenario):
    doctor_id, cid = scenario
    _set_saved_signature(doctor_id, _PNG_A)
    r = doctor_client.post(
        f"/consultations/{cid}/submit", json={}, headers=_csrf(doctor_client)
    )
    assert r.status_code == 200, r.text
    # A copy of the saved bytes is stored under a fresh per-consultation key.
    assert _consultation_signature_bytes(cid) == _PNG_A
    db = SessionLocal()
    try:
        c = db.get(Consultation, cid)
        d = db.get(Doctor, doctor_id)
        assert c.signature_key != d.default_signature_key  # distinct object
    finally:
        db.close()


def test_saved_signature_change_does_not_mutate_completed(doctor_client, scenario):
    doctor_id, cid = scenario
    _set_saved_signature(doctor_id, _PNG_A)
    doctor_client.post(
        f"/consultations/{cid}/submit", json={}, headers=_csrf(doctor_client)
    )
    before = _consultation_signature_bytes(cid)
    # Doctor later changes their saved signature to a different image.
    _set_saved_signature(doctor_id, _PNG_B)
    after = _consultation_signature_bytes(cid)
    assert before == after == _PNG_A  # the signed consultation is immutable
