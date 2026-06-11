"""Tests for surfacing open email-only doctor invites in the admin queue.

The email-only invite flow (`POST /doctors/invites`) creates a
`doctor_invites` row with `doctor_id = NULL` and no Doctor row until the
invitee completes onboarding. These endpoints make that pending invite
visible to the admin and let them resend / revoke it:

  - GET    /doctors/invites              → open (unconsumed, doctor-less) invites
  - POST   /doctors/invites/{id}/resend  → fresh token + email, old link dies
  - DELETE /doctors/invites/{id}         → revoke (link dies, drops from list)
  - GET    /doctors/summary              → now carries an `invited` count
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import Account, Doctor, DoctorInvite
from app.security import hash_password


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
        "slmcRegistrationNumber": "SLMC-9999",
        "qualifications": "MBBS",
        "practitionerAddress": "1 Test St",
        "instituteName": "Test Clinic",
        "instituteContact": "+94 11 555 0101",
        "rubberStampImage": _PNG_1x1,
    }
    base.update(overrides)
    return base


def _last_invite_token(captured_emails) -> str:
    """Pull the raw onboarding token out of the most recently captured
    invite email (the link is `.../doctor-onboarding/<raw>`)."""
    sends = [c for c in captured_emails if c[0] == "send_templated"]
    assert sends, "expected an invite email to have been sent"
    link = sends[-1][1]["context"]["link"]
    return link.rstrip("/").rsplit("/", 1)[-1]


def _issue(admin_client, captured_emails, email, family_name=None):
    """POST /doctors/invites and return (invite_id, raw_token)."""
    body: dict = {"email": email}
    if family_name:
        body["familyName"] = family_name
    r = admin_client.post("/doctors/invites", json=body, headers=_csrf(admin_client))
    assert r.status_code == 201, r.text
    return r.json()["inviteId"], _last_invite_token(captured_emails)


def _expire_invite(invite_id: int) -> None:
    db = SessionLocal()
    try:
        inv = db.get(DoctorInvite, invite_id)
        inv.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
    finally:
        db.close()


def _insert_live_doctor(email: str, username: str = "dr_collision") -> None:
    """Insert an approved Doctor holding `email` — simulates the address
    becoming a live doctor after an open invite was already issued for it."""
    db = SessionLocal()
    try:
        db.add(Account(
            username=username, password=hash_password("x" * 24), role="doctor",
        ))
        db.add(Doctor(
            username=username, given_name="Live", family_name="Doctor",
            contact="+94 11 000 0000", email=email,
            slmc_registration_number="SLMC-COLLIDE", qualifications="MBBS",
            practitioner_address="Addr", institute_name="Clinic",
            institute_contact="+94 11 111 1111",
            rubber_stamp_key="test/stub.png", active=True,
            approved_at=datetime.now(timezone.utc),
        ))
        db.commit()
    finally:
        db.close()


# ── GET /doctors/invites ───────────────────────────────────────────────

def test_open_invite_is_listed_with_invited_status(
    admin_client, email_env, captured_emails,
):
    invite_id, _ = _issue(admin_client, captured_emails, "pending@example.com", "Perera")

    r = admin_client.get("/doctors/invites")
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 1
    item = items[0]
    assert item["inviteId"] == invite_id
    assert item["email"] == "pending@example.com"
    assert item["familyName"] == "Perera"
    assert item["status"] == "invited"
    assert "createdAt" in item and "expiresAt" in item


def test_expired_invite_shows_invite_expired_status(
    admin_client, email_env, captured_emails,
):
    invite_id, _ = _issue(admin_client, captured_emails, "lapsed@example.com")
    _expire_invite(invite_id)

    items = admin_client.get("/doctors/invites").json()
    assert len(items) == 1
    assert items[0]["status"] == "invite_expired"


def test_consumed_invite_drops_from_open_list(
    admin_client, email_env, captured_emails,
):
    """Once the doctor onboards, the invite is consumed + linked to the new
    Doctor row, so it leaves the open list (the doctor now shows under
    awaiting_approval instead)."""
    _, raw = _issue(admin_client, captured_emails, "onboards@example.com")
    r = admin_client.post(f"/doctor-onboarding/{raw}", json=_submission())
    assert r.status_code == 204, r.text

    emails = {i["email"] for i in admin_client.get("/doctors/invites").json()}
    assert "onboards@example.com" not in emails
    # ...and the doctor is now visible in the regular list, awaiting approval.
    doctors = admin_client.get("/doctors").json()
    assert any(d["username"] == "drnewbie"
               and d["onboardingStatus"] == "awaiting_approval" for d in doctors)


# ── POST /doctors/invites/{id}/resend ──────────────────────────────────

def test_resend_supersedes_old_token_and_keeps_single_open_invite(
    admin_client, email_env, captured_emails, client,
):
    invite_id, raw_old = _issue(admin_client, captured_emails, "resend@example.com")

    r = admin_client.post(
        f"/doctors/invites/{invite_id}/resend", headers=_csrf(admin_client),
    )
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["email"] == "resend@example.com"
    assert new["status"] == "invited"
    assert new["inviteId"] != invite_id
    raw_new = _last_invite_token(captured_emails)

    # Old link is dead; new link is live.
    assert client.get(f"/doctor-onboarding/{raw_old}").status_code == 404
    peek = client.get(f"/doctor-onboarding/{raw_new}")
    assert peek.status_code == 200 and peek.json()["mode"] == "new"

    # Exactly one open invite remains for the address (no duplicate).
    items = [i for i in admin_client.get("/doctors/invites").json()
             if i["email"] == "resend@example.com"]
    assert len(items) == 1
    assert items[0]["inviteId"] == new["inviteId"]


def test_resend_of_expired_invite_leaves_no_duplicate(
    admin_client, email_env, captured_emails,
):
    """The wrinkle: issue_new_doctor only revokes *live* invites, so an
    expired source must be revoked explicitly or it lingers as a duplicate."""
    invite_id, _ = _issue(admin_client, captured_emails, "expired-resend@example.com")
    _expire_invite(invite_id)

    r = admin_client.post(
        f"/doctors/invites/{invite_id}/resend", headers=_csrf(admin_client),
    )
    assert r.status_code == 200, r.text

    items = [i for i in admin_client.get("/doctors/invites").json()
             if i["email"] == "expired-resend@example.com"]
    assert len(items) == 1
    assert items[0]["status"] == "invited"


def test_resend_409_when_email_became_live_doctor(
    admin_client, email_env, captured_emails,
):
    invite_id, _ = _issue(admin_client, captured_emails, "raced@example.com")
    _insert_live_doctor("raced@example.com")

    r = admin_client.post(
        f"/doctors/invites/{invite_id}/resend", headers=_csrf(admin_client),
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "email_already_used"


def test_resend_unknown_invite_404(admin_client, email_env, captured_emails):
    r = admin_client.post(
        "/doctors/invites/999999/resend", headers=_csrf(admin_client),
    )
    assert r.status_code == 404
    assert r.json()["detail"]["error"] == "invite_not_found"


# ── DELETE /doctors/invites/{id} (revoke) ──────────────────────────────

def test_revoke_drops_invite_kills_link_and_allows_reinvite(
    admin_client, email_env, captured_emails, client,
):
    invite_id, raw = _issue(admin_client, captured_emails, "revoke@example.com")

    r = admin_client.delete(
        f"/doctors/invites/{invite_id}", headers=_csrf(admin_client),
    )
    assert r.status_code == 204, r.text

    # Gone from the list, link is dead.
    emails = {i["email"] for i in admin_client.get("/doctors/invites").json()}
    assert "revoke@example.com" not in emails
    assert client.get(f"/doctor-onboarding/{raw}").status_code == 404

    # The address is free to invite again.
    r = admin_client.post(
        "/doctors/invites", json={"email": "revoke@example.com"},
        headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text


def test_revoke_unknown_invite_404(admin_client, email_env, captured_emails):
    r = admin_client.delete(
        "/doctors/invites/999999", headers=_csrf(admin_client),
    )
    assert r.status_code == 404
    assert r.json()["detail"]["error"] == "invite_not_found"


def test_revoke_consumed_invite_404(
    admin_client, email_env, captured_emails,
):
    """A consumed (now doctor-linked) invite isn't an open invite."""
    invite_id, raw = _issue(admin_client, captured_emails, "done@example.com")
    admin_client.post(f"/doctor-onboarding/{raw}", json=_submission())

    r = admin_client.delete(
        f"/doctors/invites/{invite_id}", headers=_csrf(admin_client),
    )
    assert r.status_code == 404


