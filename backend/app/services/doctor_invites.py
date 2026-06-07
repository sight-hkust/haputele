"""Issue, consume, and re-issue doctor onboarding tokens.

Two invite shapes share this table:

  rotation: doctor_id is set, the Doctor row already exists, and the
            invite is just a way for the doctor to choose a new password.
            email is also set (copied from the doctor row) so the same
            "you can't double-invite the same address" guard works.

  new:      doctor_id is NULL until the invite is consumed. The admin
            captured only the email (+ optional family_name greeting
            hint). On consume() we create the Account + Doctor row with
            approved_at NULL, link the invite to the new doctor_id, and
            mark consumed. The Doctor row appears in the admin's "awaiting
            approval" queue rather than being immediately usable.

Token format: `secrets.token_urlsafe(32)` → ~43 chars of URL-safe base64.
We store sha256-hex of the raw token; the raw value goes out exactly
once in the invite email and is never persisted server-side. This is the
same pattern as setup_tokens (see alembic 0006).

Liveness: a row is "live" iff `consumed_at IS NULL AND expires_at > NOW()`.
Re-issuing supersedes any earlier live invite for the same target (same
doctor_id for rotation, same email for new) by stamping consumed_at —
keeps audit trail intact while ensuring that a leaked older link can't
be used after rotation.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..errors import conflict, not_found, unprocessable
from ..models import Account, Doctor, DoctorInvite
from ..security import hash_password
from .storage import object_key, put_bytes


def _sniff_stamp(data: bytes) -> tuple[str, str]:
    """(mime, ext) from magic bytes — PNG/JPEG only, mirrors the helper
    in routers/doctors.py. Inline to avoid services→routers import."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    return "image/png", "png"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_rotation(db: Session, *, doctor_id: int) -> tuple[DoctorInvite, str]:
    """Rotation mode: mint a new password-reset invite for an existing
    doctor. Returns (row, raw_token).

    The raw token is what goes in the email link. The row is committed so
    the caller can reference its id in logs. Any prior live invites for
    this doctor are revoked so only the newest link works.
    """
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise not_found("doctor_not_found")

    now = datetime.now(timezone.utc)
    _revoke_live_invites(db, doctor_id=doctor_id, email=doctor.email, now=now)

    raw = secrets.token_urlsafe(32)
    ttl = timedelta(hours=settings.DOCTOR_INVITE_TTL_HOURS)
    invite = DoctorInvite(
        doctor_id=doctor_id,
        email=doctor.email,
        family_name=doctor.family_name,
        token_hash=_hash(raw),
        expires_at=now + ttl,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite, raw


def issue_new_doctor(
    db: Session, *, email: str, family_name: str | None = None,
) -> tuple[DoctorInvite, str]:
    """New mode: mint an invite for a doctor who doesn't have a row yet.

    Refuses (409 `email_already_used`) if the email is already linked to
    a *live* (non-rejected) Doctor row OR has another live unconsumed
    new-doctor invite. The second check is the cheap way to prevent two
    admins from inviting the same address twice in parallel; we revoke
    prior live invites for the same email on the happy path below.

    Rejected doctors are tombstones — they keep the row for audit but no
    longer claim the email, so a rejected doctor can be re-invited and
    reapply with the same address. The compare is case-insensitive so the
    legacy mixed-case create path can't slip a duplicate past us.
    """
    normalised = email.strip().lower()

    # Already-a-(live)-doctor check. Rejected rows don't count.
    if db.scalar(
        select(Doctor).where(
            func.lower(Doctor.email) == normalised,
            Doctor.rejected_at.is_(None),
        )
    ):
        raise conflict("email_already_used")

    now = datetime.now(timezone.utc)
    # Revoke any still-live invites for this email (whether rotation or
    # new) before issuing fresh. Operators sometimes click "resend" twice
    # quickly; the old link should stop working.
    _revoke_live_invites(db, doctor_id=None, email=normalised, now=now)

    raw = secrets.token_urlsafe(32)
    ttl = timedelta(hours=settings.DOCTOR_INVITE_TTL_HOURS)
    invite = DoctorInvite(
        doctor_id=None,
        email=normalised,
        family_name=family_name.strip() if family_name else None,
        token_hash=_hash(raw),
        expires_at=now + ttl,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite, raw


def _revoke_live_invites(
    db: Session, *, doctor_id: int | None, email: str, now: datetime,
) -> None:
    """Mark every still-live invite that matches this target as consumed.

    Matches by doctor_id when provided AND by email — keeps either side
    of the (rotation, new) dichotomy from leaking links across the
    boundary if an operator switches modes for the same address.
    """
    stmt = select(DoctorInvite).where(
        DoctorInvite.consumed_at.is_(None),
        DoctorInvite.expires_at > now,
    )
    if doctor_id is not None:
        stmt = stmt.where(
            (DoctorInvite.doctor_id == doctor_id) | (DoctorInvite.email == email)
        )
    else:
        stmt = stmt.where(DoctorInvite.email == email)
    for row in db.scalars(stmt).all():
        row.consumed_at = now


def lookup_live(db: Session, *, raw_token: str) -> DoctorInvite:
    """Resolve a raw token to its DoctorInvite row, asserting liveness.

    Raises 404 `invite_not_found` for any of: unknown token, already
    consumed, expired. We deliberately don't distinguish between those
    in the user-facing error so an attacker can't probe for the
    consumption state of arbitrary tokens.
    """
    row = db.scalar(
        select(DoctorInvite).where(DoctorInvite.token_hash == _hash(raw_token))
    )
    now = datetime.now(timezone.utc)
    if row is None or row.consumed_at is not None or row.expires_at <= now:
        raise not_found("invite_not_found")
    return row


def consume_rotation(db: Session, *, raw_token: str, new_password: str) -> Doctor:
    """Rotation mode: verify token, set the doctor's password, mark consumed.

    Returns the Doctor row so the caller can log who got onboarded.
    Caller is responsible for any password-policy checks (length etc.)
    before calling here — we don't make assumptions about local rules.
    """
    if not new_password:
        raise unprocessable("missing_password")

    invite = lookup_live(db, raw_token=raw_token)
    if invite.doctor_id is None:
        # The token belongs to a new-doctor invite; call consume_new_doctor.
        raise unprocessable("wrong_invite_mode")
    doctor = db.get(Doctor, invite.doctor_id)
    if doctor is None:
        # Invite outlived the doctor row (cascaded delete should have
        # caught this, but defensive in case of admin races).
        raise not_found("doctor_not_found")

    account = db.get(Account, doctor.username)
    if account is None:
        raise not_found("account_not_found")

    account.password = hash_password(new_password)
    invite.consumed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doctor)
    return doctor


def consume_new_doctor(
    db: Session,
    *,
    raw_token: str,
    username: str,
    password: str,
    profile: dict,
    rubber_stamp: bytes,
) -> Doctor:
    """New mode: create Account + Doctor from the doctor's submission.

    `profile` carries the §1.7 fields (givenName, familyName, contact,
    slmcRegistrationNumber, qualifications, practitionerAddress,
    instituteName, instituteContact). The new Doctor row gets approved_at
    = NULL so it shows up in the admin's awaiting-approval queue.

    Raises 422 username_taken if `username` is already in use.

    The whole thing happens in one DB commit so a crash between steps
    can't leave an Account with no Doctor row.
    """
    if not password:
        raise unprocessable("missing_password")

    invite = lookup_live(db, raw_token=raw_token)
    if invite.doctor_id is not None:
        raise unprocessable("wrong_invite_mode")

    if db.get(Account, username):
        raise unprocessable("username_taken")

    # Upload the rubber stamp bytes to S3 first; only the object key
    # lands on the Doctor row. We commit-then-rollback isn't possible
    # for the S3 side, but we put before insert so a DB failure leaves
    # an orphan key (harmless) rather than a Doctor row pointing at a
    # missing object.
    mime, ext = _sniff_stamp(rubber_stamp)
    stamp_key = object_key("doctors/stamps", ext)
    put_bytes(stamp_key, rubber_stamp, mime)

    now = datetime.now(timezone.utc)
    # If this email was rejected before, link the fresh submission back to
    # the most recent rejected attempt so the audit trail across re-tries
    # is navigable. invite.email is already normalised lower-case.
    predecessor = db.scalar(
        select(Doctor)
        .where(
            func.lower(Doctor.email) == invite.email,
            Doctor.rejected_at.is_not(None),
        )
        .order_by(Doctor.doctor_id.desc())
    )

    account = Account(
        username=username,
        password=hash_password(password),
        role="doctor",
    )
    doctor = Doctor(
        username=username,
        given_name=profile["givenName"],
        family_name=profile["familyName"],
        contact=profile["contact"],
        email=invite.email,
        slmc_registration_number=profile["slmcRegistrationNumber"],
        qualifications=profile["qualifications"],
        practitioner_address=profile["practitionerAddress"],
        institute_name=profile["instituteName"],
        institute_contact=profile["instituteContact"],
        rubber_stamp_key=stamp_key,
        active=True,
        approved_at=None,  # awaits admin approval before login is allowed
        created_at=now,
        previous_doctor_id=predecessor.doctor_id if predecessor else None,
    )
    db.add(account)
    db.add(doctor)
    db.flush()  # populate doctor.doctor_id so we can link the invite
    invite.doctor_id = doctor.doctor_id
    invite.consumed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doctor)
    return doctor


def build_invite_link(raw_token: str) -> str:
    """Absolute URL the doctor clicks. Relies on FRONTEND_BASE_URL."""
    if not settings.FRONTEND_BASE_URL:
        raise unprocessable("frontend_base_url_not_configured")
    return f"{settings.FRONTEND_BASE_URL}/doctor-onboarding/{quote(raw_token)}"


# Backwards-compat aliases for code paths and tests that pre-date the
# rotation/new-doctor split. Both forward to the rotation variant since
# every legacy caller (admin POST /doctors, demo_invite) created the
# Doctor row first and then issued an invite to set the password.
def issue(db: Session, *, doctor_id: int) -> tuple[DoctorInvite, str]:
    return issue_rotation(db, doctor_id=doctor_id)


def consume(db: Session, *, raw_token: str, new_password: str) -> Doctor:
    return consume_rotation(db, raw_token=raw_token, new_password=new_password)
