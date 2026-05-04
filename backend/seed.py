"""Optional dev-only seeding of singleton admin and shared healthworker accounts.

Run after `alembic upgrade head` (the API entrypoint does both):

    python -m seed

Behaviour:
  - **Default: no-op.** Production and ordinary dev runs do nothing. Real
    admin and healthworker accounts are created by the sys-admin via the
    first-run setup wizard and (future) dev dashboard.
  - If env var `SEED_DEV_ACCOUNTS` is truthy ("1", "true", "yes", "on"),
    upserts ADMIN_USERNAME / HEALTHWORKER_USERNAME using `.env` defaults.
    Only intended for developers who want canned login credentials in a
    throwaway DB. Refuses to run once the system is initialized so the
    operator's chosen accounts can't be silently overwritten.
  - The historical `SKIP_SEED` env var is still honoured (as a no-op gate)
    for backward compatibility with existing compose files.
"""
import os

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import Account, SystemConfig
from app.security import hash_password


_TRUTHY = {"1", "true", "yes", "on"}


def _truthy(var: str) -> bool:
    return os.environ.get(var, "").strip().lower() in _TRUTHY


def _upsert(db, username: str, password: str, role: str) -> None:
    existing = db.scalar(select(Account).where(Account.role == role))
    if existing:
        existing.username = username
        existing.password = hash_password(password)
    else:
        db.add(Account(username=username, password=hash_password(password), role=role))


def main() -> None:
    if _truthy("SKIP_SEED"):
        print("seed: SKIP_SEED set — no-op")
        return

    if not _truthy("SEED_DEV_ACCOUNTS"):
        # Default path: setup wizard owns account creation now.
        print("seed: SEED_DEV_ACCOUNTS not set — no-op (use the setup wizard)")
        return

    db = SessionLocal()
    try:
        cfg = db.get(SystemConfig, 1)
        if cfg is not None and cfg.initialized_at is not None:
            print(
                "seed: system already initialized "
                f"(initialized_at={cfg.initialized_at.isoformat()}) — refusing to upsert"
            )
            return

        _upsert(db, settings.ADMIN_USERNAME, settings.ADMIN_PASSWORD, "admin")
        _upsert(db, settings.HEALTHWORKER_USERNAME, settings.HEALTHWORKER_PASSWORD, "healthworker")
        db.commit()
        print(
            f"seed: SEED_DEV_ACCOUNTS=1 — seeded admin={settings.ADMIN_USERNAME} "
            f"healthworker={settings.HEALTHWORKER_USERNAME}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
