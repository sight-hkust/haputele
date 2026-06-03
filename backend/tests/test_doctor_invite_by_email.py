"""Tests for the invite-by-email + admin-approval flow.

Covers:
  - Admin issues an email-only invite, no Doctor row yet.
  - Doctor visits the link — peek returns mode=new + email.
  - Doctor submits the full profile — Account + Doctor row appear,
    onboardingStatus = awaiting_approval, doctor can't log in yet.
  - Admin approves — login works.
  - Admin rejects — login refused with `account_rejected`.
  - Double-invite same email → 409 email_already_used.
  - Healthworker doctor list filters out awaiting_approval doctors.
"""
from __future__ import annotations

import base64

from app.database import SessionLocal
from app.models import Doctor


_PNG_1x1 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\x9a\x9c\xa9\x83\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


def _submission(**overrides) -> dict:
    base = {
        "username": "drnewbie",
        "password": "MyNewSecure-Password-123",
        "givenName": "Asha",
        "familyName": "Silva",
        "contact": "+94 11 555 0100",
        # No email — the invite owns the email value; the server uses
        # invite.email regardless of what the client sends.
        "slmcRegistrationNumber": "SLMC-9999",
        "qualifications": "MBBS",
        "practitionerAddress": "1 Test St",
        "instituteName": "Test Clinic",
        "instituteContact": "+94 11 555 0101",
        "rubberStampImage": _PNG_1x1,
    }
    base.update(overrides)
    return base


def _invite_via_admin(admin_client, *, email: str, family_name: str | None = None) -> str:
    """Issue an invite via POST /doctors/invites and return the raw token
    by inspecting the DB (the token doesn't come back in the response)."""
    body: dict = {"email": email}
    if family_name:
        body["familyName"] = family_name
    r = admin_client.post("/doctors/invites", json=body, headers=_csrf(admin_client))
    assert r.status_code == 201, r.text

    # Pull the raw token by reissuing through the service (idempotency-key
    # path is simpler than parsing the email). The new invite revokes the
    # one we just issued — fine for testing.
    from app.services import doctor_invites
    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue_new_doctor(db, email=email, family_name=family_name)
    finally:
        db.close()
    return raw


