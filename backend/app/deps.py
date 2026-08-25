from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request, Security
from fastapi.security import APIKeyCookie
from sqlalchemy.orm import Session

from .database import get_db
from .errors import forbidden, unauthorized
from .security import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    SESSION_COOKIE_NAME,
    csrf_tokens_match,
    decode_token,
)


# RFC 7231 §4.2.1 — GET/HEAD/OPTIONS are idempotent and side-effect-free,
# so CSRF protection only kicks in on state-changing verbs. (TRACE is
# similarly safe but FastAPI routes don't expose it.)
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
_session_cookie = APIKeyCookie(
    name=SESSION_COOKIE_NAME,
    scheme_name="SessionCookie",
    description="HttpOnly session cookie set by POST /auth/login.",
    auto_error=False,
)


@dataclass
class CurrentUser:
    username: str
    role: str  # 'admin' | 'doctor' | 'healthworker' | 'sys-admin'


def _verify_csrf_for_unsafe(request: Request, header_value: str | None) -> None:
    """Double-submit CSRF check.

    The session JWT is HttpOnly so JS can't read it directly, but the
    browser still sends it on cross-site requests within the SameSite
    constraints. A second token — readable by the page's JS and stored in
    a sibling cookie — has to round-trip through `X-CSRF-Token`. A
    cross-origin attacker can't read the cookie, so the request fails.
    """
    if request.method in _SAFE_METHODS:
        return
    cookie_value = request.cookies.get(CSRF_COOKIE_NAME)
    if not csrf_tokens_match(cookie_value, header_value):
        raise forbidden("csrf_failed")


def current_user(
    request: Request,
    token: Annotated[str | None, Security(_session_cookie)],
    csrf_token: Annotated[str | None, Header(alias=CSRF_HEADER_NAME)] = None,
) -> CurrentUser:
    if not token:
        raise unauthorized("missing_token")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise unauthorized("token_expired")
    except jwt.PyJWTError:
        raise unauthorized("invalid_token")
    sub = payload.get("sub")
    role = payload.get("role")
    if not sub or not role:
        raise unauthorized("invalid_token")
    _verify_csrf_for_unsafe(request, csrf_token)
    return CurrentUser(username=sub, role=role)


def require_role(*roles: str):
    def dep(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.role not in roles:
            raise forbidden()
        return user

    return dep


def db_dep(db: Session = Depends(get_db)) -> Session:
    return db
