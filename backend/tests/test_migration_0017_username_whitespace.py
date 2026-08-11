"""Upgrade/preflight tests for migration 0017 (username whitespace CHECK).

Why this file exists at all: `conftest._bootstrap_test_db` runs
`alembic upgrade head` exactly once, against a database it just created. An
empty database has no whitespace-bearing usernames, so the interesting case —
a real deployment that accumulated one *before* the policy shipped — is
unreachable from the normal fixtures by construction. Not "nobody wrote the
test"; the harness cannot produce the state.

So each test here provisions its own scratch database, walks it to revision
0016, seeds whatever `accounts` rows it needs, and then runs alembic in a
subprocess with `DATABASE_URL` pointed at the scratch. `haputele_test` is
never touched — every other test in the suite depends on its schema.

The properties under test, in order of importance:

  1. an offending row does NOT fail the upgrade. `entrypoint.sh` is `set -e`
     and runs `alembic upgrade head` on every container start, so a failing
     migration is an API crash loop — a full outage caused by one row
     belonging to one user who already could not log in.
  2. NOT VALID still rejects new writes. This is what makes (1) affordable:
     the constraint is deferred for *existing* rows only.
  3. nothing is silently repaired. username is the primary key; trimming
     ' alice' to 'alice' can collide, or merge two people's records.
"""
import os
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
import pytest
from psycopg2 import errors, sql

BACKEND_DIR = Path(__file__).resolve().parent.parent

_REV_0016 = "0016_doctor_esignature"
_REV_0017 = "0017_username_no_whitespace"
_CONSTRAINT = "accounts_username_no_whitespace"

# Placeholder in the `password` column. These rows are never authenticated
# against — the tests care about the username, and bcrypt hashing 6 rows to
# prove a CHECK constraint works would just be slow.
_NOT_A_HASH = "x-not-a-real-hash"


def _plain(url: str) -> str:
    """Strip the SQLAlchemy driver suffix so psycopg2 can parse the URL."""
    return url.replace("postgresql+psycopg2", "postgresql")


def _connect(url: str):
    conn = psycopg2.connect(_plain(url))
    conn.autocommit = True
    return conn


def _alembic(url: str, *args: str) -> subprocess.CompletedProcess:
    """Run alembic against `url` in a subprocess.

    Deliberately no `check=True` — the exit code is one of the things under
    test, and the whole point of test 1 is that it is zero.
    """
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": url},
        capture_output=True,
        text=True,
    )


def _output(proc: subprocess.CompletedProcess) -> str:
    """Alembic logs to stderr; alembic's own output goes to stdout."""
    return f"{proc.stdout}\n{proc.stderr}"


def _seed(url: str, *usernames: str, role: str = "admin") -> None:
    conn = _connect(url)
    try:
        with conn.cursor() as cur:
            for username in usernames:
                cur.execute(
                    "INSERT INTO accounts (username, password, role) VALUES (%s, %s, %s)",
                    (username, _NOT_A_HASH, role),
                )
    finally:
        conn.close()


def _usernames(url: str) -> list[str]:
    conn = _connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT username FROM accounts ORDER BY username")
            return [row[0] for row in cur.fetchall()]
    finally:
        conn.close()


def _convalidated(url: str):
    """None when the constraint is absent, else its `convalidated` flag."""
    conn = _connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT c.convalidated FROM pg_constraint c "
                "JOIN pg_class t ON t.oid = c.conrelid "
                "WHERE c.conname = %s AND t.relname = 'accounts'",
                (_CONSTRAINT,),
            )
            row = cur.fetchone()
            return None if row is None else row[0]
    finally:
        conn.close()


@pytest.fixture
def scratch_db():
    """A throwaway database, dropped however the test ends.

    No Postgres-reachability guard: `_bootstrap_test_db` in conftest.py is
    session-scoped autouse and already skips the whole session when the
    server is down.
    """
    base = os.environ["DATABASE_URL"]
    name = f"haputele_mig_{uuid.uuid4().hex[:8]}"
    admin_url = base.rsplit("/", 1)[0] + "/postgres"
    scratch_url = base.rsplit("/", 1)[0] + "/" + name

    conn = _connect(admin_url)
    try:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    finally:
        conn.close()

    try:
        yield scratch_url
    finally:
        conn = _connect(admin_url)
        try:
            with conn.cursor() as cur:
                # FORCE (PG13+) so a leaked connection can't leave the
                # database behind for the next run to collide with.
                cur.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                        sql.Identifier(name)
                    )
                )
        finally:
            conn.close()


