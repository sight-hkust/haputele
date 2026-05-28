"""Demo seed for HapuTele.

Wipes demo data (admin & healthworker accounts preserved) and rebuilds:
  - 3 doctors with §1.7 fields + stamp images
  - 8 patients with master consents + profiles
  - Doctor availability for the next 30 calendar days (Mon–Fri 09:00–12:00 + 14:00–17:00 in APP_TZ)
  - Appointments at every lifecycle stage anchored on "today":
      scheduled, consent_pending, data_collection, in_progress, awaiting_notes
    plus past completed (with full consultations + signed PDFs), past cancelled,
    and a spread of future scheduled appointments
  - Queue entries: pending screening + pending walk-in + a booked entry

Run inside the api container:
    docker compose exec api python -m demo_seed
"""
from __future__ import annotations

import base64
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, text, update

from app.database import SessionLocal
from app.models import (
    Account,
    Appointment,
    Consent,
    Consultation,
    Doctor,
    DoctorAvailability,
    Patient,
    Preconsultation,
    Profile,
    QueueEntry,
)
from app.security import hash_password
from app.tz import APP_TZ


# 1×1 transparent PNG used for both rubber stamps and signatures so the seed
# is self-contained. Replace later with real assets via the API.
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg=="
)

DOCTOR_PASSWORD = "doctor"  # demo only

DOCTORS = [
    {
        "username": "doctor1",
        "given_name": "Anjali",
        "family_name": "Perera",
        "contact": "+94 77 100 0001",
        "email": "anjali.perera@haputele.lk",
        "slmc": "SLMC-12001",
        "qualifications": "MBBS (Colombo), MD (Internal Medicine), MRCP (UK)",
        "address": "12 Galle Road, Colombo 03",
        "institute_name": "Colombo General Hospital",
        "institute_contact": "+94 11 269 1111",
    },
    {
        "username": "doctor2",
        "given_name": "Saman",
        "family_name": "Fernando",
        "contact": "+94 71 200 0002",
        "email": "saman.fernando@haputele.lk",
        "slmc": "SLMC-12002",
        "qualifications": "MBBS (Peradeniya), MS (General Surgery)",
        "address": "44 Kandy Road, Kadawatha",
        "institute_name": "Kadawatha Polyclinic",
        "institute_contact": "+94 11 292 5500",
    },
    {
        "username": "doctor3",
        "given_name": "Niro",
        "family_name": "Jayasuriya",
        "contact": "+94 76 300 0003",
        "email": "niro.jayasuriya@haputele.lk",
        "slmc": "SLMC-12003",
        "qualifications": "MBBS (Sri Jayewardenepura), DFM (Family Medicine)",
        "address": "8/1 Beach Road, Negombo",
        "institute_name": "Negombo Family Care",
        "institute_contact": "+94 31 222 8000",
    },
]

# (given, family, gender, dob, plang, n_id, contact, address)
PATIENTS = [
    ("Kavindi", "Silva", "female", date(1985, 3, 14), "en", "851231400V", "+94 71 555 1001", "23 Lake Road, Battaramulla"),
    ("Ravi", "Wickramasinghe", "male", date(1972, 7, 22), "si", "722030001V", "+94 77 555 1002", "5 Lily Avenue, Maharagama"),
    ("Tharushi", "Bandara", "female", date(1995, 11, 2), "ta", "955072001V", "+94 76 555 1003", "67 Hill Crescent, Kandy"),
    ("Dinesh", "Karunaratne", "male", date(1968, 1, 9), "en", "680091500V", "+94 71 555 1004", "12 Temple Road, Galle"),
    ("Amaya", "De Silva", "female", date(2001, 5, 18), "si", "200113800V", "+94 70 555 1005", "9 Sea View, Mount Lavinia"),
    ("Pradeep", "Senanayake", "male", date(1978, 9, 30), "en", "782740000V", "+94 77 555 1006", "44 Park Lane, Nugegoda"),
    ("Ishara", "Ranatunga", "female", date(1990, 2, 25), "ta", "900560001V", "+94 76 555 1007", "15 Lotus Road, Wattala"),
    ("Mahesh", "Gunawardena", "male", date(1955, 12, 12), "si", "553470001V", "+94 11 555 1008", "27 Old Town, Matara"),
]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def at_local(d: date, hour: int, minute: int = 0) -> datetime:
    """Build a UTC datetime from a local date + hour-of-day in APP_TZ."""
    return datetime.combine(d, time(hour, minute), tzinfo=APP_TZ).astimezone(timezone.utc)


