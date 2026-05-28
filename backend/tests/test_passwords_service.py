"""Unit tests for the shared password/username validator.

Anchors the contract so /setup/initialize and /sysadmin/accounts can't
silently drift on what counts as a 'weak' password or a 'reserved' name.
"""
import pytest

from app.errors import HTTPException
from app.services.passwords import (
    MIN_PASSWORD_LEN,
    RESERVED_USERNAMES,
    validate_new_account,
)


def _detail(exc: HTTPException) -> dict:
    assert isinstance(exc.detail, dict), exc.detail
    return exc.detail


def test_min_password_length_is_ten():
    # If this changes, the wizard's UI hint needs to change too.
    assert MIN_PASSWORD_LEN == 10


def test_validate_accepts_strong_credentials():
    validate_new_account(username="alice", password="correct-horse-battery-staple")


def test_validate_rejects_short_password():
    with pytest.raises(HTTPException) as exc:
        validate_new_account(username="alice", password="short")
    assert _detail(exc.value)["error"] == "setup_password_too_short"
    assert _detail(exc.value)["min"] == MIN_PASSWORD_LEN


def test_validate_min_password_length_boundary():
    """Exactly `MIN_PASSWORD_LEN` chars must be accepted; one fewer rejected."""
    # One below the threshold raises.
    with pytest.raises(HTTPException):
        validate_new_account(username="alice", password="a" * (MIN_PASSWORD_LEN - 1))
    # Exactly at the threshold passes.
    validate_new_account(username="alice", password="a" * MIN_PASSWORD_LEN)


def test_validate_rejects_weak_password_case_insensitive():
    with pytest.raises(HTTPException) as exc:
        validate_new_account(username="alice", password="Administrator")
    assert _detail(exc.value)["error"] == "setup_password_weak"


def test_validate_rejects_reserved_usernames_case_insensitive():
    for reserved in ("admin", "Admin", "ADMIN", "healthworker", "Healthworker", "HEALTHWORKER"):
        with pytest.raises(HTTPException) as exc:
            validate_new_account(username=reserved, password="correct-horse-battery-staple")
        assert _detail(exc.value)["error"] == "setup_username_reserved"


def test_reserved_usernames_set_membership():
    # Lock the membership down so silent additions are caught in review.
    assert RESERVED_USERNAMES == frozenset({"admin", "healthworker"})
