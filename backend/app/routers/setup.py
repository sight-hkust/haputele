"""First-run setup wizard endpoints. All routes are public — no Authorization
required — because the system has no accounts to authenticate against until
initialization completes.

The SetupRequiredMiddleware guards these in the opposite direction: once
system_config.initialized_at IS NOT NULL, all /setup/* routes except
/setup/status return 409 setup_already_completed.

TODO: rate-limit POST /setup/verify-token at 5 requests/minute/IP. No
rate-limit middleware exists in this codebase today (CURRENT_INFRA.md §7).
Surface this to ops before exposing /setup to the public internet.
"""
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..deps import db_dep
from ..errors import conflict, forbidden, unauthorized, unprocessable
from ..models import Account, SetupToken, SystemConfig
from ..security import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    SETUP_SESSION_COOKIE_NAME,
    clear_setup_session_cookies,
    create_token,
    csrf_tokens_match,
    decode_token,
    generate_csrf_token,
    hash_password,
    set_session_cookies,
    set_setup_session_cookies,
)
from ..services.system_config import get_system_config, reload_system_config


router = APIRouter(prefix="/setup", tags=["setup"])

SETUP_TOKEN_FILE = Path("/data/setup-token")
SETUP_JWT_TTL_MIN = 15
SETUP_JWT_SUBJECT = "setup"
SETUP_JWT_ROLE = "setup"
SYSADMIN_ROLE = "sys-admin"

MIN_PASSWORD_LEN = 10

# Obvious-weak strings rejected outright. Lower-cased exact match.
_WEAK_PASSWORDS = frozenset({
    "admin",
    "administrator",
    "healthworker",
    "sysadmin",
    "sys-admin",
    "password",
    "password1",
    "passw0rd",
    "letmein",
    "changeme",
    "dev-secret-change-me",
    "change-me-to-a-long-random-string",
})

# Don't shadow the existing singleton-by-role accounts.
_RESERVED_USERNAMES = frozenset({"admin", "healthworker"})


# ── helpers ─────────────────────────────────────────────────────────