def wipe(db) -> None:
    """Wipe demo tables. Admin & healthworker accounts are preserved.

    `reject_completed_update` blocks UPDATE/DELETE on completed appointments &
    consultations, so we disable both guard triggers for the duration of the
    wipe and re-enable before commit.
    """
    db.execute(text("ALTER TABLE consultations DISABLE TRIGGER consultations_locked_guard"))
    db.execute(text("ALTER TABLE appointments DISABLE TRIGGER appointments_locked_guard"))

    # Break the patients ↔ consents cycle before deleting either side.
    db.execute(update(Patient).values(master_consent_id=None))
    db.execute(delete(QueueEntry))
    db.execute(delete(Consultation))
    db.execute(delete(Preconsultation))
    db.execute(delete(DoctorAvailability))
    # Deleting appointments cascades to session consents (consent.appointment_id
    # ON DELETE CASCADE). Master consents (appointment_id NULL) survive — wipe
    # them next.
    db.execute(delete(Appointment))
    db.execute(delete(Consent))
    db.execute(delete(Profile))
    db.execute(delete(Patient))
    db.execute(delete(Doctor))
    db.execute(delete(Account).where(Account.role == "doctor"))

    db.execute(text("ALTER TABLE consultations ENABLE TRIGGER consultations_locked_guard"))
    db.execute(text("ALTER TABLE appointments ENABLE TRIGGER appointments_locked_guard"))
    db.commit()


def seed_doctors(db) -> list[Doctor]:
    out: list[Doctor] = []
    for spec in DOCTORS:
        db.add(Account(username=spec["username"], password=hash_password(DOCTOR_PASSWORD), role="doctor"))
        d = Doctor(
            username=spec["username"],
            given_name=spec["given_name"],
            family_name=spec["family_name"],
            contact=spec["contact"],
            email=spec["email"],
            slmc_registration_number=spec["slmc"],
            qualifications=spec["qualifications"],
            practitioner_address=spec["address"],
            institute_name=spec["institute_name"],
            institute_contact=spec["institute_contact"],
            rubber_stamp_image=TINY_PNG,
            active=True,
        )
        db.add(d)
        out.append(d)
    db.flush()
    return out


def seed_patients(db) -> list[Patient]:
    out: list[Patient] = []
    for given, family, gender, dob, plang, nid, contact, address in PATIENTS:
        p = Patient(
            given_name=given,
            family_name=family,
            gender=gender,
            dob=dob,
            plang=plang,
            n_id=nid,
            contact=contact,
            address=address,
        )
        db.add(p)
        db.flush()  # need patient_id for the master consent

        master = Consent(
            patient_id=p.patient_id,
            scope="master",
            version="v1",
            agreed=True,
            captured_at=now_utc() - timedelta(days=120),
            signature_image=TINY_PNG,
            signature_method="signature",
        )
        db.add(master)
        db.flush()
        p.master_consent_id = master.consent_id

        # Lightweight profile so the patient detail page has something to show.
        db.add(
            Profile(
                patient_id=p.patient_id,
                diseases=[{"code": "hypertension"}] if given in {"Ravi", "Dinesh", "Mahesh"} else [],
                surgeries=[],
                allergies=[{"type": "medication", "name": "Penicillin"}] if given == "Kavindi" else [],
                existing_medications=[
                    {"drug": "Amlodipine", "dosage": "5 mg", "frequency": "OD"}
                ] if given in {"Ravi", "Dinesh"} else [],
                smoking="never",
                alcohol="occasional" if gender == "male" else "none",
                occupation="Teacher" if given == "Kavindi" else "Driver" if given == "Ravi" else None,
            )
        )
        out.append(p)
    db.flush()
    return out


