"""Shared username + password rules for every credential-setting flow.

Policy (see the `Credential policy` section of the PR that introduced this):

  username — no whitespace at all, internal or external.
  password — no leading/trailing whitespace; internal whitespace is fine,
             so passphrases like "correct horse battery staple" stay usable.

Both rules are exposed as **annotated Pydantic types** (`NewUsername`,
`NewPassword`) rather than functions the caller must remember to invoke.
That is deliberate: the previous design was a plain `validate_new_password()`
call, and it reached only 3 of the 7 write paths — the four doctor paths
(`routers/doctors.py`, `services/doctor_invites.py`) silently never called
it. A rule attached to the field's type cannot be forgotten by the next
endpoint someone adds.

The validators raise the usual `unprocessable(...)` HTTPException. Pydantic
lets non-ValueError exceptions propagate, so FastAPI's registered
HTTPException handler renders the normal `{"detail": {"error": code}}`
envelope and the frontend's error-codes table resolves it like any other.

`LoginIn` must NOT use these types. Login *verifies* a credential; it never
*sets* policy. Applying these rules there would reject accounts whose
passwords predate the rule — locking out the very users the policy exists
to protect. See routers/auth.py.
"""
from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator

from ..errors import unprocessable


MIN_PASSWORD_LEN = 10
MAX_USERNAME_LEN = 255

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


def validate_new_username(username: str) -> str:
    """Apply username rules; raise the first problem found.

    Raises `username_required` / `username_whitespace` / `username_too_long`.
    Returns the value unchanged — we reject rather than normalise, so what
    the operator typed is what gets stored, and a stray space is reported
    instead of being silently swallowed.
    """
    if not username:
        raise unprocessable("username_required")
    if any(ch.isspace() for ch in username):
        raise unprocessable("username_whitespace")
    if len(username) > MAX_USERNAME_LEN:
        raise unprocessable("username_too_long", max=MAX_USERNAME_LEN)
    return username


def validate_new_password(password: str) -> str:
    """Apply password rules; raise the first problem we find.

    Raises `password_whitespace` / `setup_password_weak` /
    `setup_password_too_short`. (The `setup_*` prefixes are historical —
    the wizard shipped first — and are kept so existing frontend copy
    keeps resolving.)

    Order matters. Edge-whitespace runs first because whitespace would
    otherwise pad a short secret past the length gate — "1234 5678 " is
    ten characters and four of them are real. Weak-check runs before
    length so a known-bad password like "password1" is reported as weak
    (you picked a known-bad base) rather than short — the security signal
    is more useful than the typing-more signal.

    Caller is responsible for username-taken checks (DB lookup).
    """
    if password != password.strip():
        raise unprocessable("password_whitespace")
    if password.lower() in _WEAK_PASSWORDS:
        raise unprocessable("setup_password_weak")
    if len(password) < MIN_PASSWORD_LEN:
        raise unprocessable("setup_password_too_short", min=MIN_PASSWORD_LEN)
    return password


# Field types. Annotate any request model that *sets* a credential with
# these; never annotate a login payload with them.
NewUsername = Annotated[str, AfterValidator(validate_new_username)]
NewPassword = Annotated[str, AfterValidator(validate_new_password)]
