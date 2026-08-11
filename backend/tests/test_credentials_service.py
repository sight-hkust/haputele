"""Unit tests for the shared credential validators.

Anchors the contract so every credential-setting path can't silently
drift on what counts as a 'weak', 'too-short', or whitespace-bearing
password, or on what makes a username invalid.
"""
import pytest

from app.errors import HTTPException
from app.services.credentials import (
    MAX_USERNAME_LEN,
    MIN_PASSWORD_LEN,
    validate_new_password,
    validate_new_username,
)


def _detail(exc: HTTPException) -> dict:
    assert isinstance(exc.detail, dict), exc.detail
    return exc.detail


def test_min_password_length_is_ten():
    # If this changes, the wizard's UI hint needs to change too.
    assert MIN_PASSWORD_LEN == 10


def test_validate_accepts_strong_password():
    validate_new_password("correct-horse-battery-staple")


def test_validate_rejects_short_password():
    with pytest.raises(HTTPException) as exc:
        validate_new_password("short")
    assert _detail(exc.value)["error"] == "setup_password_too_short"
    assert _detail(exc.value)["min"] == MIN_PASSWORD_LEN


def test_validate_min_password_length_boundary():
    """Exactly `MIN_PASSWORD_LEN` chars must be accepted; one fewer rejected."""
    # One below the threshold raises.
    with pytest.raises(HTTPException):
        validate_new_password("a" * (MIN_PASSWORD_LEN - 1))
    # Exactly at the threshold passes.
    validate_new_password("a" * MIN_PASSWORD_LEN)


def test_validate_rejects_weak_password_case_insensitive():
    # "Administrator" is 13 chars (>= MIN_PASSWORD_LEN) so the length
    # check passes; lowercased it hits the weak-password set, which is
    # what we're verifying.
    with pytest.raises(HTTPException) as exc:
        validate_new_password("Administrator")
    assert _detail(exc.value)["error"] == "setup_password_weak"


# ── password: whitespace policy ───────────────────────────────────────
#
# Edge whitespace is rejected; internal whitespace is explicitly allowed
# so passphrases stay usable. This is the one rule that differs between
# the username and password fields.


@pytest.mark.parametrize("pw", [" leadingspace1", "trailingspace1 ", " both1234567 ", "\ttab1234567"])
def test_validate_rejects_edge_whitespace_password(pw):
    with pytest.raises(HTTPException) as exc:
        validate_new_password(pw)
    assert _detail(exc.value)["error"] == "password_whitespace"


def test_validate_accepts_internal_whitespace_password():
    """Passphrases are the strongest thing a human picks unaided."""
    assert validate_new_password("correct horse battery") == "correct horse battery"


def test_whitespace_cannot_pad_a_short_password_past_the_length_gate():
    """"1234 5678 " is ten characters and only eight are real.

    Edge-whitespace must be checked BEFORE length or padding defeats the
    minimum entirely.
    """
    with pytest.raises(HTTPException) as exc:
        validate_new_password("1234 5678 ")
    assert _detail(exc.value)["error"] == "password_whitespace"


def test_validate_returns_password_unchanged():
    """Never normalise — what the user typed is what gets hashed."""
    assert validate_new_password("correct-horse-battery") == "correct-horse-battery"


# ── username: no whitespace at all ────────────────────────────────────


@pytest.mark.parametrize("name", [" alice", "alice ", "al ice", "al\tice", " "])
def test_validate_rejects_any_whitespace_username(name):
    with pytest.raises(HTTPException) as exc:
        validate_new_username(name)
    assert _detail(exc.value)["error"] == "username_whitespace"


def test_validate_rejects_empty_username():
    with pytest.raises(HTTPException) as exc:
        validate_new_username("")
    assert _detail(exc.value)["error"] == "username_required"


def test_validate_rejects_overlong_username():
    with pytest.raises(HTTPException) as exc:
        validate_new_username("a" * (MAX_USERNAME_LEN + 1))
    assert _detail(exc.value)["error"] == "username_too_long"


def test_validate_returns_username_unchanged():
    assert validate_new_username("alice") == "alice"
