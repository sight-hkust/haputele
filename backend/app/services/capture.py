"""Mint, look up, and tear down phone-camera capture sessions.

A capture session is a short-lived, single-purpose credential that lets
any phone act as a one-shot camera for the logged-in operator at the
desk. The operator mints one (the desktop calls create_session), gets a
raw token back, and renders a QR code encoding

    {origin}/capture/{raw_token}

The phone that scans it lands on a public page and uploads photos to the
token-authenticated endpoints in routers/capture.py — the photo bytes go
phone → server and never touch the operator's computer.

Token format mirrors doctor_invites / setup_tokens: secrets.token_urlsafe
(32) → ~43 chars of URL-safe entropy. We store only sha256-hex of it; the
raw value is shown once (inside the QR) and never persisted, so a database
leak can't reconstruct a scannable link.

Liveness: `closed_at IS NULL AND expires_at > NOW()`. There's no
single-use consume step — a session can take several photos until the
operator closes it or it lapses on the short TTL.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import not_found
from ..models import CaptureSession


# How long a QR stays scannable. Deliberately short: the operator is
# standing next to the patient when they mint it, so a few minutes is
# ample, and a leaked link shouldn't sit usable for long.
CAPTURE_TTL_MINUTES = 15

# What the phone is allowed to do with an upload. Kept in sync with the
# `purpose` Literal on CaptureSessionCreateIn.
VALID_PURPOSES = ("appointment_attachment", "rubber_stamp")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(
    db: Session,
    *,
    purpose: str,
    created_by: str,
    appointment_id: int | None = None,
) -> tuple[CaptureSession, str]:
    """Mint a session row and return (row, raw_token).

    The raw token is what goes into the QR; only its hash is stored. The
    caller is responsible for validating `purpose`/`appointment_id`
    consistency (e.g. an appointment must exist and be writeable) before
    calling here — this layer just persists.
    """
    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    row = CaptureSession(
        token_hash=_hash(raw),
        purpose=purpose,
        appointment_id=appointment_id,
        created_by=created_by,
        expires_at=now + timedelta(minutes=CAPTURE_TTL_MINUTES),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, raw


def lookup_live(db: Session, *, raw_token: str) -> CaptureSession:
    """Resolve a raw token to its live CaptureSession.

    Raises 404 `capture_session_not_found` for unknown / closed / expired
    tokens, without distinguishing between them — a scanner shouldn't be
    able to probe which state a given token is in.
    """
    row = db.scalar(
        select(CaptureSession).where(CaptureSession.token_hash == _hash(raw_token))
    )
    now = datetime.now(timezone.utc)
    if row is None or row.closed_at is not None or row.expires_at <= now:
        raise not_found("capture_session_not_found")
    return row


def get_owned(db: Session, *, session_id: int, username: str) -> CaptureSession:
    """Fetch a session the caller owns, for desktop-side status/close/pull.

    Scoped to `created_by` so one operator can't poll or tear down another
    operator's session. Unknown id or wrong owner both surface as 404 so
    the id space isn't enumerable.
    """
    row = db.get(CaptureSession, session_id)
    if row is None or row.created_by != username:
        raise not_found("capture_session_not_found")
    return row


def close(db: Session, session: CaptureSession) -> None:
    """Mark a session closed (idempotent). Called when the desktop modal is
    dismissed so the QR stops working immediately rather than at TTL."""
    if session.closed_at is None:
        session.closed_at = datetime.now(timezone.utc)
        db.commit()
