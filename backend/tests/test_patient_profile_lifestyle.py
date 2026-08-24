"""Issue #64: betel leaf / areca nut chewing is recordable on the patient profile.

The lifestyle section captured smoking and alcohol only. Both skew heavily male
across South Asia, so betel quid and areca nut chewing — the region's leading
oral-cancer risk factor — had nowhere to go. (#64 spells it "acorn"; that was a
mishearing of "areca" in the field notes the issue was transcribed from.)

The field is shaped like `smoking`, not `alcohol`: never/current/prior rather
than a frequency scale, because "prior" carries risk long after cessation.

Two layers enforce the enum and both are pinned here — `BetelArecaStatus` at the
API boundary, and the CHECK added in migration 0018 underneath it, so the rule
holds whichever code path writes the row.
"""
from __future__ import annotations

import pytest
import sqlalchemy as sa


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
        p = Patient(given_name="Betel", family_name="Chewer", gender="female")
        db.add(p)
        db.commit()
        return p.patient_id
    finally:
        db.close()


def _put_profile(hw_client, patient_id: int, lifestyle: dict):
    return hw_client.put(
        f"/patients/{patient_id}/profile",
        json={
            "diseaseHistory": [],
            "surgicalHistory": [],
            "allergies": [],
            "medications": [],
            "lifestyle": lifestyle,
        },
        headers=_csrf(hw_client),
    )


@pytest.mark.parametrize("status", ["never", "current", "prior"])
def test_round_trips_every_allowed_status(hw_client, patient_id, status):
    r = _put_profile(hw_client, patient_id, {"betelAreca": status})
    assert r.status_code == 200, r.text
    assert r.json()["lifestyle"]["betelAreca"] == status

    # And survives a re-read rather than only echoing the request back.
    # The profile is served nested under the patient, not on its own route.
    again = hw_client.get(f"/patients/{patient_id}")
    assert again.status_code == 200, again.text
    assert again.json()["profile"]["lifestyle"]["betelAreca"] == status


def test_absent_field_reads_back_null(hw_client, patient_id):
    """NULL means "never asked", which is not the same as answering "never"."""
    r = _put_profile(hw_client, patient_id, {"smoking": "never"})
    assert r.status_code == 200, r.text
    assert r.json()["lifestyle"]["betelAreca"] is None


def test_existing_profiles_without_the_column_stay_valid(hw_client, patient_id):
    """The column is nullable and unbackfilled — pre-#64 rows must still serialise."""
    assert _put_profile(hw_client, patient_id, {}).status_code == 200
    r = hw_client.get(f"/patients/{patient_id}")
    assert r.status_code == 200, r.text
    assert r.json()["profile"]["lifestyle"] == {
        "smoking": None,
        "alcohol": None,
        "betelAreca": None,
        "occupation": None,
        "physicalActivity": None,
    }


def test_clearing_a_recorded_value_is_possible(hw_client, patient_id):
    """Omitting the key is how the form sends "not specified" — it must not stick."""
    assert _put_profile(hw_client, patient_id, {"betelAreca": "current"}).status_code == 200
    r = _put_profile(hw_client, patient_id, {})
    assert r.status_code == 200, r.text
    assert r.json()["lifestyle"]["betelAreca"] is None


@pytest.mark.parametrize("bad", ["occasional", "regular", "sometimes", "NEVER", ""])
def test_schema_rejects_values_outside_the_enum(hw_client, patient_id, bad):
    """422 at the boundary — note 'occasional'/'regular' are alcohol's scale, not this one."""
    r = _put_profile(hw_client, patient_id, {"betelAreca": bad})
    assert r.status_code == 422, r.text


def test_check_constraint_rejects_a_direct_write(initialized_system, patient_id):
    """Backstop: the enum holds even for a writer that bypasses the schema layer."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # Postgres rejects this at execute time, not at commit — 'occasional' is
        # alcohol's scale, and the CHECK is what stops it landing in this column.
        with pytest.raises(sa.exc.IntegrityError) as exc:
            db.execute(
                sa.text(
                    "INSERT INTO profile (patient_id, betel_areca) VALUES (:pid, 'occasional')"
                ),
                {"pid": patient_id},
            )
        assert "profile_betel_areca_check" in str(exc.value)
    finally:
        db.rollback()
        db.close()
