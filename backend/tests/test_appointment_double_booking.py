"""Issue #75: a slot conflict must read as 409, never as a crash.

`_slot_taken` is a read-then-write check. Two requests can both clear it and
race to the write; the partial unique index `appointments_doctor_slot_unique`
is what actually keeps the second row out. Unhandled, that refusal reaches the
loser as a 500 — a generic failure where the pre-check, milliseconds earlier,
would have given a clean `doctor_slot_taken`.

Threads and barriers would reproduce the race but not deterministically. These
tests instead neutralise the pre-check, which puts the request in exactly the
state a lost race leaves it in: past the guard, arriving at an index that
refuses. That is the branch under test, and it fails the same way every run.

Note `queue.py` and `consultations.py` import `_slot_taken` by name, so each
holds its own module-level reference — patching must target the module whose
endpoint is being exercised, not just `app.routers.appointments`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.routers.appointments import SLOT_UNIQUE_INDEX, claiming_doctor_slot


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


@pytest.fixture
def hw_client(client, healthworker_account):
    """TestClient already logged in as the healthworker."""
    username, password = healthworker_account
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def patient_id(initialized_system) -> int:
    from app.database import SessionLocal
    from app.models import Patient

    db = SessionLocal()
    try:
        p = Patient(given_name="Double", family_name="Booking", gender="female")
        db.add(p)
        db.commit()
        return p.patient_id
    finally:
        db.close()


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat()


def _active_count(doctor_id: int, scheduled_at: str) -> int:
    """Active appointments the index would consider duplicates of each other."""
    from app.database import SessionLocal
    from app.models import Appointment
    from sqlalchemy import and_, func, select

    db = SessionLocal()
    try:
        return db.scalar(
            select(func.count())
            .select_from(Appointment)
            .where(
                and_(
                    Appointment.doctor_id == doctor_id,
                    Appointment.scheduled_at == datetime.fromisoformat(scheduled_at),
                    Appointment.status != "cancelled",
                )
            )
        )
    finally:
        db.close()


@pytest.fixture
def lose_the_race(monkeypatch):
    """Blind the pre-check in one module, leaving the index as the only guard."""

    def _blind(module: str) -> None:
        monkeypatch.setattr(f"{module}._slot_taken", lambda *a, **k: False)

    return _blind


# ── POST /appointments ────────────────────────────────────────────────

def test_create_returns_409_when_the_index_refuses(
    hw_client, patient_id, seeded_doctor, lose_the_race
):
    at = _iso(timedelta(hours=3))
    first = hw_client.post(
        "/appointments",
        json={"patientId": patient_id, "doctorId": seeded_doctor.doctor_id, "scheduledAt": at},
        headers=_csrf(hw_client),
    )
    assert first.status_code == 201, first.text

    lose_the_race("app.routers.appointments")
    second = hw_client.post(
        "/appointments",
        json={"patientId": patient_id, "doctorId": seeded_doctor.doctor_id, "scheduledAt": at},
        headers=_csrf(hw_client),
    )
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["error"] == "doctor_slot_taken"
    assert _active_count(seeded_doctor.doctor_id, at) == 1


def test_create_precheck_still_answers_without_a_race(hw_client, patient_id, seeded_doctor):
    """The ordinary path is untouched — same 409, without reaching the index."""
    at = _iso(timedelta(hours=4))
    body = {"patientId": patient_id, "doctorId": seeded_doctor.doctor_id, "scheduledAt": at}
    assert hw_client.post("/appointments", json=body, headers=_csrf(hw_client)).status_code == 201

    r = hw_client.post("/appointments", json=body, headers=_csrf(hw_client))
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "doctor_slot_taken"


# ── PATCH /appointments/{id} ──────────────────────────────────────────

def test_patch_returns_409_when_the_index_refuses(
    hw_client, patient_id, seeded_doctor, lose_the_race
):
    occupied = _iso(timedelta(hours=5))
    mover = _iso(timedelta(hours=6))
    for at in (occupied, mover):
        r = hw_client.post(
            "/appointments",
            json={"patientId": patient_id, "doctorId": seeded_doctor.doctor_id, "scheduledAt": at},
            headers=_csrf(hw_client),
        )
        assert r.status_code == 201, r.text
        if at == mover:
            mover_id = r.json()["id"]

    lose_the_race("app.routers.appointments")
    r = hw_client.patch(
        f"/appointments/{mover_id}",
        json={"scheduledAt": occupied},
        headers=_csrf(hw_client),
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "doctor_slot_taken"
    # The move was rolled back, so the mover still owns its original slot.
    assert _active_count(seeded_doctor.doctor_id, mover) == 1
    assert _active_count(seeded_doctor.doctor_id, occupied) == 1


# ── POST /queue/{qid}/book ────────────────────────────────────────────

@pytest.fixture
def pending_queue_entry(patient_id, healthworker_account) -> int:
    from app.database import SessionLocal
    from app.models import QueueEntry

    db = SessionLocal()
    try:
        entry = QueueEntry(
            patient_id=patient_id,
            source="walk_in",
            status="pending",
            priority="routine",
            created_by=healthworker_account[0],
        )
        db.add(entry)
        db.commit()
        return entry.queue_id
    finally:
        db.close()


def _queue_status(qid: int) -> str:
    from app.database import SessionLocal
    from app.models import QueueEntry

    db = SessionLocal()
    try:
        return db.get(QueueEntry, qid).status
    finally:
        db.close()


def test_queue_book_returns_409_and_leaves_the_entry_pending(
    hw_client, patient_id, seeded_doctor, pending_queue_entry, lose_the_race
):
    """Appointment and entry share one commit, so a lost race must undo both."""
    at = _iso(timedelta(hours=7))
    r = hw_client.post(
        "/appointments",
        json={"patientId": patient_id, "doctorId": seeded_doctor.doctor_id, "scheduledAt": at},
        headers=_csrf(hw_client),
    )
    assert r.status_code == 201, r.text

    lose_the_race("app.routers.queue")
    r = hw_client.post(
        f"/queue/{pending_queue_entry}/book",
        json={"doctorId": seeded_doctor.doctor_id, "scheduledAt": at},
        headers=_csrf(hw_client),
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["error"] == "doctor_slot_taken"
    assert _active_count(seeded_doctor.doctor_id, at) == 1
    assert _queue_status(pending_queue_entry) == "pending"


# ── The helper's discrimination ───────────────────────────────────────
#
# Every slot-claiming write runs inside claiming_doctor_slot, including the
# consultation follow-up path, whose API-level setup is disproportionate to
# what it would add over these.

class _Diag:
    def __init__(self, constraint_name: str | None) -> None:
        self.constraint_name = constraint_name


class _Orig(Exception):
    """Stands in for the driver error wrapped by IntegrityError."""

    def __init__(self, message: str, constraint: str | None = None) -> None:
        super().__init__(message)
        if constraint is not None:
            self.diag = _Diag(constraint)


class _StubSession:
    def __init__(self) -> None:
        self.rolled_back = False

    def rollback(self) -> None:
        self.rolled_back = True


def _integrity(message: str, constraint: str | None = None) -> IntegrityError:
    return IntegrityError("INSERT ...", {}, _Orig(message, constraint))


def test_helper_translates_the_slot_index_by_constraint_name():
    db = _StubSession()
    with pytest.raises(HTTPException) as e:
        with claiming_doctor_slot(db):
            raise _integrity("duplicate key value", SLOT_UNIQUE_INDEX)
    assert e.value.status_code == 409
    assert e.value.detail["error"] == "doctor_slot_taken"
    assert db.rolled_back


def test_helper_falls_back_to_the_message_when_diag_is_absent():
    """A driver that leaves `diag` unpopulated must still be classified."""
    db = _StubSession()
    with pytest.raises(HTTPException) as e:
        with claiming_doctor_slot(db):
            raise _integrity(f'duplicate key violates "{SLOT_UNIQUE_INDEX}"')
    assert e.value.detail["error"] == "doctor_slot_taken"


def test_helper_reraises_an_unrelated_constraint():
    """Mislabelling this as a slot conflict would send debugging the wrong way."""
    db = _StubSession()
    with pytest.raises(IntegrityError):
        with claiming_doctor_slot(db):
            raise _integrity("null value in column", "patients_master_consent_fk")
    assert db.rolled_back


def test_helper_reraises_an_unrelated_error_without_diag():
    db = _StubSession()
    with pytest.raises(IntegrityError):
        with claiming_doctor_slot(db):
            raise _integrity("some other constraint blew up")


def test_helper_is_transparent_when_nothing_conflicts():
    db = _StubSession()
    with claiming_doctor_slot(db):
        pass
    assert not db.rolled_back
