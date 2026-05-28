"""Shared password and username validation for account-creation flows.

Two call sites today: POST /setup/initialize (creates the sys-admin) and
POST /sysadmin/accounts (creates admins/healthworkers). The same rules
apply to both — a thin module keeps them from drifting.

Error codes are prefixed `setup_*` for historical reasons (the wizard
shipped first); the frontend's error-codes table maps them to user copy.
"""
from __future__ import annotations

from ..errors import unprocessable


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

# Don't shadow the existing singleton-by-role accounts implied by older
# code paths. Lower-cased comparison.
RESERVED_USERNAMES = frozenset({"admin", "healthworker"})


def validate_new_account(*, username: str, password: str) -> None:
    """Apply both rules; raise the first `unprocessable` we find.

    Raises with `setup_password_too_short` / `setup_password_weak` /
    `setup_username_reserved`. Caller is responsible for username-taken
    checks (those need a DB lookup).
    """
    if len(password) < MIN_PASSWORD_LEN:
        raise unprocessable("setup_password_too_short", min=MIN_PASSWORD_LEN)
    if password.lower() in _WEAK_PASSWORDS:
        raise unprocessable("setup_password_weak")
    if username.lower() in RESERVED_USERNAMES:
        raise unprocessable("setup_username_reserved")
