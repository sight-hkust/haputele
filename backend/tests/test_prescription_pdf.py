"""Prescription PDF — the §1.7-mandatory patient age.

§1.7 of the Telemedicine Guidelines for Sri Lanka (v1.0, 2024) lists the
patient's *age* among the mandatory items on an internet-based prescription;
date of birth is not on that list. The renderer previously printed dob and no
age at all. These tests pin down the age itself, the reproducibility property
that makes a re-downloaded prescription match the dispensed copy, and the
signing gate for patients with no dob to derive an age from.

The helpers are asserted directly rather than by parsing rendered PDF bytes —
the backend has no PDF-parsing dependency and this isn't worth adding one for,
which is why `patient_block` exists as a separate pure function.
"""
from __future__ import annotations

import base64
from datetime import date, datetime, timezone

import pytest

from app.database import SessionLocal
from app.models import Account, Appointment, Consultation, Doctor, Patient
from app.pdf import age_on_date, format_age, patient_block, render_prescription_pdf
from app.security import hash_password


# ── age_on_date ───────────────────────────────────────────────────────

def test_age_the_day_before_a_birthday():
    assert age_on_date(date(1990, 6, 15), date(2026, 6, 14)) == 35


def test_age_on_the_birthday_itself():
    assert age_on_date(date(1990, 6, 15), date(2026, 6, 15)) == 36


def test_age_the_day_after_a_birthday():
    assert age_on_date(date(1990, 6, 15), date(2026, 6, 16)) == 36


def test_leap_day_birthday_in_a_non_leap_year():
    """Born 29 Feb: still 0 on 28 Feb of the following (non-leap) year,
    turns 1 on 1 March."""
    assert age_on_date(date(2020, 2, 29), date(2021, 2, 28)) == 0
    assert age_on_date(date(2020, 2, 29), date(2021, 3, 1)) == 1


def test_leap_day_birthday_on_a_leap_year():
    assert age_on_date(date(2020, 2, 29), date(2024, 2, 29)) == 4


def test_nine_month_old_is_zero_years():
    assert age_on_date(date(2025, 9, 1), date(2026, 6, 1)) == 0


# ── format_age ────────────────────────────────────────────────────────

def test_format_age_infant_reads_zero_years():
    """An infant reads "0 years old" — deliberately coarse. The Date of birth
    cell rendered beside it is what makes the real age legible."""
    assert format_age(date(2025, 9, 1), date(2026, 6, 1)) == "0 years old"


def test_format_age_is_singular_at_one():
    assert format_age(date(2025, 6, 1), date(2026, 6, 1)) == "1 year old"


def test_format_age_is_plural_above_one():
    assert format_age(date(1990, 6, 15), date(2026, 6, 16)) == "36 years old"


def test_format_age_without_dob_is_placeholder():
    """Pre-§1.7 patient records may still have a NULL dob."""
    assert format_age(None, date(2026, 6, 1)) == "—"


def test_format_age_with_future_dob_is_placeholder():
    """A dob after the appointment is a typo, not a negative age."""
    assert format_age(date(2030, 1, 1), date(2026, 6, 1)) == "—"


def test_format_age_never_reads_the_clock():
    """The whole point of taking `on` explicitly: the same (dob, date) pair
    yields the same string forever, so re-downloading a prescription months
    later prints the age it was dispensed at."""
    args = (date(1990, 6, 15), date(2026, 6, 16))
    assert format_age(*args) == format_age(*args) == "36 years old"


# ── patient_block ─────────────────────────────────────────────────────

class _FakePatient:
    def __init__(self, dob, n_id="199012345678"):
        self.given_name = "Nimal"
        self.family_name = "Perera"
        self.dob = dob
        self.n_id = n_id


def _cells(rows):
    return [c for row in rows for c in row]


def test_patient_block_carries_age_and_dob_together():
    rows = patient_block(_FakePatient(date(1990, 6, 15)), date(2026, 6, 16))
    cells = _cells(rows)
    assert "Age" in cells
    assert "36 years old" in cells
    # dob stays alongside it — supplementary, not a substitute
    assert "Date of birth" in cells
    assert "1990-06-15" in cells


def test_patient_block_age_is_measured_from_the_appointment_date():
    """Same patient, two different appointments → two different ages."""
    p = _FakePatient(date(1990, 6, 15))
    assert "35 years old" in _cells(patient_block(p, date(2026, 6, 14)))
    assert "36 years old" in _cells(patient_block(p, date(2026, 6, 16)))


