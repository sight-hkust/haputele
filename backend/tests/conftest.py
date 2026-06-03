"""Test fixtures for the first-run setup feature.

These tests use FastAPI's TestClient against an in-process app instance
that talks to a real Postgres. The expectation is that the operator runs:

    docker compose up -d db
    DATABASE_URL=postgresql+psycopg2://hapu:hapu@localhost:5432/haputele_test \\
        pytest backend/tests/

The conftest creates the `haputele_test` database (idempotent), runs all
Alembic migrations against it, and wipes setup-relevant tables before
each test. It does NOT wipe `db_data` of the dev compose DB — they're
different schemas.

If DATABASE_URL is not set, conftest defaults to the URL above. If the
Postgres at that URL is not reachable, the tests are skipped (so a `make
lint` style run on a dev machine doesn't have to have PG up).
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import pytest

# Session cookies are Secure by default — browsers (and httpx) refuse to
# send them over plain HTTP. TestClient mounts the app at `http://testserver`,
# so the security flag has to be disabled for tests or every authenticated
# call after login looks like a missing-token error.
os.environ.setdefault("COOKIE_SECURE", "false")

_TEST_DB_NAME = "haputele_test"
_DEFAULT_TEST_URL = f"postgresql+psycopg2://hapu:hapu@localhost:5432/{_TEST_DB_NAME}"

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _ensure_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url is None:
        url = _DEFAULT_TEST_URL
        os.environ["DATABASE_URL"] = url
    return url


def _pg_reachable(url: str) -> bool:
    parsed = urlparse(url.replace("+psycopg2", ""))
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


def _create_test_db_if_missing(url: str) -> None:
    parsed = urlparse(url.replace("+psycopg2", ""))
    target_db = (parsed.path or "/").lstrip("/")
    if not target_db:
        return
    # Connect to the default 'postgres' DB and CREATE the test DB if absent.
    admin_url = url.rsplit("/", 1)[0] + "/postgres"
    import psycopg2
    from psycopg2 import sql

    conn = psycopg2.connect(
        admin_url.replace("postgresql+psycopg2", "postgresql")
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target_db)))
    finally:
        conn.close()


def _run_alembic_upgrade(url: str) -> None:
    env = {**os.environ, "DATABASE_URL": url}
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
    )


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_test_db():
    url = _ensure_database_url()
    if not _pg_reachable(url):
        pytest.skip(f"Postgres at {url} not reachable")
    _create_test_db_if_missing(url)
    _run_alembic_upgrade(url)
    yield


@pytest.fixture(autouse=True)
def _wipe_setup_state():
    """Reset setup-related state before each test. Other tables (doctor,
    patients, etc.) are left alone — the first-run-setup tests don't
    create domain rows beyond the sys-admin account.
    """
    # Import inside the fixture so DATABASE_URL is set before SQLAlchemy
    # builds its engine.
    from app.database import SessionLocal  # noqa: E402
    from sqlalchemy import text  # noqa: E402

    db = SessionLocal()
    try:
        # Wipe accounts (cascades to doctor / availability via FK).
        # The `appointments_locked_guard` trigger from migration 0005 has a
        # bug: as a BEFORE-DELETE trigger it returns NEW (which is NULL for
        # DELETE), silently suppressing the delete. We disable it for the
        # duration of the wipe. (See bug note in the feature-end summary.)
        db.execute(text("DELETE FROM appointment_attachments"))
        db.execute(text("DELETE FROM consultations"))
        db.execute(text("DELETE FROM preconsultation"))
        db.execute(text("DELETE FROM consents"))
        db.execute(text("ALTER TABLE appointments DISABLE TRIGGER appointments_locked_guard"))
        db.execute(text("DELETE FROM appointments"))
        db.execute(text("ALTER TABLE appointments ENABLE TRIGGER appointments_locked_guard"))
        db.execute(text("DELETE FROM queue_entries"))
        db.execute(text("DELETE FROM doctor_availability"))
        db.execute(text("DELETE FROM profile"))
        db.execute(text("DELETE FROM patients"))
        # Resend-feature tables — wiped explicitly even though they cascade
        # from doctor / are FK-less, so test order is irrelevant.
        db.execute(text("DELETE FROM notification_log"))
        db.execute(text("DELETE FROM doctor_invites"))
        db.execute(text("DELETE FROM email_suppressions"))
        db.execute(text("DELETE FROM doctor"))
        db.execute(text("DELETE FROM accounts"))
        db.execute(text("DELETE FROM setup_tokens"))
        # Reset system_config to uninitialized.
        db.execute(text(
            "UPDATE system_config SET "
            "  initialized_at = NULL, institute_name = NULL, "
            "  institute_address_lines = NULL, institute_contact_phone = NULL, "
            "  institute_contact_email = NULL, app_timezone = NULL, "
            "  export_timezone = NULL, master_consent_version = NULL, "
            "  updated_at = NOW() "
            "WHERE id = 1"
        ))
        # Make sure the sentinel row exists (idempotent).
        db.execute(text(
            "INSERT INTO system_config (id, initialized_at) "
            "VALUES (1, NULL) ON CONFLICT (id) DO NOTHING"
        ))
        db.commit()
    finally:
        db.close()
    yield


@pytest.fixture
def client():
    """Re-imports the app each test so the lifespan startup hook fires
    against the freshly-reset system_config row.
    """
    import importlib
    import app.main as app_main
    importlib.reload(app_main)
    from fastapi.testclient import TestClient
    with TestClient(app_main.app) as c:
        yield c


# ── Fixtures for the Resend / doctor-invite / reminder tests ────────────

@pytest.fixture
def email_env(monkeypatch):
    """Force the email service into 'configured' mode for tests.

    Without this, `is_configured()` is False and any code path that
    sends mail short-circuits with 422 — which is the *opposite* of
    what we want to verify in the happy-path tests. The api key value
    is fake; nothing actually hits Resend because `captured_emails`
    monkeypatches the send functions.
    """
    monkeypatch.setenv("RESEND_API_KEY", "re_test_fake_key_for_unit_tests")
    monkeypatch.setenv("RESEND_FROM", "test@example.com")
    monkeypatch.setenv("FRONTEND_BASE_URL", "http://testserver")
    # The Settings object was already constructed at module import; mutate
    # it in-place so downstream `settings.X` reads pick up the new values.
    from app.config import settings as _settings
    monkeypatch.setattr(_settings, "RESEND_API_KEY", "re_test_fake_key_for_unit_tests")
    monkeypatch.setattr(_settings, "RESEND_FROM", "test@example.com")
    monkeypatch.setattr(_settings, "FRONTEND_BASE_URL", "http://testserver")


@pytest.fixture
def captured_emails(monkeypatch):
    """Intercept outbound email at the seam every caller uses.

    Returns a list of `(fn_name, kwargs)` tuples — one per call. Each
    monkeypatch points at the *binding inside the calling module*
    (router / script / service), because Python imports copy references
    at import time; replacing `app.services.email.send_templated` alone
    wouldn't be seen by routers that have already done
    `from ..services.email import send_templated`.
    """
    calls: list[tuple[str, dict]] = []
    counter = {"n": 0}

    def _fake_send_templated(db, **kwargs):
        counter["n"] += 1
        calls.append(("send_templated", kwargs))
        return f"fake-msg-id-{counter['n']}"

    def _fake_send_email(db, **kwargs):
        counter["n"] += 1
        calls.append(("send_email", kwargs))
        return f"fake-msg-id-{counter['n']}"

    # Patch at every import site we know about.
    monkeypatch.setattr("app.services.email.send_templated", _fake_send_templated)
    monkeypatch.setattr("app.services.email.send_email", _fake_send_email)
    monkeypatch.setattr("app.routers.doctors.send_templated", _fake_send_templated)
    return calls


def _initialize_system_directly(db) -> None:
    """Flip system_config to initialized without going through the wizard,
    then refresh the in-memory cache.

    Faster than the verify-token → initialize flow for tests that only
    care about post-init behaviour (doctor onboarding, reminders). The
    cache refresh is critical: the setup-gate middleware reads from a
    module-level cache, not the DB, so an in-place DB UPDATE isn't
    visible without explicitly re-loading.
    """
    from sqlalchemy import text
    from app.services.system_config import load_system_config
    db.execute(text(
        "UPDATE system_config SET "
        "  initialized_at = NOW(), "
        "  institute_name = 'Test Clinic', "
        "  institute_address_lines = '[\"Test St\"]'::jsonb, "
        "  institute_contact_phone = '+94 11 000 0000', "
        "  institute_contact_email = 'ops@example.com', "
        "  app_timezone = 'Asia/Colombo', "
        "  export_timezone = 'Asia/Colombo', "
        "  master_consent_version = 'v1' "
        "WHERE id = 1"
    ))
    db.commit()
    load_system_config(db)


@pytest.fixture
def initialized_system():
    """system_config flipped to 'initialized' so post-setup routes work."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        _initialize_system_directly(db)
    finally:
        db.close()