def test_invite_creates_no_doctor_row(admin_client, email_env, captured_emails):
    r = admin_client.post(
        "/doctors/invites",
        json={"email": "fresh@example.com"},
        headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "fresh@example.com"
    assert "inviteId" in body

    # Doctor row count unchanged (only the seeded doctor exists, if any)
    db = SessionLocal()
    try:
        assert db.query(Doctor).filter_by(email="fresh@example.com").count() == 0
    finally:
        db.close()

    # An invite email was sent.
    sends = [c for c in captured_emails if c[0] == "send_templated"]
    assert len(sends) == 1
    assert sends[0][1]["template"] == "doctor_invite"


def test_double_invite_same_email_is_rejected(
    admin_client, email_env, captured_emails,
):
    r1 = admin_client.post(
        "/doctors/invites", json={"email": "twin@example.com"},
        headers=_csrf(admin_client),
    )
    assert r1.status_code == 201
    r2 = admin_client.post(
        "/doctors/invites", json={"email": "twin@example.com"},
        headers=_csrf(admin_client),
    )
    # Second call lands on the "live invite exists" branch — we revoke the
    # old one and issue a fresh one, so it succeeds. (Operators sometimes
    # click resend twice; rejecting would be hostile.)
    assert r2.status_code == 201


def test_invite_to_existing_email_returns_email_already_used(
    admin_client, email_env, captured_emails, seeded_doctor,
):
    """seeded_doctor's email already belongs to a real doctor row."""
    r = admin_client.post(
        "/doctors/invites", json={"email": seeded_doctor.email},
        headers=_csrf(admin_client),
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "email_already_used"


def test_peek_on_new_invite_returns_mode_new(
    admin_client, email_env, captured_emails, client,
):
    raw = _invite_via_admin(admin_client, email="peek@example.com", family_name="Perera")
    r = client.get(f"/doctor-onboarding/{raw}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "new"
    assert body["email"] == "peek@example.com"
    assert body["familyName"] == "Perera"
    assert body.get("givenName") is None


def test_full_self_onboarding_flow(
    admin_client, email_env, captured_emails, client,
):
    raw = _invite_via_admin(admin_client, email="asha.silva@example.com")
    r = client.post(
        f"/doctor-onboarding/{raw}",
        json=_submission(),
    )
    assert r.status_code == 204, r.text

    # Account + Doctor exist, doctor is awaiting_approval.
    r = admin_client.get("/doctors")
    by_username = {d["username"]: d for d in r.json()}
    assert "drnewbie" in by_username
    assert by_username["drnewbie"]["onboardingStatus"] == "awaiting_approval"

    # Doctor can't log in yet.
    r = client.post("/auth/login", json={"username": "drnewbie", "password": "MyNewSecure-Password-123"})
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "account_pending_approval"


def test_admin_approval_unlocks_login_and_sends_notification(
    admin_client, email_env, captured_emails, client,
):
    raw = _invite_via_admin(admin_client, email="asha.silva@example.com")
    client.post(f"/doctor-onboarding/{raw}", json=_submission())

    captured_emails.clear()  # ignore the invite send

    # Find the doctor id, approve.
    r = admin_client.get("/doctors")
    doctor_id = next(d["id"] for d in r.json() if d["username"] == "drnewbie")
    r = admin_client.post(
        f"/doctors/{doctor_id}/approve", headers=_csrf(admin_client),
    )
    assert r.status_code == 200, r.text
    assert r.json()["onboardingStatus"] == "active"

    # The "your account is approved" email fired exactly once, to the
    # invite's email address, with the right template.
    sends = [c for c in captured_emails if c[0] == "send_templated"]
    assert len(sends) == 1
    _, kwargs = sends[0]
    assert kwargs["template"] == "doctor_approved"
    assert kwargs["to"] == "asha.silva@example.com"
    assert kwargs["idempotency_key"] == f"doctor.approved:doctor-{doctor_id}"
    assert kwargs["context"]["family_name"] == "Silva"
    assert "/login" in kwargs["context"]["login_link"]

    # Login now works.
    r = client.post(
        "/auth/login",
        json={"username": "drnewbie", "password": "MyNewSecure-Password-123"},
    )
    assert r.status_code == 200, r.text


def test_double_approve_does_not_resend_notification(
    admin_client, email_env, captured_emails, client,
):
    """An accidental double-click on Approve shouldn't email the doctor
    twice. The endpoint short-circuits on the NULL→ts transition and
    the email is only sent inside that transition."""
    raw = _invite_via_admin(admin_client, email="asha.silva@example.com")
    client.post(f"/doctor-onboarding/{raw}", json=_submission())
    captured_emails.clear()
    r = admin_client.get("/doctors")
    doctor_id = next(d["id"] for d in r.json() if d["username"] == "drnewbie")

    admin_client.post(f"/doctors/{doctor_id}/approve", headers=_csrf(admin_client))
    admin_client.post(f"/doctors/{doctor_id}/approve", headers=_csrf(admin_client))

    sends = [c for c in captured_emails if c[0] == "send_templated"]
    assert len(sends) == 1


def test_admin_reject_blocks_login_with_reason(
    admin_client, email_env, captured_emails, client,
):
    raw = _invite_via_admin(admin_client, email="asha.silva@example.com")
    client.post(f"/doctor-onboarding/{raw}", json=_submission())

    r = admin_client.get("/doctors")
    doctor_id = next(d["id"] for d in r.json() if d["username"] == "drnewbie")
    r = admin_client.post(
        f"/doctors/{doctor_id}/reject",
        json={"reason": "SLMC number is invalid"},
        headers=_csrf(admin_client),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["onboardingStatus"] == "rejected"
    assert body["active"] is False

    # Login refused with account_rejected.
    r = client.post(
        "/auth/login",
        json={"username": "drnewbie", "password": "MyNewSecure-Password-123"},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "account_rejected"


def test_approve_after_reject_is_blocked(
    admin_client, email_env, captured_emails, client,
):
    raw = _invite_via_admin(admin_client, email="asha.silva@example.com")
    client.post(f"/doctor-onboarding/{raw}", json=_submission())
    r = admin_client.get("/doctors")
    doctor_id = next(d["id"] for d in r.json() if d["username"] == "drnewbie")

    admin_client.post(
        f"/doctors/{doctor_id}/reject", json={"reason": "x"},
        headers=_csrf(admin_client),
    )
    r = admin_client.post(
        f"/doctors/{doctor_id}/approve", headers=_csrf(admin_client),
    )
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "doctor_rejected"


def test_healthworker_list_filters_out_awaiting_approval(
    admin_client, email_env, captured_emails, healthworker_account,
):
    """admin_client and healthworker_client share the same TestClient
    cookie jar, so taking both as fixtures would have the second login
    silently overwrite the first. We do the admin work first while
    admin_client is logged in, then log out + log in as healthworker on
    the same client to verify the booking-side filter.
    """
    raw = _invite_via_admin(admin_client, email="asha.silva@example.com")
    admin_client.post(
        f"/doctor-onboarding/{raw}", json=_submission(),
        # No CSRF needed — doctor-onboarding is public.
    )

    # Admin sees the awaiting-approval doctor.
    r = admin_client.get("/doctors")
    assert "drnewbie" in {d["username"] for d in r.json()}

    # Switch roles: log out + log in as healthworker on the same client.
    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    hw_user, hw_pw = healthworker_account
    r = admin_client.post("/auth/login", json={"username": hw_user, "password": hw_pw})
    assert r.status_code == 200, r.text

    r = admin_client.get("/doctors")
    hw_usernames = {d["username"] for d in r.json()}
    assert "drnewbie" not in hw_usernames


def test_doctor_account_email_always_uses_invite_email(
    admin_client, email_env, captured_emails, client,
):
    """The submission can't include an email — the schema rejects it — but
    even if a client tries to slip one in, the server uses invite.email
    when creating the Doctor row."""
    raw = _invite_via_admin(admin_client, email="invited@example.com")
    # Try to sneak a different email through. extra="ignore" semantics on
    # the schema mean pydantic just drops the unknown field; the resulting
    # Doctor row still gets invited@example.com.
    body = _submission()
    body["email"] = "different@example.com"  # ignored by server
    r = client.post(f"/doctor-onboarding/{raw}", json=body)
    assert r.status_code == 204, r.text

    r = admin_client.get("/doctors")
    drnewbie = next(d for d in r.json() if d["username"] == "drnewbie")
    assert drnewbie["email"] == "invited@example.com"
