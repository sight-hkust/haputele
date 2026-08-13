from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.routers.appointments import (
    DOCTOR_SLOT_CONSTRAINT,
    _raise_slot_conflict,
)


class _FakeDriverError(Exception):
    def __init__(self, constraint_name: str):
        super().__init__(constraint_name)
        self.diag = SimpleNamespace(constraint_name=constraint_name)


class _FakeSession:
    def __init__(self):
        self.rollback_count = 0

    def rollback(self):
        self.rollback_count += 1


def _integrity_error(constraint_name: str) -> IntegrityError:
    return IntegrityError(
        "INSERT INTO appointments ...",
        {},
        _FakeDriverError(constraint_name),
    )


def test_doctor_slot_constraint_becomes_conflict():
    db = _FakeSession()
    error = _integrity_error(DOCTOR_SLOT_CONSTRAINT)

    with pytest.raises(HTTPException) as caught:
        _raise_slot_conflict(db, error)

    assert caught.value.status_code == 409
    assert caught.value.detail["error"] == "doctor_slot_taken"
    assert caught.value.__cause__ is error
    assert db.rollback_count == 1


def test_unrelated_constraint_reraises_original_error():
    db = _FakeSession()
    error = _integrity_error("appointments_patient_id_fkey")

    with pytest.raises(IntegrityError) as caught:
        _raise_slot_conflict(db, error)

    assert caught.value is error
    assert db.rollback_count == 1
