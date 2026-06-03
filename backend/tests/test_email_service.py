"""Tests for app/services/email.py.

These tests don't hit the live Resend API — `captured_emails` swaps the
send functions for in-memory recorders. The point is to verify that the
service's own logic (suppression filtering, tag sanitisation, template
render contract) does what the docstrings claim.
"""
from __future__ import annotations

import pytest

from app.database import SessionLocal
from app.models import EmailSuppression
from app.services import email as email_svc


# ── Configuration state ────────────────────────────────────────────

def test_is_configured_false_when_api_key_missing(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")
    monkeypatch.setattr(settings, "RESEND_FROM", "from@example.com")
    assert email_svc.is_configured() is False


def test_is_configured_false_when_from_missing(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_x")
    monkeypatch.setattr(settings, "RESEND_FROM", "")
    assert email_svc.is_configured() is False


def test_is_configured_true_when_both_set(email_env):
    assert email_svc.is_configured() is True


def test_send_email_raises_when_not_configured(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")
    db = SessionLocal()
    try:
        with pytest.raises(Exception) as exc:
            email_svc.send_email(db, to="x@example.com", subject="s", html="<p>h</p>")
        # HTTPException with our standard error envelope.
        assert "email_not_configured" in str(exc.value.detail)
    finally:
        db.close()


# ── Suppression filter ─────────────────────────────────────────────

def test_filter_suppressed_partitions_correctly():
    db = SessionLocal()
    try:
        db.add(EmailSuppression(email="bouncy@example.com", reason="bounced.hard"))
        db.commit()
        sendable, suppressed = email_svc._filter_suppressed(
            db, ["bouncy@example.com", "Fresh@example.com", " AlsoFresh@Example.com "]
        )
        # Both lists are lowercased + trimmed for primary-key match.
        assert "fresh@example.com" in sendable
        assert "alsofresh@example.com" in sendable
        assert "bouncy@example.com" not in sendable
        assert suppressed == ["bouncy@example.com"]
    finally:
        db.close()


def test_filter_suppressed_empty_input():
    db = SessionLocal()
    try:
        assert email_svc._filter_suppressed(db, []) == ([], [])
        assert email_svc._filter_suppressed(db, ["", None]) == ([], [])  # type: ignore[list-item]
    finally:
        db.close()


def test_suppress_is_idempotent():
    """Calling suppress() twice for the same address upserts in place."""
    db = SessionLocal()
    try:
        email_svc.suppress(db, email="DUPE@example.com", reason="bounced.hard")
        email_svc.suppress(db, email="dupe@example.com", reason="complained")
        row = db.get(EmailSuppression, "dupe@example.com")
        assert row is not None
        # The second call's reason wins.
        assert row.reason == "complained"
        # And there's exactly one row.
        n = db.query(EmailSuppression).filter_by(email="dupe@example.com").count()
        assert n == 1
    finally:
        db.close()


# ── Tag sanitisation ────────────────────────────────────────────────

def test_tag_sanitizer_strips_disallowed_chars():
    # Internal kind values use dots; Resend forbids them. The sanitizer
    # must produce strictly [A-Za-z0-9_-]. Dots, spaces, colons → "_".
    assert email_svc._sanitize_tag("reminder.t-24h") == "reminder_t-24h"
    assert email_svc._sanitize_tag("doctor.invite") == "doctor_invite"
    assert email_svc._sanitize_tag("foo bar:baz/qux") == "foo_bar_baz_qux"
    assert email_svc._sanitize_tag("already_safe-1") == "already_safe-1"
    assert email_svc._sanitize_tag("123") == "123"


# ── Template rendering ──────────────────────────────────────────────

def test_render_doctor_invite_rotation_mode():
    html, text = email_svc.render(
        "doctor_invite",
        mode="rotation",
        family_name="Perera",
        link="https://x.test/d/abc",
        expires_hours=72,
    )
    # Rotation copy must include the password language and the family name
    # in the greeting; new-doctor language must not.
    assert "Perera" in html and "Perera" in text
    assert "Set your password" in html
    assert "An account has been created" in text
    assert "provide your information" not in text.lower()
    assert "72" in text


def test_render_doctor_invite_new_mode_no_family_name():
    html, text = email_svc.render(
        "doctor_invite",
        mode="new",
        family_name=None,
        link="https://x.test/d/abc",
        expires_hours=72,
    )
    # No-name fallback addresses them by role — "Hi Doctor," — since the
    # whole point of the invite is they're joining the practitioner
    # programme. New-doctor copy talks about providing information and
    # admin approval rather than setting a password.
    assert "Hi Doctor," in text
    assert "Hi there" not in text
    assert "provide your information" in text.lower()
    assert "review" in text.lower() or "approved" in text.lower()
    assert "Set your password" not in text


def test_render_doctor_invite_new_mode_with_family_name():
    html, text = email_svc.render(
        "doctor_invite",
        mode="new",
        family_name="Perera",
        link="https://x.test/d/abc",
        expires_hours=72,
    )
    # With a name hint, both modes greet "Hi Dr. {family_name}," —
    # consistent and respectful.
    assert "Hi Dr. Perera," in text


def test_render_appointment_reminder_branches_on_window():
    html_24, text_24 = email_svc.render(
        "appointment_reminder",
        doctor_family_name="Perera",
        patient_given_name="Asha", patient_family_name="Silva",
        scheduled_at_local="2026-05-29 14:30 (Asia/Colombo)",
        appointment_id=42, window="t-24h",
    )
    html_1, text_1 = email_svc.render(
        "appointment_reminder",
        doctor_family_name="Perera",
        patient_given_name="Asha", patient_family_name="Silva",
        scheduled_at_local="2026-05-28 15:30 (Asia/Colombo)",
        appointment_id=42, window="t-1h",
    )
    assert "tomorrow" in text_24
    assert "tomorrow" not in text_1
    assert "in about an hour" in text_1


def test_render_unknown_template_raises():
    with pytest.raises(RuntimeError) as exc:
        email_svc.render("does_not_exist", x=1)
    assert "does_not_exist" in str(exc.value)


def test_render_undefined_variable_raises():
    """StrictUndefined turns typos into immediate exceptions instead of
    silently rendering blanks — important for catching template bugs in
    CI rather than after the email has gone out.
    """
    with pytest.raises(Exception):
        # appointment_reminder requires window, scheduled_at_local, etc.
        email_svc.render("appointment_reminder", doctor_family_name="P")


# ── send_email integration with captured_emails ────────────────────

def test_send_email_passes_scheduled_at_and_idempotency_to_sdk(
    email_env, monkeypatch,
):
    """Verify the real send_email() (un-mocked) forwards scheduled_at +
    idempotency_key to the Resend SDK call as ISO 8601 + SendOptions."""
    from datetime import datetime, timezone
    captured: dict = {}

    def _fake_send(params, options=None):
        captured["params"] = params
        captured["options"] = options
        return {"id": "fake-id"}

    monkeypatch.setattr("resend.Emails.send", _fake_send)

    import importlib
    import app.services.email as real
    importlib.reload(real)

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        when = datetime(2026, 6, 1, 14, 0, tzinfo=timezone.utc)
        real.send_email(
            db, to="x@example.com", subject="s", html="<p>h</p>",
            scheduled_at=when, idempotency_key="reminder.t-24h:appt-42",
        )
    finally:
        db.close()

    assert captured["params"]["scheduled_at"] == "2026-06-01T14:00:00+00:00"
    assert captured["options"] == {"idempotency_key": "reminder.t-24h:appt-42"}


def test_send_email_naive_datetime_treated_as_utc(email_env, monkeypatch):
    """A naive datetime gets a UTC tzinfo before being serialised — no
    silent timezone shift."""
    from datetime import datetime
    captured: dict = {}

    def _fake_send(params, options=None):
        captured["params"] = params
        return {"id": "fake-id"}

    monkeypatch.setattr("resend.Emails.send", _fake_send)

    import importlib
    import app.services.email as real
    importlib.reload(real)

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        real.send_email(
            db, to="x@example.com", subject="s", html="<p>h</p>",
            scheduled_at=datetime(2026, 6, 1, 14, 0),  # naive
        )
    finally:
        db.close()

    assert captured["params"]["scheduled_at"] == "2026-06-01T14:00:00+00:00"


def test_send_email_skips_suppressed_recipients(email_env, captured_emails):
    """When every recipient is on the suppression list, no Resend call
    happens — verified by `captured_emails` staying empty for the real
    Resend SDK path. (Our mock replaces send_email itself, so we test
    the real one via _filter_suppressed; this test is a sanity check
    that the function returns None.)
    """
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        db.add(EmailSuppression(email="all@suppressed.test", reason="bounced.hard"))
        db.commit()
        # Use the real send_email (un-mocked), bypassing captured_emails:
        # the mock replaced services.email.send_email but we want to test
        # the real implementation. We reach in via the underlying module.
        import importlib
        import app.services.email as real
        importlib.reload(real)
        result = real.send_email(
            db, to="all@suppressed.test", subject="s", html="<p>h</p>",
        )
        # No recipients left → returns None without hitting Resend.
        assert result is None
    finally:
        db.close()
