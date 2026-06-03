"""API-level tests for the doctor-onboarding flow.

Two surfaces to verify:

  (1) Admin side — POST /doctors with no password fires an invite;
      POST /doctors/{id}/invites re-fires.
  (2) Doctor side — GET /doctor-onboarding/{token} returns peek info;
      POST /doctor-onboarding/{token} sets the password.

`captured_emails` intercepts outbound mail so we can assert on the
template + context the routers chose, without hitting Resend.
"""
from __future__ import annotations

import base64

import pytest

from app.database import SessionLocal
from app.models import Account, Doctor, DoctorInvite


# Minimal valid PNG (1×1 px) for the rubber-stamp field.
_PNG_1x1 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\x9a\x9c\xa9\x83\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token, "csrf_token cookie missing — not logged in?"
    return {"X-CSRF-Token": token}


def _doctor_payload(**overrides) -> dict:
    base = {
        "username": "dr_invite_test",
        "givenName": "Asha",
        "familyName": "Silva",
        "contact": "+94 11 555 0100",
        "email": "asha.silva@example.com",
        "slmcRegistrationNumber": "SLMC-123",
        "qualifications": "MBBS",
        "practitionerAddress": "1 Test St",
        "instituteName": "Test Clinic",
        "instituteContact": "+94 11 555 0101",
        "rubberStampImage": _PNG_1x1,
    }
    base.update(overrides)
    return base


# ── Admin: create_doctor invite-mode happy path ────────────────────