def seed_availability(db, doctors: list[Doctor], hw_username: str) -> int:
    """30 days of weekday windows for each doctor, in APP_TZ."""
    today = datetime.now(APP_TZ).date()
    count = 0
    for d in doctors:
        for offset in range(30):
            day = today + timedelta(days=offset)
            if day.weekday() >= 5:  # skip Sat/Sun
                continue
            for start_h, end_h, label in ((9, 12, "Morning clinic"), (14, 17, "Afternoon clinic")):
                db.add(
                    DoctorAvailability(
                        doctor_id=d.doctor_id,
                        start_at=at_local(day, start_h),
                        end_at=at_local(day, end_h),
                        note=label,
                        created_by=hw_username,
                    )
                )
                count += 1
    db.flush()
    return count


def add_session_consent(db, patient_id: int, appt_id: int, days_ago: int = 0) -> Consent:
    c = Consent(
        patient_id=patient_id,
        scope="session",
        agreed=True,
        appointment_id=appt_id,
        captured_at=now_utc() - timedelta(days=days_ago),
        # Sign every demo session consent so the post-FEEDBACK CHECK passes
        # uniformly — old rows would have been grandfathered, but mocking the
        # signed state matches how the app actually runs after the migration.
        signature_image=TINY_PNG,
        signature_method="signature",
    )
    db.add(c)
    return c


def add_preconsult(
    db,
    appt_id: int,
    *,
    height=165,
    weight=68,
    sys=120,
    dia=78,
    pulse=76,
    temp="36.7",
    primary_complaint: str | None = "Generally unwell for the past 2 days — mild headache and fatigue.",
) -> Preconsultation:
    pc = Preconsultation(
        appointment_id=appt_id,
        height=height,
        weight=weight,
        systolic=sys,
        diastolic=dia,
        pulse=pulse,
        temperature=Decimal(temp),
        primary_complaint=primary_complaint,
    )
    db.add(pc)
    return pc


def add_completed_consultation(db, appt_id: int, signed_days_ago: int = 0) -> Consultation:
    """A fully populated, signed consultation suitable for the prescription PDF."""
    c = Consultation(
        appointment_id=appt_id,
        status="completed",
        notes_complaint="Sore throat and low-grade fever for 3 days.",
        notes_onset="Gradual onset 3 days ago, worse in the mornings.",
        notes_symptoms="Throat pain on swallowing, mild headache, no cough.",
        notes_observations="Pharynx erythematous, tonsils mildly enlarged, no exudate.",
        diagnoses=[{"code": "others", "text": "Acute pharyngitis"}],
        medications=[
            {
                "genericName": "Amoxicillin",
                "tradeName": "Amoxil",
                "dose": "500 mg",
                "frequency": "TDS",
                "duration": "5 days",
                "instructions": "After meals",
            },
            {
                "genericName": "Paracetamol",
                "tradeName": "Panadol",
                "dose": "1 g",
                "frequency": "QID PRN",
                "duration": "3 days",
                "instructions": "For fever or pain",
            },
        ],
        labs=[{"testName": "Throat swab culture", "instructions": "If symptoms persist > 5 days"}],
        referrals=[],
        follow_up_weeks=2,
        signature=TINY_PNG,
        signed_at=now_utc() - timedelta(days=signed_days_ago),
    )
    db.add(c)
    return c


def add_draft_consultation(db, appt_id: int, *, with_content: bool = False) -> Consultation:
    if with_content:
        return _add_draft_with_content(db, appt_id)
    c = Consultation(appointment_id=appt_id, status="draft")
    db.add(c)
    return c


def _add_draft_with_content(db, appt_id: int) -> Consultation:
    c = Consultation(
        appointment_id=appt_id,
        status="draft",
        notes_complaint="Headache and dizziness for 2 days.",
        notes_onset="Sudden onset yesterday morning.",
        notes_symptoms="Throbbing temporal pain, photophobia.",
        notes_observations="Alert, BP slightly raised, no neuro deficits.",
        diagnoses=[{"code": "hypertension"}],
        medications=[
            {
                "genericName": "Amlodipine",
                "tradeName": "Norvasc",
                "dose": "5 mg",
                "frequency": "OD",
                "duration": "30 days",
                "instructions": "Morning",
            },
        ],
    )
    db.add(c)
    return c