@pytest.fixture
def at_0016(scratch_db):
    """Scratch database walked to the revision just before 0017."""
    proc = _alembic(scratch_db, "upgrade", _REV_0016)
    assert proc.returncode == 0, _output(proc)
    return scratch_db


# ── 1. an existing offender must not brick the deployment ─────────────


def test_upgrade_reports_offenders_without_touching_them(at_0016):
    _seed(at_0016, " alice", "bo b")

    proc = _alembic(at_0016, "upgrade", "head")
    out = _output(proc)

    # The headline property. A nonzero exit here is an API crash loop.
    assert proc.returncode == 0, out

    # repr() rendering is load-bearing: ' alice' and 'alice' are
    # indistinguishable printed plain, and the invisible character IS the bug.
    assert "' alice'" in out, out
    assert "'bo b'" in out, out
    assert "MANUAL REMEDIATION REQUIRED" in out
    assert "will NOT" in out and "repair them automatically" in out
    assert f"VALIDATE CONSTRAINT {_CONSTRAINT}" in out

    # Grandfathered, not validated.
    assert _convalidated(at_0016) is False

    # Byte-for-byte unchanged — no trimming, no renaming, no deletion.
    assert _usernames(at_0016) == [" alice", "bo b"]

    current = _alembic(at_0016, "current")
    assert _REV_0017 in _output(current)


def test_not_valid_constraint_still_rejects_new_whitespace_writes(at_0016):
    """The deferral applies to *existing* rows only.

    This is what makes warn-and-continue affordable: 100% of the
    forward-looking protection lands immediately, and only the historical
    scan waits for a human.
    """
    _seed(at_0016, " alice")
    assert _alembic(at_0016, "upgrade", "head").returncode == 0

    conn = _connect(at_0016)
    try:
        with conn.cursor() as cur, pytest.raises(errors.CheckViolation):
            cur.execute(
                "INSERT INTO accounts (username, password, role) VALUES (%s, %s, %s)",
                (" bob", _NOT_A_HASH, "admin"),
            )
    finally:
        conn.close()


# ── 2. the ordinary path is unchanged ─────────────────────────────────


def test_upgrade_validates_when_no_offenders_exist(at_0016):
    """Every fresh install, every CI run, every dev box takes this branch.

    End state must be indistinguishable from a plain validated
    ADD CONSTRAINT — the NOT VALID step is an implementation detail here.
    """
    _seed(at_0016, "alice")

    proc = _alembic(at_0016, "upgrade", "head")
    assert proc.returncode == 0, _output(proc)
    assert "MANUAL REMEDIATION REQUIRED" not in _output(proc)

    assert _convalidated(at_0016) is True
    assert _usernames(at_0016) == ["alice"]


def test_constraint_rejects_whitespace_after_a_clean_upgrade(at_0016):
    assert _alembic(at_0016, "upgrade", "head").returncode == 0

    conn = _connect(at_0016)
    try:
        with conn.cursor() as cur, pytest.raises(errors.CheckViolation):
            cur.execute(
                "INSERT INTO accounts (username, password, role) VALUES (%s, %s, %s)",
                ("a b", _NOT_A_HASH, "admin"),
            )
    finally:
        conn.close()


# ── 3. re-runnability ─────────────────────────────────────────────────


def test_upgrade_is_idempotent_when_the_constraint_already_exists(at_0016):
    """A previous run may have been interrupted after the DDL but before
    alembic stamped the revision, or an operator may have hand-applied the
    constraint as a hotfix. Either way the migration must not die with
    DuplicateObject on the next container start.
    """
    conn = _connect(at_0016)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"ALTER TABLE accounts ADD CONSTRAINT {_CONSTRAINT} "
                r"CHECK (username !~ '\s')"
            )
    finally:
        conn.close()

    proc = _alembic(at_0016, "upgrade", "head")
    assert proc.returncode == 0, _output(proc)
    assert _convalidated(at_0016) is True


def test_downgrade_drops_the_constraint(at_0016):
    assert _alembic(at_0016, "upgrade", "head").returncode == 0
    assert _convalidated(at_0016) is True

    proc = _alembic(at_0016, "downgrade", _REV_0016)
    assert proc.returncode == 0, _output(proc)
    assert _convalidated(at_0016) is None
