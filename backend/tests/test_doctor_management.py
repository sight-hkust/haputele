"""Tests for the doctor-management improvements layered on top of the
invite-by-email + approval flow.

Covers:
  - Rejection records the actor (rejected_by) and preserves the row.
  - A rejected doctor can be re-invited to reapply with the SAME email
    (previously blocked by email_already_used), and the fresh submission
    links back to the rejected attempt via previousDoctorId.
  - reinvite-reapply refuses non-rejected doctors.
  - The case-insensitive live-email guard blocks a second live account.
  - Purge hard-deletes a rejected record (and only a rejected one).
  - The /doctors/summary counts and the ?status= list filter.
  - approve / legacy-create record approved_by + submittedAt.
"""
from __future__ import annotations

import base64

from app.database import SessionLocal
from app.models import Account, Doctor
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


def _fresh_token(email: str, family_name: str | None = None) -> str:
    """Mint a new-doctor invite directly via the service and return its raw
    token. Revokes any prior live invite for the email — fine in tests."""
    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue_new_doctor(db, email=email, family_name=family_name)
    finally:
        db.close()
    return raw


def _onboard(client, email: str, **submission_overrides) -> None:
    raw = _fresh_token(email)
    r = client.post(f"/doctor-onboarding/{raw}", json=_submission(**submission_overrides))
    assert r.status_code == 204, r.text


def _doctor_id(admin_client, username: str) -> int:
    r = admin_client.get("/doctors")
    return next(d["id"] for d in r.json() if d["username"] == username)


# ── Rejection records actor + preserves row ──────────────────────────────

