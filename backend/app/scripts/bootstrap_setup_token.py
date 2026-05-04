"""Generate / reuse / rotate the first-run setup token.

Invoked from entrypoint.sh between `alembic upgrade head` and the seeder.

Behaviour:
  - System already initialized → no-op; ensure /data/setup-token is gone.
  - Uninitialized AND there's an unconsumed token row AND the on-disk
    plaintext matches one of those rows' hashes → reuse: just re-print
    the banner so the operator can see it again after a restart.
  - Uninitialized AND the on-disk file is missing OR doesn't match → rotate:
    delete all unconsumed rows, mint a new token, insert hash, write file,
    print banner. (The hash is sha256-hex; non-deterministic bcrypt is
    not used because verify-token needs an O(1) lookup by hash.)

The plaintext file is written to /data, which is a named docker volume
mounted into the api container (see docker-compose.yml `api_data`). The
file survives `docker compose restart`/`up` but not `down -v`.
"""
from __future__ import annotations

import hashlib
import os
import secrets
import sys
from pathlib import Path

from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models import SetupToken, SystemConfig


SETUP_TOKEN_FILE = Path("/data/setup-token")
TOKEN_BYTES = 32  # secrets.token_urlsafe(32) yields a 43-char base64 string


def _sha256(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _print_banner(token: str) -> None:
    bar = "=" * 70
    msg = (
        f"\n{bar}\n"
        f"HapuTele first-run setup token\n\n"
        f"    {token}\n\n"
        f"POST this to /setup/verify-token to begin initialization, or\n"
        f"paste it into the setup wizard on the frontend.\n\n"
        f"Also written to {SETUP_TOKEN_FILE} inside the api container.\n"
        f"This token is invalidated as soon as /setup/initialize succeeds.\n"
        f"{bar}\n\n"
    )
    sys.stdout.write(msg)
    sys.stdout.flush()


def _write_file(token: str) -> None:
    SETUP_TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETUP_TOKEN_FILE.write_text(token, encoding="utf-8")
    try:
        os.chmod(SETUP_TOKEN_FILE, 0o600)
    except OSError:
        # Volume-mounted FS may not honour chmod; not fatal.
        pass


def main() -> int:
    db = SessionLocal()
    try:
        cfg = db.get(SystemConfig, 1)
        if cfg is None:
            sys.stderr.write(
                "[bootstrap_setup_token] system_config row missing — did 0006 run?\n"
            )
            return 1

        if cfg.initialized_at is not None:
            # System is initialized; clean up the file if it lingers.
            SETUP_TOKEN_FILE.unlink(missing_ok=True)
            return 0

        unconsumed = db.scalars(
            select(SetupToken).where(SetupToken.consumed_at.is_(None))
        ).all()

        if unconsumed and SETUP_TOKEN_FILE.exists():
            on_disk = SETUP_TOKEN_FILE.read_text(encoding="utf-8").strip()
            if any(t.token_hash == _sha256(on_disk) for t in unconsumed):
                # Reuse — re-print banner so the operator can see it.
                _print_banner(on_disk)
                return 0

        # Rotate. Wipe stale unconsumed rows so the new hash is the
        # singleton live token. Existing consumed rows are kept as an
        # audit trail (none can be re-used because consumed_at is set).
        db.execute(delete(SetupToken).where(SetupToken.consumed_at.is_(None)))
        token = secrets.token_urlsafe(TOKEN_BYTES)
        db.add(SetupToken(token_hash=_sha256(token)))
        db.commit()

        _write_file(token)
        _print_banner(token)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
