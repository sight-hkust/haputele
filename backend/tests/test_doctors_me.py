"""Doctor self-service profile: GET/PATCH /doctors/me and the saved
e-signature stream (GET /doctors/me/signature).

A doctor may edit their own practice-profile fields and manage a saved
e-signature; identity/credential fields stay admin-only, and only the
doctor themselves (not admins/healthworkers) can reach these routes.
"""
from __future__ import annotations

import base64

import pytest

from app.database import SessionLocal
from app.models import Account, Doctor
from app.security import hash_password


_PNG_1x1_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\x9a\x9c\xa9\x83\x00\x00\x00\x00IEND\xaeB`\x82"
)
_PNG_DATA_URL = "data:image/png;base64," + base64.b64encode(_PNG_1x1_BYTES).decode("ascii")


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


_DR_CREDS = ("dr_me", "DrMe-Password-123")


@pytest.fixture
def doctor_account(initialized_system):
    """Seed an approved doctor with a KNOWN password so we can log in."""
    db = SessionLocal()
    try:
        from datetime import datetime, timezone

        db.add(Account(
            username=_DR_CREDS[0],
            password=hash_password(_DR_CREDS[1]),
            role="doctor",
        ))
        db.add(Doctor(
            username=_DR_CREDS[0],
            given_name="Mara", family_name="Perera",
            contact="+94 11 222 0000",
            email="dr_me@example.com",
            slmc_registration_number="SLMC-ME-1",
            qualifications="MBBS",
            practitioner_address="2 Self St",
            institute_name="Self Clinic",
            institute_contact="+94 11 222 1111",
            rubber_stamp_key="test/stub-stamp-key.png",
            active=True,
            approved_at=datetime.now(timezone.utc),
        ))
        db.commit()
    finally:
        db.close()
    return _DR_CREDS


@pytest.fixture
def doctor_client(client, doctor_account):
    username, password = doctor_account
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return client


def test_get_me_returns_own_profile(doctor_client):
    r = doctor_client.get("/doctors/me")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "dr_me@example.com"
    assert body["hasDefaultSignature"] is False


def test_get_me_forbidden_for_non_doctor(admin_client):
    assert admin_client.get("/doctors/me").status_code == 403


def test_patch_me_updates_editable_fields(doctor_client):
    r = doctor_client.patch(
        "/doctors/me", json={"qualifications": "MBBS, MD"}, headers=_csrf(doctor_client)
    )
    assert r.status_code == 200, r.text
    assert r.json()["qualifications"] == "MBBS, MD"


def test_patch_me_ignores_locked_fields(doctor_client):
    # email is not part of DoctorSelfUpdate — it must be ignored, not applied.
    doctor_client.patch(
        "/doctors/me", json={"email": "evil@example.com"}, headers=_csrf(doctor_client)
    )
    assert doctor_client.get("/doctors/me").json()["email"] == "dr_me@example.com"


def test_patch_me_clears_institute_contact(doctor_client):
    r = doctor_client.patch(
        "/doctors/me", json={"instituteContact": ""}, headers=_csrf(doctor_client)
    )
    assert r.status_code == 200, r.text
    assert r.json()["instituteContact"] is None


def test_patch_me_set_and_clear_signature(doctor_client):
    doctor_client.patch(
        "/doctors/me", json={"defaultSignatureImage": _PNG_DATA_URL},
        headers=_csrf(doctor_client),
    )
    assert doctor_client.get("/doctors/me").json()["hasDefaultSignature"] is True
    doctor_client.patch(
        "/doctors/me", json={"clearDefaultSignature": True}, headers=_csrf(doctor_client)
    )
    assert doctor_client.get("/doctors/me").json()["hasDefaultSignature"] is False


def test_get_me_stamp_streams(doctor_client):
    # Upload a stamp via self-update, then it should stream back.
    doctor_client.patch(
        "/doctors/me", json={"rubberStampImage": _PNG_DATA_URL}, headers=_csrf(doctor_client)
    )
    r = doctor_client.get("/doctors/me/stamp")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content == _PNG_1x1_BYTES


def test_get_me_signature_streams_then_404(doctor_client):
    assert doctor_client.get("/doctors/me/signature").status_code == 404
    doctor_client.patch(
        "/doctors/me", json={"defaultSignatureImage": _PNG_DATA_URL},
        headers=_csrf(doctor_client),
    )
    r = doctor_client.get("/doctors/me/signature")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content == _PNG_1x1_BYTES
