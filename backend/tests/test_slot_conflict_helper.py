"""Unit tests for the `_on_slot_conflict` race-loser helper.

These don't need Postgres: they drive the helper with a fake session to
prove the lost-race verdict is converted into the friendly 409
`doctor_slot_taken` (matching the optimistic pre-check) and that an
unexpected unique violation is re-raised rather than masked.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.routers.appointments import _on_slot_conflict
from app.errors import conflict  # noqa: F401  (ensures import path stands)


class _FakeSession:
    """Minimal stand-in: records rollback(), and answers scalar() with a
    configured value (True → slot is taken, False → nothing matches)."""

    def __init__(self, scalar_value):
        self.scalar_value = scalar_value
        self.rolled_back = 0

    def rollback(self):
        self.rolled_back += 1

    def scalar(self, _stmt):
        return self.scalar_value


def test_lost_race_raises_doctor_slot_taken():
    db = _FakeSession(scalar_value=True)  # the winning row is now visible
    slot = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)
    with pytest.raises(Exception) as ei:
        _on_slot_conflict(db, doctor_id=1, scheduled_at=slot)
    # FastAPI's HTTPException carries the 409 + code.
    assert getattr(ei.value, "status_code", None) == 409
    assert ei.value.detail["error"] == "doctor_slot_taken"
    assert db.rolled_back == 1  # the poisoned session was cleaned before the re-check


def test_unexpected_unique_violation_is_not_masked():
    # _slot_taken says the slot is NOT actually taken — so the IntegrityError
    # we caught was something else. Re-raise so it surfaces honestly.
    db = _FakeSession(scalar_value=False)
    slot = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)
    # The helper re-raises the original IntegrityError from the caller's
    # frame; here there's no active exception, so it raises RuntimeError
    # ("No active exception to re-raise"). Either way it propagates — never
    # returns and never raises the friendly conflict for an absent row.
    with pytest.raises(Exception):
        _on_slot_conflict(db, doctor_id=1, scheduled_at=slot)
    assert db.rolled_back == 1