def make_appt(db, *, patient_id: int, doctor_id: int, when: datetime, status: str = "scheduled") -> Appointment:
    a = Appointment(
        patient_id=patient_id,
        doctor_id=doctor_id,
        scheduled_at=when,
        status=status,
    )
    db.add(a)
    db.flush()
    return a


def seed_appointments_and_consultations(db, doctors: list[Doctor], patients: list[Patient]) -> dict:
    """Build a calendar full of appointments, anchored on today (APP_TZ)."""
    today = datetime.now(APP_TZ).date()
    summary = {"completed": 0, "today_demo": 0, "future": 0, "cancelled": 0}

    d1, d2, d3 = doctors
    p = patients  # alias

    # ── Today: one appointment per lifecycle stage on doctor1's schedule ──
    # The HW & doctor demo flows time-travel through these.
    demo_today = [
        ("scheduled", d1, p[0], 9),         # 09:00 — needs session consent
        ("consent_pending", d1, p[1], 10),  # 10:00 — needs vitals
        ("data_collection", d1, p[2], 11),  # 11:00 — ready to start meeting
        ("in_progress", d1, p[3], 14),      # 14:00 — meeting live, draft empty
        ("awaiting_notes", d1, p[4], 15),   # 15:00 — meeting ended, draft populated
    ]
    for status, doc, pat, hour in demo_today:
        a = make_appt(db, patient_id=pat.patient_id, doctor_id=doc.doctor_id,
                      when=at_local(today, hour), status=status)
        if status in {"consent_pending", "data_collection", "in_progress", "awaiting_notes"}:
            add_session_consent(db, pat.patient_id, a.appointment_id)
        if status in {"data_collection", "in_progress", "awaiting_notes"}:
            add_preconsult(db, a.appointment_id)
        if status == "in_progress":
            add_draft_consultation(db, a.appointment_id, with_content=False)
        if status == "awaiting_notes":
            add_draft_consultation(db, a.appointment_id, with_content=True)
        summary["today_demo"] += 1

    # ── Past completed (4) — gives the calendar a "done" green tail and
    #    populates the prescription PDF + medication export with real rows. ──
    completed_specs = [
        (d1, p[5], today - timedelta(days=2), 10, 2),
        (d2, p[6], today - timedelta(days=5), 11, 5),
        (d2, p[7], today - timedelta(days=8), 9, 8),
        (d3, p[0], today - timedelta(days=14), 14, 14),
    ]
    for doc, pat, day, hour, days_ago in completed_specs:
        a = make_appt(db, patient_id=pat.patient_id, doctor_id=doc.doctor_id,
                      when=at_local(day, hour), status="completed")
        add_session_consent(db, pat.patient_id, a.appointment_id, days_ago=days_ago)
        add_preconsult(db, a.appointment_id, sys=132, dia=84, pulse=80, temp="37.2")
        add_completed_consultation(db, a.appointment_id, signed_days_ago=days_ago)
        summary["completed"] += 1

    # ── Future scheduled (8) — calendar visual, lets you book/reschedule live ──
    future_specs = [
        (d2, p[0], 1, 10),
        (d3, p[1], 2, 9),
        (d1, p[2], 3, 14),
        (d2, p[3], 4, 11),
        (d3, p[4], 5, 15),
        (d1, p[5], 7, 9),
        (d2, p[6], 8, 14),
        (d3, p[7], 10, 10),
    ]
    for doc, pat, days_ahead, hour in future_specs:
        make_appt(db, patient_id=pat.patient_id, doctor_id=doc.doctor_id,
                  when=at_local(today + timedelta(days=days_ahead), hour),
                  status="scheduled")
        summary["future"] += 1

    # ── Cancelled (2) — old + recent, with reasons ──
    for doc, pat, days_ago, hour in [(d1, p[2], 6, 11), (d3, p[5], 1, 9)]:
        a = make_appt(db, patient_id=pat.patient_id, doctor_id=doc.doctor_id,
                      when=at_local(today - timedelta(days=days_ago), hour),
                      status="cancelled")
        a.cancellation_reason = "Patient unavailable"
        summary["cancelled"] += 1

    db.flush()
    return summary