def test_patient_block_without_dob_shows_placeholders():
    cells = _cells(patient_block(_FakePatient(None), date(2026, 6, 16)))
    assert cells.count("—") == 2  # dob and age


def test_patient_block_rows_are_uniform_width():
    """reportlab needs every row the same length or Table() raises."""
    rows = patient_block(_FakePatient(date(1990, 6, 15)), date(2026, 6, 16))
    assert {len(r) for r in rows} == {4}


# ── render smoke ──────────────────────────────────────────────────────

_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\x9a\x9c\xa9\x83\x00\x00\x00\x00IEND\xaeB`\x82"
)
_PNG_URL = "data:image/png;base64," + base64.b64encode(_PNG).decode("ascii")

_CREDS = ("dr_rx", "DrRx-Password-123")


class _FakeDoctor:
    given_name = "Anula"
    family_name = "Silva"
    slmc_registration_number = "SLMC-1234"
    qualifications = "MBBS"
    institute_name = "Village Clinic"
    practitioner_address = "12 Temple Rd"
    institute_contact = "+94 11 222 3333"
    rubber_stamp_key = None


class _FakeAppointment:
    scheduled_at = datetime(2026, 6, 16, 9, 0, tzinfo=timezone.utc)


class _FakeConsultation:
    diagnoses = [{"text": "Acute pharyngitis"}]
    medications = [{"genericName": "Amoxicillin", "dose": "500mg", "frequency": "TDS"}]
    labs = []
    referrals = []
    notes_complaint = "Sore throat"
    notes_onset = None
    notes_symptoms = None
    notes_observations = None
    follow_up_date = None
    signature_key = None
    signed_at = None


@pytest.mark.parametrize("dob", [date(1990, 6, 15), None])
def test_render_prescription_pdf_produces_a_pdf(initialized_system, dob):
    out = render_prescription_pdf(
        patient=_FakePatient(dob),
        doctor=_FakeDoctor(),
        appointment=_FakeAppointment(),
        consultation=_FakeConsultation(),
    )
    assert out.startswith(b"%PDF")


# ── signing gate ──────────────────────────────────────────────────────

def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


def _scenario(dob):
    """Seed doctor + patient + in_progress appointment + draft consultation.
    Returns the consultation id."""
    db = SessionLocal()
    try:
        db.add(Account(username=_CREDS[0], password=hash_password(_CREDS[1]), role="doctor"))
        doctor = Doctor(
            username=_CREDS[0],
            given_name="Anula", family_name="Silva",
            contact="+94 11 555 0001",
            email="dr_rx@example.com",
            slmc_registration_number="SLMC-RX-1",
            qualifications="MBBS",
            practitioner_address="12 Temple Rd",
            institute_name="Village Clinic",
            rubber_stamp_key="test/stub-stamp-key.png",
            active=True,
            approved_at=datetime.now(timezone.utc),
        )
        patient = Patient(given_name="Nimal", family_name="Perera", gender="male", dob=dob)
        db.add(doctor)
        db.add(patient)
        db.flush()
        appt = Appointment(
            patient_id=patient.patient_id,
            doctor_id=doctor.doctor_id,
            scheduled_at=datetime.now(timezone.utc),
            status="in_progress",
        )
        db.add(appt)
        db.flush()
        consult = Consultation(appointment_id=appt.appointment_id, status="draft")
        db.add(consult)
        db.commit()
        return consult.consultation_id
    finally:
        db.close()


def _login(client):
    r = client.post("/auth/login", json={"username": _CREDS[0], "password": _CREDS[1]})
    assert r.status_code == 200, r.text
    return client


def test_submit_is_blocked_when_the_patient_has_no_dob(initialized_system, client):
    """Without a dob there's no age to print, so the prescription would be
    born non-compliant. Blocked at signing — the last point the record can
    still be fixed."""
    cid = _scenario(dob=None)
    c = _login(client)
    r = c.post(
        f"/consultations/{cid}/submit", json={"signature": _PNG_URL}, headers=_csrf(c)
    )
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "patient_dob_required"


def test_submit_succeeds_once_the_patient_has_a_dob(initialized_system, client):
    cid = _scenario(dob=date(1990, 6, 15))
    c = _login(client)
    r = c.post(
        f"/consultations/{cid}/submit", json={"signature": _PNG_URL}, headers=_csrf(c)
    )
    assert r.status_code == 200, r.text