def test_reject_records_actor_and_preserves_row(
    admin_client, email_env, captured_emails, client,
):
    _onboard(client, "asha.silva@example.com")
    did = _doctor_id(admin_client, "drnewbie")

    r = admin_client.post(
        f"/doctors/{did}/reject", json={"reason": "blurry stamp"},
        headers=_csrf(admin_client),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["onboardingStatus"] == "rejected"
    assert body["rejectedReason"] == "blurry stamp"
    # test_admin is the admin_account fixture username.
    assert body["rejectedBy"] == "test_admin"
    assert body["submittedAt"] is not None

    # The row is preserved (tombstone), not deleted.
    db = SessionLocal()
    try:
        assert db.query(Doctor).filter_by(doctor_id=did).count() == 1
    finally:
        db.close()


# ── Reapply with the same email ──────────────────────────────────────────

def test_reapply_after_reject_succeeds_and_links_previous(
    admin_client, email_env, captured_emails, client,
):
    _onboard(client, "asha.silva@example.com")
    rejected_id = _doctor_id(admin_client, "drnewbie")
    admin_client.post(
        f"/doctors/{rejected_id}/reject", json={"reason": "x"},
        headers=_csrf(admin_client),
    )

    # Re-invite the rejected email to reapply — this is the case that used
    # to be impossible (email_already_used).
    r = admin_client.post(
        f"/doctors/{rejected_id}/reinvite-reapply", headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "asha.silva@example.com"

    # The doctor reapplies with the same email but a new username.
    raw = _fresh_token("asha.silva@example.com")
    r = client.post(
        f"/doctor-onboarding/{raw}",
        json=_submission(username="drnewbie2"),
    )
    assert r.status_code == 204, r.text

    new_id = _doctor_id(admin_client, "drnewbie2")
    r = admin_client.get(f"/doctors/{new_id}")
    new_doc = r.json()
    assert new_doc["onboardingStatus"] == "awaiting_approval"
    assert new_doc["previousDoctorId"] == rejected_id
    assert new_doc["email"] == "asha.silva@example.com"

    # The rejected attempt is still there as history.
    r = admin_client.get(f"/doctors/{rejected_id}")
    assert r.json()["onboardingStatus"] == "rejected"


def test_reinvite_reapply_refuses_non_rejected(
    admin_client, email_env, captured_emails, client,
):
    _onboard(client, "asha.silva@example.com")  # awaiting_approval, not rejected
    did = _doctor_id(admin_client, "drnewbie")
    r = admin_client.post(
        f"/doctors/{did}/reinvite-reapply", headers=_csrf(admin_client),
    )
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "doctor_not_rejected"


def test_live_email_guard_is_case_insensitive(
    admin_client, email_env, captured_emails, client,
):
    # Onboard a live (awaiting) doctor with a mixed-case email.
    raw = _fresh_token("Mixed@Example.com")
    r = client.post(f"/doctor-onboarding/{raw}", json=_submission())
    assert r.status_code == 204, r.text

    # A differently-cased invite for the same address is blocked.
    r = admin_client.post(
        "/doctors/invites", json={"email": "mixed@example.com"},
        headers=_csrf(admin_client),
    )
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "email_already_used"


# ── Purge ────────────────────────────────────────────────────────────────

def test_purge_removes_rejected_record(
    admin_client, email_env, captured_emails, client,
):
    _onboard(client, "asha.silva@example.com")
    did = _doctor_id(admin_client, "drnewbie")
    admin_client.post(
        f"/doctors/{did}/reject", json={"reason": "x"}, headers=_csrf(admin_client),
    )

    r = admin_client.delete(f"/doctors/{did}/purge", headers=_csrf(admin_client))
    assert r.status_code == 204, r.text

    db = SessionLocal()
    try:
        assert db.query(Doctor).filter_by(doctor_id=did).count() == 0
        assert db.query(Account).filter_by(username="drnewbie").count() == 0
    finally:
        db.close()


def test_purge_refuses_non_rejected(
    admin_client, email_env, captured_emails, client,
):
    _onboard(client, "asha.silva@example.com")  # awaiting_approval
    did = _doctor_id(admin_client, "drnewbie")
    r = admin_client.delete(f"/doctors/{did}/purge", headers=_csrf(admin_client))
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "doctor_not_rejected"


# ── Summary + status filter ──────────────────────────────────────────────

def test_summary_counts_by_status(
    admin_client, email_env, captured_emails, client,
):
    # One awaiting_approval, one approved, one rejected.
    _onboard(client, "await@example.com", username="dr_await")
    _onboard(client, "approve@example.com", username="dr_approve")
    _onboard(client, "reject@example.com", username="dr_reject")

    approve_id = _doctor_id(admin_client, "dr_approve")
    reject_id = _doctor_id(admin_client, "dr_reject")
    admin_client.post(f"/doctors/{approve_id}/approve", headers=_csrf(admin_client))
    admin_client.post(
        f"/doctors/{reject_id}/reject", json={"reason": "x"}, headers=_csrf(admin_client),
    )

    r = admin_client.get("/doctors/summary")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["awaitingApproval"] == 1
    assert s["active"] == 1
    assert s["rejected"] == 1
    assert s["total"] == 3


def test_list_status_filter(
    admin_client, email_env, captured_emails, client,
):
    _onboard(client, "await@example.com", username="dr_await")
    _onboard(client, "approve@example.com", username="dr_approve")
    approve_id = _doctor_id(admin_client, "dr_approve")
    admin_client.post(f"/doctors/{approve_id}/approve", headers=_csrf(admin_client))

    r = admin_client.get("/doctors?status=awaiting_approval")
    assert r.status_code == 200
    usernames = {d["username"] for d in r.json()}
    assert usernames == {"dr_await"}

    r = admin_client.get("/doctors?status=active")
    assert {d["username"] for d in r.json()} == {"dr_approve"}

    r = admin_client.get("/doctors?status=bogus")
    assert r.status_code == 422
    assert r.json()["detail"]["error"] == "invalid_status"


# ── Actor on approve + legacy create ─────────────────────────────────────

def test_approve_records_approved_by(
    admin_client, email_env, captured_emails, client,
):
    _onboard(client, "asha.silva@example.com")
    did = _doctor_id(admin_client, "drnewbie")
    r = admin_client.post(f"/doctors/{did}/approve", headers=_csrf(admin_client))
    assert r.status_code == 200
    assert r.json()["approvedBy"] == "test_admin"


def test_legacy_create_records_approved_by_and_submitted_at(
    admin_client, email_env, captured_emails,
):
    r = admin_client.post(
        "/doctors",
        json={
            "username": "dr_manual",
            "password": "Manual-Password-123",
            "givenName": "Manual",
            "familyName": "Doctor",
            "contact": "+94 11 000 0000",
            "email": "manual@example.com",
            "slmcRegistrationNumber": "SLMC-1",
            "qualifications": "MBBS",
            "practitionerAddress": "1 St",
            "instituteName": "Clinic",
            "instituteContact": "+94 11 111 1111",
            "rubberStampImage": _PNG_1x1,
        },
        headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["onboardingStatus"] == "active"
    assert body["approvedBy"] == "test_admin"
    assert body["submittedAt"] is not None