def test_create_doctor_without_password_fires_invite_email(
    admin_client, email_env, captured_emails,
):
    r = admin_client.post(
        "/doctors", json=_doctor_payload(), headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text

    # Exactly one templated email — the invite.
    invite_calls = [c for c in captured_emails if c[0] == "send_templated"]
    assert len(invite_calls) == 1
    _, kwargs = invite_calls[0]
    assert kwargs["template"] == "doctor_invite"
    assert kwargs["to"] == "asha.silva@example.com"
    assert "link" in kwargs["context"]
    assert kwargs["context"]["family_name"] == "Silva"

    # A live invite row exists for the new doctor.
    db = SessionLocal()
    try:
        doctor = db.query(Doctor).filter_by(username="dr_invite_test").one()
        invite_rows = db.query(DoctorInvite).filter_by(doctor_id=doctor.doctor_id).all()
        assert len(invite_rows) == 1
        assert invite_rows[0].consumed_at is None
    finally:
        db.close()


def test_create_doctor_with_password_does_not_fire_invite(
    admin_client, email_env, captured_emails,
):
    r = admin_client.post(
        "/doctors",
        json=_doctor_payload(password="manual-password-set"),
        headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text
    # No invite email; no invite row.
    invite_calls = [c for c in captured_emails if c[0] == "send_templated"]
    assert invite_calls == []
    db = SessionLocal()
    try:
        doctor = db.query(Doctor).filter_by(username="dr_invite_test").one()
        n = db.query(DoctorInvite).filter_by(doctor_id=doctor.doctor_id).count()
        assert n == 0
    finally:
        db.close()


def test_create_doctor_without_password_requires_email_configured(
    admin_client, monkeypatch,
):
    """If RESEND_API_KEY is empty we can't invite — refuse the create
    rather than land a broken account.
    """
    from app.config import settings
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")
    monkeypatch.setattr(settings, "RESEND_FROM", "")
    r = admin_client.post(
        "/doctors", json=_doctor_payload(), headers=_csrf(admin_client),
    )
    assert r.status_code == 422
    assert r.json()["detail"]["error"] == "email_not_configured"


# ── Admin: reissue_invite endpoint ─────────────────────────────────

def test_reissue_invite_revokes_prior(
    admin_client, email_env, captured_emails,
):
    # Create with invite → first invite sent.
    r = admin_client.post(
        "/doctors", json=_doctor_payload(), headers=_csrf(admin_client),
    )
    assert r.status_code == 201

    db = SessionLocal()
    try:
        doctor = db.query(Doctor).filter_by(username="dr_invite_test").one()
        doctor_id = doctor.doctor_id
    finally:
        db.close()

    # Re-issue.
    r = admin_client.post(
        f"/doctors/{doctor_id}/invites", headers=_csrf(admin_client),
    )
    assert r.status_code == 204

    # Two templated calls now; only the latest invite row is unconsumed.
    invite_calls = [c for c in captured_emails if c[0] == "send_templated"]
    assert len(invite_calls) == 2
    db = SessionLocal()
    try:
        rows = (
            db.query(DoctorInvite)
            .filter_by(doctor_id=doctor_id)
            .order_by(DoctorInvite.created_at)
            .all()
        )
        assert len(rows) == 2
        assert rows[0].consumed_at is not None  # superseded
        assert rows[1].consumed_at is None      # current
    finally:
        db.close()


def test_reissue_invite_404_for_unknown_doctor(admin_client, email_env):
    r = admin_client.post("/doctors/9999/invites", headers=_csrf(admin_client))
    assert r.status_code == 404


# ── Doctor: onboarding GET + POST ──────────────────────────────────

def test_onboarding_peek_returns_name(client, seeded_doctor):
    from app.services import doctor_invites
    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue(db, doctor_id=seeded_doctor.doctor_id)
    finally:
        db.close()

    r = client.get(f"/doctor-onboarding/{raw}")
    assert r.status_code == 200, r.text
    body = r.json()
    # Rotation invite — returns mode + email + both names.
    assert body["mode"] == "rotation"
    assert body["givenName"] == "Test"
    assert body["familyName"] == "Doctor"
    assert body["email"] == "dr_test@example.com"


def test_onboarding_peek_404_for_unknown_token(client, initialized_system):
    r = client.get("/doctor-onboarding/totally-fake-token")
    assert r.status_code == 404
    assert r.json()["detail"]["error"] == "invite_not_found"


def test_onboarding_complete_sets_password(client, seeded_doctor):
    from app.services import doctor_invites
    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue(db, doctor_id=seeded_doctor.doctor_id)
    finally:
        db.close()

    r = client.post(
        f"/doctor-onboarding/{raw}",
        json={"password": "the-doctors-chosen-password-12345"},
    )
    assert r.status_code == 204, r.text

    # The doctor can now log in with the new password.
    r = client.post(
        "/auth/login",
        json={
            "username": "dr_test_seeded",
            "password": "the-doctors-chosen-password-12345",
        },
    )
    assert r.status_code == 200, r.text


def test_onboarding_complete_rejects_short_password(client, seeded_doctor):
    from app.services import doctor_invites
    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue(db, doctor_id=seeded_doctor.doctor_id)
    finally:
        db.close()

    r = client.post(f"/doctor-onboarding/{raw}", json={"password": "short"})
    assert r.status_code == 422
    body = r.json()["detail"]
    assert body["error"] == "password_too_short"
    assert body.get("minLength") == 8


def test_onboarding_complete_is_single_use(client, seeded_doctor):
    from app.services import doctor_invites
    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue(db, doctor_id=seeded_doctor.doctor_id)
    finally:
        db.close()

    r1 = client.post(
        f"/doctor-onboarding/{raw}",
        json={"password": "first-attempt-password-12345"},
    )
    assert r1.status_code == 204

    r2 = client.post(
        f"/doctor-onboarding/{raw}",
        json={"password": "second-attempt-should-fail-12345"},
    )
    assert r2.status_code == 404
    assert r2.json()["detail"]["error"] == "invite_not_found"


# ── Doctor: onboarding routes are public (no session needed) ───────

def test_onboarding_does_not_require_session(client, seeded_doctor):
    """The doctor isn't logged in yet — these endpoints accept anonymous
    requests guarded only by the token. Verify no `current_user`
    dependency is wired in by checking 404 vs 401 on a stale token.
    """
    # Stale → 404, not 401. (401 would mean an auth dep ran first.)
    r = client.get("/doctor-onboarding/stale-token")
    assert r.status_code == 404


def test_onboarding_blocked_pre_init(client):
    """Before /setup/initialize, the gate 409s anything non-setup."""
    r = client.get("/doctor-onboarding/any-token")
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "setup_required"
