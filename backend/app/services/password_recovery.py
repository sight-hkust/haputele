"""Email recovery for approved doctors who proved control of their mailbox."""

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import logging
import secrets
from threading import Lock
from time import monotonic

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..errors import unprocessable
from ..models import Account, Doctor
from ..security import hash_password
from .email import send_templated

logger = logging.getLogger(__name__)
_LINK_LIFETIME = timedelta(minutes=15)
# A bounded per-process guard limits work even for unknown addresses. The
# account-level cooldown below is stored in Postgres and shared by workers.
_source_counts: dict[str, int] = {}
_window_ends = 0.0
_rate_lock = Lock()


def allow_request(source: str) -> bool:
    global _window_ends
    with _rate_lock:
        now = monotonic()
        if now >= _window_ends:
            _source_counts.clear()
            _window_ends = now + 60
        count = _source_counts.get(source, 0)
        if count >= 10 or (count == 0 and len(_source_counts) >= 1024):
            return False
        _source_counts[source] = count + 1
        return True


def _eligible_accounts():
    return (
        select(Account, Doctor)
        .join(Doctor, Doctor.username == Account.username)
        .where(
            Account.role == "doctor",
            Account.disabled_at.is_(None),
            Doctor.active.is_(True),
            Doctor.approved_at.is_not(None),
            Doctor.rejected_at.is_(None),
            Doctor.verified_email == func.lower(Doctor.email),
        )
    )


def send_recovery(address: str) -> None:
    if not settings.FRONTEND_BASE_URL:
        logger.error("Password recovery requires FRONTEND_BASE_URL")
        return
    with SessionLocal() as db:
        rows = db.execute(
            _eligible_accounts()
            .where(Doctor.verified_email == address.strip().lower())
            .limit(2)
            .with_for_update()
        ).all()
        if len(rows) != 1:
            return
        account, doctor = rows[0]
        now = datetime.now(timezone.utc)
        if account.reset_expires_at and account.reset_expires_at > now:
            return
        token = secrets.token_urlsafe(32)
        digest = sha256(token.encode()).hexdigest()
        account.reset_digest = digest
        account.reset_expires_at = now + _LINK_LIFETIME
        recipient = doctor.verified_email
        username = account.username
        db.commit()
        # The fragment stays out of proxy, server and referrer logs.
        link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/forgot-password#token={token}"
        try:
            message_id = send_templated(
                db,
                to=recipient,
                subject="Reset your HapuTele password",
                template="doctor_recovery",
                context={"link": link, "username": username},
            )
            if message_id is not None:
                return
        except Exception:
            # Let a transient provider error be retried. Never log the payload.
            logger.error("Doctor recovery email delivery failed")
        db.rollback()
        db.execute(
            update(Account)
            .where(Account.reset_digest == digest)
            .values(reset_digest=None, reset_expires_at=None)
        )
        db.commit()


def reset_password(db: Session, token: str, password: str) -> None:
    digest = sha256(token.encode()).hexdigest()
    row = db.execute(
        _eligible_accounts().where(Account.reset_digest == digest).with_for_update()
    ).one_or_none()
    now = datetime.now(timezone.utc)
    if not row or not row.Account.reset_expires_at or row.Account.reset_expires_at <= now:
        raise unprocessable("invalid_recovery_link")
    if len(password.encode()) > 72:
        raise unprocessable("password_too_long")
    row.Account.password = hash_password(password)
    # The DB trigger increments credential_version and clears the reset token.
    db.commit()