def seed_queue(db, doctors: list[Doctor], patients: list[Patient], hw_username: str) -> dict:
    today = datetime.now(APP_TZ).date()
    summary = {"pending": 0, "booked": 0, "cancelled": 0}

    # Pending screening — preferred doctor noted, target next week
    db.add(QueueEntry(
        patient_id=patients[6].patient_id,
        source="screening",
        status="pending",
        priority="urgent",
        preferred_doctor_id=doctors[0].doctor_id,
        target_date=today + timedelta(days=3),
        notes="High BP at screening camp; needs review.",
        source_meta={"camp": "Negombo Mobile Clinic 2026-04-28"},
        created_by=hw_username,
    ))
    summary["pending"] += 1

    # Pending walk-in — routine, no preferred doctor
    db.add(QueueEntry(
        patient_id=patients[7].patient_id,
        source="walk_in",
        status="pending",
        priority="routine",
        target_date=today + timedelta(days=1),
        notes="Repeat prescription; arrived late.",
        source_meta={},
        created_by=hw_username,
    ))
    summary["pending"] += 1

    # Booked entry tied to a real future appointment so the linkage shows up.
    booked_appt = make_appt(
        db,
        patient_id=patients[1].patient_id,
        doctor_id=doctors[1].doctor_id,
        when=at_local(today + timedelta(days=6), 11),
        status="scheduled",
    )
    db.add(QueueEntry(
        patient_id=patients[1].patient_id,
        source="screening",
        status="booked",
        priority="routine",
        preferred_doctor_id=doctors[1].doctor_id,
        target_date=today + timedelta(days=6),
        notes="Diabetes follow-up from camp.",
        source_meta={"camp": "Maharagama Camp 2026-04-15"},
        appointment_id=booked_appt.appointment_id,
        created_by=hw_username,
        booked_at=now_utc(),
    ))
    summary["booked"] += 1

    # Cancelled — recent, with reason
    db.add(QueueEntry(
        patient_id=patients[3].patient_id,
        source="walk_in",
        status="cancelled",
        priority="routine",
        target_date=today - timedelta(days=2),
        notes="Patient left before being booked.",
        source_meta={},
        created_by=hw_username,
        cancelled_at=now_utc() - timedelta(days=2),
        cancellation_reason="Patient walked out",
    ))
    summary["cancelled"] += 1

    db.flush()
    return summary


def main() -> None:
    db = SessionLocal()
    try:
        # The shared HW account must already exist (created via the setup wizard); look it up so
        # availability / queue rows pass the FK to accounts.username.
        hw = db.query(Account).filter(Account.role == "healthworker").one()

        wipe(db)
        doctors = seed_doctors(db)
        patients = seed_patients(db)
        avail_count = seed_availability(db, doctors, hw.username)
        appt_summary = seed_appointments_and_consultations(db, doctors, patients)
        queue_summary = seed_queue(db, doctors, patients, hw.username)
        db.commit()

        print("── HapuTele demo seed complete ──")
        print(f"  doctors:      {len(doctors)}  (logins: doctor1/doctor, doctor2/doctor, doctor3/doctor)")
        print(f"  patients:     {len(patients)}  (each with master consent + profile)")
        print(f"  availability: {avail_count} windows over the next 30 days")
        print(f"  appointments: today_demo={appt_summary['today_demo']} "
              f"completed={appt_summary['completed']} "
              f"future={appt_summary['future']} "
              f"cancelled={appt_summary['cancelled']}")
        print(f"  queue:        pending={queue_summary['pending']} "
              f"booked={queue_summary['booked']} "
              f"cancelled={queue_summary['cancelled']}")
        print()
        print("Login:")
        print("  admin/admin            — admin console (doctor management)")
        print("  healthworker/H         — calendar, patients, queue, exports")
        print("  doctor1/doctor         — Dr. Anjali Perera (today's demo appointments)")
        print("  doctor2/doctor         — Dr. Saman Fernando")
        print("  doctor3/doctor         — Dr. Niro Jayasuriya")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
