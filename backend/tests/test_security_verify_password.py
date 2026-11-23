"""Unit tests for verify_password under bcrypt 5.0's 72-byte input limit.

bcrypt 5.0 makes hashpw/checkpw raise ValueError for passwords longer than
72 UTF-8 bytes; 4.x silently hashed only the first 72. The hash format
itself ($2b$, same cost) is unchanged, so stored hashes verify exactly as
before — the one compatibility hazard is accounts created before the
upgrade, whose stored hash can only cover the truncated bytes. These tests
pin the fallback in app/security.py that keeps those accounts signing in.

`_hash_of` calls bcrypt directly rather than app.security.hash_password on
purpose: a legacy hash must be produced from truncated bytes, which the
current (bcrypt 5.0) hasher refuses to make — that refusal is precisely
why the write paths are gated in services/credentials.py.
"""
from __future__ import annotations

import bcrypt

from app.security import verify_password


def _hash_of(raw: bytes) -> str:
    """Hash raw bytes with bcrypt directly, as bcrypt 4.x hashpw did."""
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def test_within_limit_password_verifies_normally():
    """The common case is untouched: right and wrong answers, no fallback."""
    password = "correct-horse-battery"
    hashed = _hash_of(password.encode("utf-8"))
    assert verify_password(password, hashed)
    assert not verify_password("wrong-horse-battery", hashed)


def test_over_limit_password_verifies_against_its_truncated_hash():
    """A 4.x-era account: the stored hash was made from the first 72 bytes
    of the UTF-8 encoding, because 4.x never stored anything longer. The
    full password must still verify — drop the fallback and this account
    is locked out permanently."""
    password = "p" * 100
    legacy_hash = _hash_of(password.encode("utf-8")[:72])
    assert verify_password(password, legacy_hash)


def test_truncation_is_bytes_even_mid_character():
    """4.x truncated the UTF-8 *encoding* to 72 bytes, which can land inside
    a multi-byte character. The fallback must cut at the same byte, not at
    a character boundary, or the reproduced input differs from what 4.x
    hashed. "a" * 71 is 71 bytes, so byte 72 is é's lead byte (0xC3)."""
    password = "a" * 71 + "é" * 10  # 91 bytes
    legacy_hash = _hash_of(password.encode("utf-8")[:72])
    assert verify_password(password, legacy_hash)


def test_over_limit_password_against_unrelated_hash_is_false():
    """The fallback reproduces truncation, not acceptance: a long password
    that isn't the account's is still a plain mismatch."""
    password = "p" * 100
    legacy_hash = _hash_of(b"q" * 72)
    assert not verify_password(password, legacy_hash)


def test_over_limit_password_against_malformed_hash_is_false():
    """A long password against a garbage hash hits the retry; the retry must
    swallow the malformed-hash ValueError too, not turn it into a 500."""
    assert not verify_password("p" * 100, "not-a-bcrypt-hash")


def test_within_limit_password_against_malformed_hash_is_false():
    """Under 72 bytes the ValueError can only mean a malformed stored hash —
    the pre-5.0 behaviour, kept exactly."""
    assert not verify_password("short", "not-a-bcrypt-hash")
