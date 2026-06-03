"""Tests for the `onboardingStatus` field on DoctorOut.

  - List endpoint returns "awaiting_setup" for a doctor with a live
    invite, "active" otherwise.
  - Detail endpoint mirrors the list endpoint.
  - Consuming the invite flips status → "active".
  - Re-issue brings it back to "awaiting_setup".
  - Manual-password create-doctor returns "active" immediately.
"""
from __future__ import annotations

import base64

from app.database import SessionLocal
from app.services import doctor_invites


# 1×1 PNG, used to satisfy the rubber-stamp field on create.
_PNG_1x1 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\x9a\x9c\xa9\x83\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


def _doctor_payload(**overrides) -> dict:
    base = {
        "username": "dr_status_test",
        "givenName": "Asha",
        "familyName": "Silva",
        "contact": "+94 11 555 0100",
        "email": "asha.silva@example.com",
        "slmcRegistrationNumber": "SLMC-1",
        "qualifications": "MBBS",
        "practitionerAddress": "1 Test St",
        "instituteName": "Test Clinic",
        "instituteContact": "+94 11 555 0101",
        "rubberStampImage": _PNG_1x1,
    }
    base.update(overrides)
    return base


def test_create_with_invite_returns_awaiting_setup(
    admin_client, email_env, captured_emails,
):
    r = admin_client.post(
        "/doctors", json=_doctor_payload(), headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["onboardingStatus"] == "awaiting_setup"


def test_create_with_manual_password_returns_active(
    admin_client, email_env, captured_emails,
):
    r = admin_client.post(
        "/doctors",
        json=_doctor_payload(password="manually-set-password"),
        headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text
    assert r.json()["onboardingStatus"] == "active"


def test_list_endpoint_reports_status_per_doctor(
    admin_client, email_env, captured_emails,
):
    # Doctor 1 — invite mode
    r = admin_client.post(
        "/doctors", json=_doctor_payload(username="dr_a", email="a@example.com"),
        headers=_csrf(admin_client),
    )
    assert r.status_code == 201

    # Doctor 2 — manual mode
    r = admin_client.post(
        "/doctors",
        json=_doctor_payload(
            username="dr_b", email="b@example.com", password="manual-pw",
        ),
        headers=_csrf(admin_client),
    )
    assert r.status_code == 201

    r = admin_client.get("/doctors")
    assert r.status_code == 200
    by_username = {d["username"]: d for d in r.json()}
    assert by_username["dr_a"]["onboardingStatus"] == "awaiting_setup"
    assert by_username["dr_b"]["onboardingStatus"] == "active"


def test_consuming_invite_flips_status_to_active(
    admin_client, email_env, captured_emails, client,
):
    # Create with invite
    r = admin_client.post(
        "/doctors", json=_doctor_payload(), headers=_csrf(admin_client),
    )
    assert r.status_code == 201
    doctor_id = r.json()["id"]

    # Grab the raw token via the service (the test bypasses the email-delivery
    # side, but the issue() result is what the email would carry).
    db = SessionLocal()
    try:
        invite, raw = doctor_invites.issue(db, doctor_id=doctor_id)
    finally:
        db.close()

    # Consume via the public onboarding endpoint
    r = client.post(
        f"/doctor-onboarding/{raw}",
        json={"password": "doctor-chosen-password-12345"},
    )
    assert r.status_code == 204, r.text

    # GET /doctors/{id} now reports active
    r = admin_client.get(f"/doctors/{doctor_id}")
    assert r.status_code == 200
    assert r.json()["onboardingStatus"] == "active"


def test_reissue_invite_brings_status_back_to_awaiting_setup(
    admin_client, email_env, captured_emails, client,
):
    # Create + onboard
    r = admin_client.post(
        "/doctors", json=_doctor_payload(), headers=_csrf(admin_client),
    )
    doctor_id = r.json()["id"]
    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue(db, doctor_id=doctor_id)
    finally:
        db.close()
    client.post(
        f"/doctor-onboarding/{raw}",
        json={"password": "first-password-12345"},
    )

    # Admin re-issues
    r = admin_client.post(
        f"/doctors/{doctor_id}/invites", headers=_csrf(admin_client),
    )
    assert r.status_code == 204

    # Detail endpoint now shows awaiting_setup again
    r = admin_client.get(f"/doctors/{doctor_id}")
    assert r.status_code == 200
    assert r.json()["onboardingStatus"] == "awaiting_setup"


def test_status_uses_single_query_for_list(
    admin_client, email_env, captured_emails,
):
    """Sanity check that the helper produces correct results for N>1
    doctors without each one querying separately. We can't easily count
    DB queries from the test without instrumenting SQLAlchemy events, so
    instead we assert that all four states are reported correctly in one
    list call — exercising the batched IN-clause path."""
    # Three doctors: two awaiting, one active.
    for i, (username, password) in enumerate([
        ("dr_w1", None), ("dr_w2", None), ("dr_w3", "manual-pw"),
    ]):
        body = _doctor_payload(
            username=username, email=f"{username}@example.com",
        )
        if password:
            body["password"] = password
        r = admin_client.post("/doctors", json=body, headers=_csrf(admin_client))
        assert r.status_code == 201, r.text

    r = admin_client.get("/doctors")
    assert r.status_code == 200
    by_username = {d["username"]: d for d in r.json()}
    assert by_username["dr_w1"]["onboardingStatus"] == "awaiting_setup"
    assert by_username["dr_w2"]["onboardingStatus"] == "awaiting_setup"
    assert by_username["dr_w3"]["onboardingStatus"] == "active"