@pytest.fixture
def admin_account(initialized_system):
    """Seed an admin Account row. Returns (username, plaintext_password)."""
    from app.database import SessionLocal
    from app.models import Account
    from app.security import hash_password

    creds = ("test_admin", "TestAdmin-Password-123")
    db = SessionLocal()
    try:
        db.add(Account(username=creds[0], password=hash_password(creds[1]), role="admin"))
        db.commit()
    finally:
        db.close()
    return creds


@pytest.fixture
def admin_client(client, admin_account):
    """TestClient already logged in as the admin (cookies pre-set)."""
    username, password = admin_account
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def healthworker_account(initialized_system):
    """Seed a healthworker Account. Returns (username, password)."""
    from app.database import SessionLocal
    from app.models import Account
    from app.security import hash_password

    creds = ("test_hw", "TestHW-Password-123")
    db = SessionLocal()
    try:
        db.add(Account(username=creds[0], password=hash_password(creds[1]), role="healthworker"))
        db.commit()
    finally:
        db.close()
    return creds


@pytest.fixture
def seeded_doctor(initialized_system):
    """A Doctor + Account ready to be invited. Returns the Doctor row.

    The Account row's password is a random unguessable value (same as
    what create_doctor's invite mode would generate), so tests that
    verify "consume updates the password" can assert on a known-after
    state without knowing the before-state.
    """
    import secrets
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.models import Account, Doctor
    from app.security import hash_password

    db = SessionLocal()
    try:
        username = "dr_test_seeded"
        db.add(Account(
            username=username,
            password=hash_password(secrets.token_urlsafe(32)),
            role="doctor",
        ))
        db.add(Doctor(
            username=username,
            given_name="Test", family_name="Doctor",
            contact="+94 11 000 0000",
            email="dr_test@example.com",
            slmc_registration_number="SLMC-TEST",
            qualifications="MBBS",
            practitioner_address="Test Address",
            institute_name="Test Clinic",
            institute_contact="+94 11 111 1111",
            rubber_stamp_image=b"\x89PNG\r\n\x1a\n",
            active=True,
            # Represents a pre-existing (already approved) doctor — the
            # invite-by-email flow has a separate path for fresh ones.
            approved_at=datetime.now(timezone.utc),
        ))
        db.commit()
        doctor = db.query(Doctor).filter_by(username=username).first()
        # Detach from session so the fixture-consumer can use it after this
        # fixture's session closes.
        db.expunge(doctor)
        return doctor
    finally:
        db.close()


@pytest.fixture
def seeded_setup_token() -> str:
    """Inserts a known plaintext setup token + its hash; returns the plaintext."""
    import hashlib
    from app.database import SessionLocal
    from app.models import SetupToken

    plaintext = "test-setup-token-fixed-for-unit-tests"
    hash_hex = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    db = SessionLocal()
    try:
        db.add(SetupToken(token_hash=hash_hex))
        db.commit()
    finally:
        db.close()
    return plaintext
