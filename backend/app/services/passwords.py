"""Shared password validation for account-creation flows.

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


def validate_new_password(password: str) -> None:
    """Apply password rules; raise the first `unprocessable` we find.

    Raises `setup_password_weak` / `setup_password_too_short`. Weak-check
    runs *before* length-check so a known-bad password like "password1"
    is reported as weak (you picked a known-bad base) rather than short —
    the security signal is more useful than the typing-more signal.
    Caller is responsible for username-taken checks (DB lookup).
    """
    if password.lower() in _WEAK_PASSWORDS:
        raise unprocessable("setup_password_weak")
    if len(password) < MIN_PASSWORD_LEN:
        raise unprocessable("setup_password_too_short", min=MIN_PASSWORD_LEN)
