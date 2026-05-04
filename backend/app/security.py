import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Response

from .config import settings


SESSION_COOKIE_NAME = "session"
SETUP_SESSION_COOKIE_NAME = "setup_session"
# The CSRF cookie is intentionally NOT HttpOnly — the frontend reads it
# via document.cookie and echoes it back in `X-CSRF-Token`. Safe because
# same-origin policy keeps cross-origin JS from reading it.
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
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


def set_setup_session_cookies(
    response: Response,
    *,
    setup_token: str,
    csrf_token: str,
    max_age_seconds: int,
) -> None:
    response.set_cookie(
        key=SETUP_SESSION_COOKIE_NAME,
        value=setup_token,
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


def clear_setup_session_cookies(response: Response) -> None:
    for name in (SETUP_SESSION_COOKIE_NAME, CSRF_COOKIE_NAME):
        response.delete_cookie(
            key=name,
            path="/",
            domain=settings.COOKIE_DOMAIN or None,
        )
