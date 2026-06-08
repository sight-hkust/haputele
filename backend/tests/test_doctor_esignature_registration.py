"""Registration / onboarding: optional institute phone + optional saved
e-signature at sign-up.

Covers both creation paths:
  - admin POST /doctors (legacy fill-everything)
  - doctor self-onboarding POST /doctor-onboarding/{token}
"""
from __future__ import annotations

import base64

from app.database import SessionLocal
from app.models import Doctor
from app.services import doctor_invites


_PNG_1x1 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\x9a\x9c\xa9\x83\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


def _create_payload(**overrides) -> dict:
    base = {
        "username": "dr_reg",
        "password": "DrReg-Password-123",
        "givenName": "Nadia",
        "familyName": "Fernando",
        "contact": "+94 11 333 0000",
        "email": "dr_reg@example.com",
        "slmcRegistrationNumber": "SLMC-REG-1",
        "qualifications": "MBBS",
        "practitionerAddress": "3 Reg Rd",
        "instituteName": "Reg Clinic",
        "instituteContact": "+94 11 333 1111",
        "rubberStampImage": _PNG_1x1,
    }
    base.update(overrides)
    return base


def _onboard_payload(**overrides) -> dict:
    base = {
        "username": "dr_onb",
        "password": "DrOnb-Password-123",
        "givenName": "Ravi",
        "familyName": "Jay",
        "contact": "+94 11 444 0000",
        "slmcRegistrationNumber": "SLMC-ONB-1",
        "qualifications": "MBBS",
        "practitionerAddress": "4 Onb Rd",
        "instituteName": "Onb Clinic",
        "instituteContact": "+94 11 444 1111",
        "rubberStampImage": _PNG_1x1,
    }
    base.update(overrides)
    return base


def _new_doctor_token(email: str) -> str:
    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue_new_doctor(db, email=email, family_name=None)
    finally:
        db.close()
    return raw


# ── admin POST /doctors ──────────────────────────────────────────────────

def test_register_without_institute_contact_succeeds(admin_client):
    payload = _create_payload()
    payload.pop("instituteContact")
    r = admin_client.post("/doctors", json=payload, headers=_csrf(admin_client))
    assert r.status_code == 201, r.text
    assert r.json()["instituteContact"] is None


def test_register_with_default_signature_sets_flag(admin_client):
    payload = _create_payload(defaultSignatureImage=_PNG_1x1)
    r = admin_client.post("/doctors", json=payload, headers=_csrf(admin_client))
    assert r.status_code == 201, r.text
    assert r.json()["hasDefaultSignature"] is True


def test_register_without_signature_leaves_flag_false(admin_client):
    r = admin_client.post("/doctors", json=_create_payload(), headers=_csrf(admin_client))
    assert r.status_code == 201, r.text
    assert r.json()["hasDefaultSignature"] is False


# ── self-onboarding POST /doctor-onboarding/{token} ──────────────────────

def test_onboard_without_institute_contact_succeeds(client, initialized_system):
    raw = _new_doctor_token("onb_no_phone@example.com")
    payload = _onboard_payload()
    payload.pop("instituteContact")
    r = client.post(f"/doctor-onboarding/{raw}", json=payload)
    assert r.status_code == 204, r.text
    db = SessionLocal()
    try:
        doctor = db.query(Doctor).filter_by(username="dr_onb").first()
        assert doctor is not None and doctor.institute_contact is None
    finally:
        db.close()


def test_onboard_with_default_signature_stores_key(client, initialized_system):
    raw = _new_doctor_token("onb_sig@example.com")
    payload = _onboard_payload(defaultSignatureImage=_PNG_1x1)
    r = client.post(f"/doctor-onboarding/{raw}", json=payload)
    assert r.status_code == 204, r.text
    db = SessionLocal()
    try:
        doctor = db.query(Doctor).filter_by(username="dr_onb").first()
        assert doctor is not None and doctor.default_signature_key is not None
    finally:
        db.close()