# ── GET /doctors/summary → invited count ───────────────────────────────

def test_summary_invited_count_tracks_open_invites(
    admin_client, email_env, captured_emails,
):
    assert admin_client.get("/doctors/summary").json()["invited"] == 0

    id1, _ = _issue(admin_client, captured_emails, "s1@example.com")
    _issue(admin_client, captured_emails, "s2@example.com")
    assert admin_client.get("/doctors/summary").json()["invited"] == 2

    # Expired invites still count (they're still actionable / visible).
    _expire_invite(id1)
    assert admin_client.get("/doctors/summary").json()["invited"] == 2

    # Revoking drops the count.
    admin_client.delete(f"/doctors/invites/{id1}", headers=_csrf(admin_client))
    assert admin_client.get("/doctors/summary").json()["invited"] == 1


# ── AuthZ ──────────────────────────────────────────────────────────────

def test_invite_endpoints_forbidden_for_non_admin(
    admin_client, email_env, captured_emails, healthworker_account,
):
    invite_id, _ = _issue(admin_client, captured_emails, "guard@example.com")

    # Switch from admin to healthworker on the shared client.
    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    hw_user, hw_pw = healthworker_account
    assert admin_client.post(
        "/auth/login", json={"username": hw_user, "password": hw_pw},
    ).status_code == 200

    assert admin_client.get("/doctors/invites").status_code == 403
    assert admin_client.post(
        f"/doctors/invites/{invite_id}/resend", headers=_csrf(admin_client),
    ).status_code == 403
    assert admin_client.delete(
        f"/doctors/invites/{invite_id}", headers=_csrf(admin_client),
    ).status_code == 403
