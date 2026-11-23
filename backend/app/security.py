import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Response

from .config import settings


SESSION_COOKIE_NAME = "session"
# The CSRF cookie is intentionally NOT HttpOnly — the frontend reads it
# via document.cookie and echoes it back in `X-CSRF-Token`. Safe because
# same-origin policy keeps cross-origin JS from reading it.
# The setup flow does NOT use a cookie at all: its JWT travels in the
# verify-token response body and rides back as `Authorization: Bearer`
# on /setup/initialize. See routers/setup.py for the lifecycle.
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# bcrypt's own input limit. 5.0 turns input past 72 UTF-8 bytes into a
# ValueError; 4.x silently hashed only the first 72 bytes. New passwords are
# capped at the same figure in services/credentials.py, but this constant is
# the 4.x-compatibility figure and stays 72 even if that policy ever loosens.
_BCRYPT_MAX_PASSWORD_BYTES = 72


def verify_password(password: str, hashed: str) -> bool:
    encoded = password.encode("utf-8")
    try:
        return bcrypt.checkpw(encoded, hashed.encode("utf-8"))
    except ValueError:
        # bcrypt 5.0 lands here for passwords over 72 UTF-8 bytes. Accounts
        # created before the upgrade can only hold a hash of the truncated
        # form (4.x never stored anything longer), so a long input retries
        # against exactly the bytes 4.x would have hashed — delete this
        # fallback and every pre-upgrade >72-byte password locks its owner
        # out for good. Inputs within 72 bytes keep the old behaviour:
        # ValueError there means a malformed stored hash, not a long one.
        if len(encoded) > _BCRYPT_MAX_PASSWORD_BYTES:
            try:
                truncated = encoded[:_BCRYPT_MAX_PASSWORD_BYTES]
                return bcrypt.checkpw(truncated, hashed.encode("utf-8"))
            except (ValueError, TypeError):
                return False
        return False
    except TypeError:
        return False


def create_token(subject: str, role: str) -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MIN)
    payload = {"sub": subject, "role": role, "exp": expires}
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)
    return token, expires


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def csrf_tokens_match(cookie_value: str | None, header_value: str | None) -> bool:
    if not cookie_value or not header_value:
        return False
    return hmac.compare_digest(cookie_value, header_value)


def set_session_cookies(
    response: Response,
    *,
    session_token: str,
    csrf_token: str,
    max_age_seconds: int,
) -> None:
    """Write the session JWT (HttpOnly) and CSRF token (readable) pair.

    Both cookies use the same lifetime so they expire together — a half-
    expired pair would fail every CSRF check until the user logs in again.
    """
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=max_age_seconds,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN or None,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=max_age_seconds,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN or None,
        path="/",
    )


def clear_session_cookies(response: Response) -> None:
    # `delete_cookie` issues a Set-Cookie with Max-Age=0; the domain/path
    # must match the original `set_cookie` call exactly or browsers ignore
    # the deletion silently.
    for name in (SESSION_COOKIE_NAME, CSRF_COOKIE_NAME):
        response.delete_cookie(
            key=name,
            path="/",
            domain=settings.COOKIE_DOMAIN or None,
        )


