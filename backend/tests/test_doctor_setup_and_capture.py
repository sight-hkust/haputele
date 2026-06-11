"""Regressions for two setup-stage fixes:

  1. A doctor can mint a `rubber_stamp` capture session from their own
     self-service profile page (previously admin-only → 403 → the UI showed
     "Something went wrong").
  2. A doctor still finishing setup (live setup invite, no password yet) is
     `awaiting_setup` — not bookable — so they're hidden from the
     healthworker/colleague doctor list, while admins still see them.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import Account, Doctor, DoctorInvite
from app.security import hash_password


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


def _seed_doctor(*, username, email, password, approved=True, live_invite=False):
    """Seed an Account + Doctor; optionally attach a live rotation invite
    (which makes the doctor `awaiting_setup`)."""
    db = SessionLocal()
    try:
        db.add(Account(
            username=username, password=hash_password(password), role="doctor",
        ))
        doctor = Doctor(
            username=username, given_name="Test", family_name="Doctor",
            contact="+94 11 000 0000", email=email,
            slmc_registration_number=f"SLMC-{username}", qualifications="MBBS",
            practitioner_address="Addr", institute_name="Clinic",
            institute_contact="+94 11 111 1111",
            rubber_stamp_key="test/stub-stamp-key.png", active=True,
            approved_at=datetime.now(timezone.utc) if approved else None,
        )
        db.add(doctor)
        db.flush()
        if live_invite:
            raw = secrets.token_urlsafe(32)
            db.add(DoctorInvite(
                doctor_id=doctor.doctor_id, email=email,
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
            ))
        db.commit()
        return doctor.doctor_id
    finally:
        db.close()


def _login(client, username, password):
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


# ── 1. Capture session authz for the rubber stamp ──────────────────────

def test_doctor_can_mint_rubber_stamp_capture_session(client, initialized_system):
    _seed_doctor(username="dr_cap", email="dr_cap@example.com", password="DrCap-Pass-123")
    _login(client, "dr_cap", "DrCap-Pass-123")

    r = client.post(
        "/capture/sessions", json={"purpose": "rubber_stamp"}, headers=_csrf(client),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["purpose"] == "rubber_stamp"
    assert body["token"]


def test_admin_can_still_mint_rubber_stamp_capture_session(admin_client):
    r = admin_client.post(
        "/capture/sessions", json={"purpose": "rubber_stamp"},
        headers=_csrf(admin_client),
    )
    assert r.status_code == 201, r.text


def test_healthworker_cannot_mint_rubber_stamp_capture_session(
    client, healthworker_account,
):
    hw_user, hw_pw = healthworker_account
    _login(client, hw_user, hw_pw)
    r = client.post(
        "/capture/sessions", json={"purpose": "rubber_stamp"}, headers=_csrf(client),
    )
    assert r.status_code == 403, r.text


# ── 2. awaiting_setup doctors aren't bookable ──────────────────────────

def test_awaiting_setup_doctor_hidden_from_healthworker_but_visible_to_admin(
    admin_client, healthworker_account,
):
    _seed_doctor(
        username="dr_pending", email="dr_pending@example.com",
        password="x" * 24, approved=True, live_invite=True,
    )

    # Admin sees the doctor, computed as awaiting_setup (approved + live invite).
    admin_view = {d["username"]: d for d in admin_client.get("/doctors").json()}
    assert admin_view["dr_pending"]["onboardingStatus"] == "awaiting_setup"

    # Switch to healthworker on the shared client — the doctor is NOT bookable
    # yet (can't log in), so it must not appear in their list.
    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    hw_user, hw_pw = healthworker_account
    _login(admin_client, hw_user, hw_pw)
    hw_view = {d["username"] for d in admin_client.get("/doctors").json()}
    assert "dr_pending" not in hw_view


def test_active_doctor_still_visible_to_healthworker(
    admin_client, healthworker_account,
):
    """Guard against over-filtering: a fully active doctor (no live invite)
    stays bookable."""
    _seed_doctor(
        username="dr_active", email="dr_active@example.com",
        password="x" * 24, approved=True, live_invite=False,
    )
    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    hw_user, hw_pw = healthworker_account
    _login(admin_client, hw_user, hw_pw)
    hw_view = {d["username"] for d in admin_client.get("/doctors").json()}
    assert "dr_active" in hw_view
