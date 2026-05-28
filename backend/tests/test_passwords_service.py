"""Unit tests for the shared password validator.

Anchors the contract so /setup/initialize and /sysadmin/accounts can't
silently drift on what counts as a 'weak' or 'too-short' password.
"""
import pytest

from app.errors import HTTPException
from app.services.passwords import (
    MIN_PASSWORD_LEN,
    validate_new_password,
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