def _sha256(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _validate_password(pw: str) -> None:
    if len(pw) < MIN_PASSWORD_LEN:
        raise unprocessable("setup_password_too_short", min=MIN_PASSWORD_LEN)
    if pw.lower() in _WEAK_PASSWORDS:
        raise unprocessable("setup_password_weak")


def _mint_setup_session() -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + timedelta(minutes=SETUP_JWT_TTL_MIN)
    token = jwt.encode(
        {"sub": SETUP_JWT_SUBJECT, "role": SETUP_JWT_ROLE, "exp": expires},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALG,
    )
    return token, expires


def _require_setup_session(request: Request) -> None:
    """Cookie-backed setup-session check.

    Mirrors `deps.current_user` but with a separate cookie name so a stale
    setup wizard tab can't accidentally authenticate as a real user once
    the system is initialized. Setup is single-purpose and short-lived.
    """
    token = request.cookies.get(SETUP_SESSION_COOKIE_NAME)
    if not token:
        raise unauthorized("setup_session_invalid")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise unauthorized("setup_session_invalid")
    except jwt.PyJWTError:
        raise unauthorized("setup_session_invalid")
    if payload.get("sub") != SETUP_JWT_SUBJECT or payload.get("role") != SETUP_JWT_ROLE:
        raise unauthorized("setup_session_invalid")
    # CSRF on the setup flow uses the same double-submit cookie pair as
    # the user flow — the CSRF cookie name is shared, only the session
    # cookie differs.
    if not csrf_tokens_match(
        request.cookies.get(CSRF_COOKIE_NAME),
        request.headers.get(CSRF_HEADER_NAME),
    ):
        raise forbidden("csrf_failed")


# ── schemas ─────────────────────────────────────────────────────────

class VerifyTokenIn(BaseModel):
    token: str = Field(min_length=1)


# The session JWT itself rides back as an HttpOnly cookie; we expose only
# `expiresAt` so the wizard can show a countdown.
class VerifyTokenOut(BaseModel):
    expiresAt: datetime


class SysAdminIn(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str


class InstituteIdentityIn(BaseModel):
    name: str = Field(min_length=1)
    addressLines: list[str] = Field(min_length=1)
    contactPhone: str = Field(min_length=1)
    contactEmail: EmailStr


class InitializeIn(BaseModel):
    sysAdmin: SysAdminIn
    instituteIdentity: InstituteIdentityIn
    appTimezone: str = Field(min_length=1)
    exportTimezone: str = Field(min_length=1)
    masterConsentVersion: str = Field(min_length=1)


class InitializeOut(BaseModel):
    ok: bool
    username: str
    role: str  # always "sys-admin" today; explicit so the client doesn't infer it


class SetupStatusOut(BaseModel):
    initialized: bool


# ── routes ──────────────────────────────────────────────────────────

@router.get("/status", response_model=SetupStatusOut)
def setup_status() -> SetupStatusOut:
    return SetupStatusOut(initialized=get_system_config().is_initialized)


@router.post("/verify-token", response_model=VerifyTokenOut)
def verify_token(
    body: VerifyTokenIn,
    response: Response,
    db: Session = Depends(db_dep),
) -> VerifyTokenOut:
    # Defensive — the middleware also guards this.
    if get_system_config().is_initialized:
        raise conflict("setup_already_completed")

    row = db.scalar(
        select(SetupToken).where(SetupToken.token_hash == _sha256(body.token))
    )
    if row is None or row.consumed_at is not None:
        raise unauthorized("setup_token_invalid")

    token, expires = _mint_setup_session()
    set_setup_session_cookies(
        response,
        setup_token=token,
        csrf_token=generate_csrf_token(),
        max_age_seconds=SETUP_JWT_TTL_MIN * 60,
    )
    return VerifyTokenOut(expiresAt=expires)


@router.post("/initialize", response_model=InitializeOut, status_code=201)
def initialize(
    body: InitializeIn,
    response: Response,
    db: Session = Depends(db_dep),
    _auth: None = Depends(_require_setup_session),
) -> InitializeOut:
    if get_system_config().is_initialized:
        raise conflict("setup_already_completed")

    _validate_password(body.sysAdmin.password)
    if body.sysAdmin.username.lower() in _RESERVED_USERNAMES:
        raise unprocessable("setup_username_reserved")

    # Block obviously-empty institute identity fields.
    addr_lines = [s for s in body.instituteIdentity.addressLines if s.strip()]
    if not addr_lines:
        raise unprocessable("setup_address_required")
    if not body.instituteIdentity.name.strip():
        raise unprocessable("setup_institute_name_required")
    if not body.instituteIdentity.contactPhone.strip():
        raise unprocessable("setup_institute_phone_required")

    # Username uniqueness — the DB also enforces it via PK, but a
    # pre-check yields a stable 422 instead of an IntegrityError.
    if db.get(Account, body.sysAdmin.username) is not None:
        raise unprocessable("setup_username_taken")

    db.add(Account(
        username=body.sysAdmin.username,
        password=hash_password(body.sysAdmin.password),
        role=SYSADMIN_ROLE,
    ))

    cfg = db.get(SystemConfig, 1)
    if cfg is None:
        # 0006 inserts id=1; defensive against a hand-edited DB.
        cfg = SystemConfig(id=1)
        db.add(cfg)
    now = datetime.now(timezone.utc)
    cfg.initialized_at = now
    cfg.institute_name = body.instituteIdentity.name.strip()
    cfg.institute_address_lines = addr_lines
    cfg.institute_contact_phone = body.instituteIdentity.contactPhone.strip()
    cfg.institute_contact_email = str(body.instituteIdentity.contactEmail)
    cfg.app_timezone = body.appTimezone
    cfg.export_timezone = body.exportTimezone
    cfg.master_consent_version = body.masterConsentVersion
    cfg.updated_at = now

    # Consume every unconsumed setup token (there should only be one,
    # but the bootstrap script enforces "single live token" — be safe).
    unconsumed = db.scalars(
        select(SetupToken).where(SetupToken.consumed_at.is_(None))
    ).all()
    if not unconsumed:
        # The setup-session JWT was minted from a valid token, so this is
        # unreachable in practice — defensive only.
        raise conflict("setup_token_missing")
    for t in unconsumed:
        t.consumed_at = now

    db.commit()

    # File is operator convenience; hash already consumed in DB so the
    # security boundary is closed regardless of whether the unlink works.
    try:
        SETUP_TOKEN_FILE.unlink(missing_ok=True)
    except OSError:
        pass

    reload_system_config(db)
    # Post-commit cookie write: system is already initialized at this
    # point, so a cookie-mint failure leaves the operator able to recover
    # via POST /auth/login. Don't wrap in a transaction — cookies aren't
    # part of one.
    # Hand the wizard off into an authenticated sys-admin session in the
    # same response: clear the single-purpose setup cookies, then mint
    # the real session+csrf pair so stage 3 ("operating accounts") runs
    # without a second password prompt.
    clear_setup_session_cookies(response)
    session_token, _expires = create_token(body.sysAdmin.username, SYSADMIN_ROLE)
    set_session_cookies(
        response,
        session_token=session_token,
        csrf_token=generate_csrf_token(),
        max_age_seconds=settings.JWT_EXPIRE_MIN * 60,
    )
    return InitializeOut(ok=True, username=body.sysAdmin.username, role=SYSADMIN_ROLE)
