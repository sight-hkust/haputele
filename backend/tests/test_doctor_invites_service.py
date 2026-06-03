"""Tests for app/services/doctor_invites.py — the token lifecycle.

Covers:
  - issue() mints a row, hashes the token, sets expires_at.
  - issue() called twice revokes the prior live invite.
  - lookup_live() returns the row only for tokens that are live.
  - consume() updates the doctor's account password.
  - consume() rejects already-consumed / expired tokens with 404
    `invite_not_found`.
  - build_invite_link() refuses when FRONTEND_BASE_URL is empty.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest

from app.database import SessionLocal
from app.models import Account, DoctorInvite
from app.security import verify_password
from app.services import doctor_invites as invites


def test_issue_mints_row_with_hashed_token(seeded_doctor):
    db = SessionLocal()
    try:
        row, raw = invites.issue(db, doctor_id=seeded_doctor.doctor_id)
        # The raw token never leaves this function past the return — the DB
        # only stores the sha256 hex.
        assert row.token_hash == hashlib.sha256(raw.encode()).hexdigest()
        assert row.token_hash != raw
        assert len(row.token_hash) == 64
        # Expires in the future, within DOCTOR_INVITE_TTL_HOURS tolerance.
        now = datetime.now(timezone.utc)
        assert row.expires_at > now
        assert row.expires_at < now + timedelta(hours=200)
        assert row.consumed_at is None
    finally:
        db.close()


def test_issue_revokes_prior_live_invite(seeded_doctor):
    db = SessionLocal()
    try:
        _, raw1 = invites.issue(db, doctor_id=seeded_doctor.doctor_id)
        _, raw2 = invites.issue(db, doctor_id=seeded_doctor.doctor_id)
        # The old token can no longer be looked up.
        with pytest.raises(Exception) as exc:
            invites.lookup_live(db, raw_token=raw1)
        assert "invite_not_found" in str(exc.value.detail)
        # The new token still works.
        row = invites.lookup_live(db, raw_token=raw2)
        assert row.doctor_id == seeded_doctor.doctor_id
    finally:
        db.close()


def test_issue_raises_when_doctor_missing():
    db = SessionLocal()
    try:
        with pytest.raises(Exception) as exc:
            invites.issue(db, doctor_id=9999)
        assert "doctor_not_found" in str(exc.value.detail)
    finally:
        db.close()


def test_lookup_live_rejects_unknown_token(initialized_system):
    db = SessionLocal()
    try:
        with pytest.raises(Exception) as exc:
            invites.lookup_live(db, raw_token="totally-fake-token")
        assert "invite_not_found" in str(exc.value.detail)
    finally:
        db.close()


def test_lookup_live_rejects_expired(seeded_doctor):
    """Manually backdate an invite past its expires_at."""
    db = SessionLocal()
    try:
        row, raw = invites.issue(db, doctor_id=seeded_doctor.doctor_id)
        row.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
        with pytest.raises(Exception) as exc:
            invites.lookup_live(db, raw_token=raw)
        assert "invite_not_found" in str(exc.value.detail)
    finally:
        db.close()


def test_consume_sets_password_and_marks_consumed(seeded_doctor):
    db = SessionLocal()
    try:
        _, raw = invites.issue(db, doctor_id=seeded_doctor.doctor_id)
        new_pw = "the-new-password-12345"
        doctor = invites.consume(db, raw_token=raw, new_password=new_pw)
        assert doctor.doctor_id == seeded_doctor.doctor_id

        # Account password was updated and verifies.
        account = db.get(Account, seeded_doctor.username)
        assert verify_password(new_pw, account.password)

        # Invite row is marked consumed.
        row = db.query(DoctorInvite).filter_by(doctor_id=doctor.doctor_id).first()
        assert row.consumed_at is not None
    finally:
        db.close()


def test_consume_rejects_second_use(seeded_doctor):
    db = SessionLocal()
    try:
        _, raw = invites.issue(db, doctor_id=seeded_doctor.doctor_id)
        invites.consume(db, raw_token=raw, new_password="first-password-12345")
        with pytest.raises(Exception) as exc:
            invites.consume(db, raw_token=raw, new_password="second-password-12345")
        assert "invite_not_found" in str(exc.value.detail)
    finally:
        db.close()


def test_consume_rejects_empty_password(seeded_doctor):
    db = SessionLocal()
    try:
        _, raw = invites.issue(db, doctor_id=seeded_doctor.doctor_id)
        with pytest.raises(Exception) as exc:
            invites.consume(db, raw_token=raw, new_password="")
        assert "missing_password" in str(exc.value.detail)
    finally:
        db.close()


def test_build_invite_link_requires_frontend_base_url(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "")
    with pytest.raises(Exception) as exc:
        invites.build_invite_link("some-token")
    assert "frontend_base_url_not_configured" in str(exc.value.detail)


def test_build_invite_link_constructs_expected_url(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "https://app.test")
    url = invites.build_invite_link("abc-123_xyz")
    assert url == "https://app.test/doctor-onboarding/abc-123_xyz"
