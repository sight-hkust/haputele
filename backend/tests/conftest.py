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
        db.execute(text("DELETE FROM appointment_attachments"))
        db.execute(text("DELETE FROM consultations"))
        db.execute(text("DELETE FROM preconsultation"))
        db.execute(text("DELETE FROM consents"))
        db.execute(text("DELETE FROM appointments"))
        db.execute(text("DELETE FROM queue_entries"))
        db.execute(text("DELETE FROM doctor_availability"))
        db.execute(text("DELETE FROM profile"))
        db.execute(text("DELETE FROM patients"))
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
