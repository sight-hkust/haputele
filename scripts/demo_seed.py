"""Seed demo-friendly data into a freshly-booted HapuTele backend.

Idempotent-ish: assumes DB was just wiped. Pure stdlib (urllib) so no pip install.

Creates:
  - 1 doctor: drsilva / meet (full §1.7 fields, dummy 1x1 PNG rubber stamp)
  - 3 patients, all with master consent + filled profile
  - 2 doctor availability windows this week
  - 1 appointment in `scheduled` (today @ 10:00 SL time) — the demo target
  - 1 appointment driven all the way to `completed` (yesterday) — fallback for PDF demo
  - 1 walk_in queue entry

Run AFTER `docker compose up` and after /health returns ok.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo

API = "http://localhost:8000"
SL = ZoneInfo("Asia/Colombo")

# Real rubber-stamp image lives next to this script. Loaded as base64 at startup.
STAMP_PATH = os.path.join(os.path.dirname(__file__), "assets", "doctor_stamp.png")
with open(STAMP_PATH, "rb") as _f:
    STAMP_B64 = base64.b64encode(_f.read()).decode("ascii")

# 1x1 PNG, used as the consultation signature only.
TINY_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII="
)

DOCTOR_USER = "drsilva"
DOCTOR_PASS = "meet"
DOCTOR_MEET_LINK = "https://meet.google.com/jif-xfdf-vjr"


# ── HTTP helpers ──────────────────────────────────────────────────────

class HTTPError(Exception):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


def request(method: str, path: str, *, token: str | None = None, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise HTTPError(e.code, e.read().decode("utf-8")) from None


def wait_for_health(max_wait_s: int = 60) -> None:
    deadline = time.time() + max_wait_s
    while time.time() < deadline:
        try:
            request("GET", "/health")
            return
        except Exception:
            time.sleep(1)
    raise SystemExit("backend never came up — is `docker compose up` running?")


def login(username: str, password: str) -> str:
    return request("POST", "/auth/login", body={"username": username, "password": password})["token"]


# ── Time helpers ──────────────────────────────────────────────────────

def sl_today_at(hour: int, minute: int = 0) -> datetime:
    """A timezone-aware datetime today in Asia/Colombo."""
    today = datetime.now(SL).date()
    return datetime.combine(today, dtime(hour, minute), tzinfo=SL)


def sl_yesterday_at(hour: int, minute: int = 0) -> datetime:
    yesterday = (datetime.now(SL) - timedelta(days=1)).date()
    return datetime.combine(yesterday, dtime(hour, minute), tzinfo=SL)


def isoz(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Seeding steps ─────────────────────────────────────────────────────

def create_doctor(admin_token: str) -> int:
    payload = {
        "username": DOCTOR_USER,
        "password": DOCTOR_PASS,
        "givenName": "Anjali",
        "familyName": "Silva",
        "contact": "+94 77 555 0101",
        "email": "anjali.silva@haputele.lk",
        "meetLink": DOCTOR_MEET_LINK,
        "slmcRegistrationNumber": "SLMC-12345",
        "qualifications": "MBBS (Colombo), MD General Medicine",
        "practitionerAddress": "12 Galle Road, Colombo 03",
        "instituteName": "HapuTele Telemedicine Clinic",
        "instituteContact": "+94 11 555 7000 · clinic@haputele.lk",
        "rubberStampImage": STAMP_B64,
    }
    out = request("POST", "/doctors", token=admin_token, body=payload)
    print(f"  doctor: id={out['id']} username={out['username']}")
    return out["id"]


def create_patient(hw_token: str, *, given: str, family: str, dob: str,
                   gender: str, n_id: str, lang: str) -> int:
    payload = {
        "given": given,
        "family": family,
        "dob": dob,
        "gender": gender,
        "language": lang,
        "nationalId": n_id,
        "contact": "+94 71 000 0000",
        "address": "Colombo",
        "masterConsent": {"agreed": True, "version": "v1"},
    }
    out = request("POST", "/patients", token=hw_token, body=payload)
    pid = out["patient"]["id"]
    # Also fill a profile so the doctor screen has something to show.
    request("PUT", f"/patients/{pid}/profile", token=hw_token, body={
        "diseaseHistory": [{"code": "hypertension"}, {"code": "diabetes"}],
        "surgicalHistory": [{"description": "Appendectomy 2014"}],
        "allergies": [{"type": "medication", "name": "Penicillin"}],
        "medications": [{"drug": "Metformin", "dosage": "500mg", "frequency": "BID"}],
        "lifestyle": {"smoking": "never", "alcohol": "occasional",
                      "occupation": "Teacher", "physicalActivity": "Walks 30min/day"},
    })
    print(f"  patient: id={pid} {given} {family}")
    return pid


def create_appointment(hw_token: str, *, patient_id: int, doctor_id: int, when: datetime) -> int:
    out = request("POST", "/appointments", token=hw_token, body={
        "patientId": patient_id,
        "doctorId": doctor_id,
        "scheduledAt": isoz(when),
    })
    print(f"  appointment: id={out['id']} status={out['status']} at={when.isoformat()}")
    return out["id"]


def add_availability(token: str, *, doctor_id: int, start: datetime, end: datetime) -> None:
    request("POST", f"/doctors/{doctor_id}/availability", token=token, body={
        "startAt": isoz(start), "endAt": isoz(end),
    })


def seed_eight_weeks_availability(token: str, *, doctor_id: int) -> int:
    """Bulk-create Mon–Fri, two windows per day (9–12, 14–17 SL), for 8 weeks
    starting from the Monday of the current SL week."""
    today_sl = datetime.now(SL).date()
    monday = today_sl - timedelta(days=today_sl.weekday())  # Monday of this week
    windows = []
    for week in range(8):
        for day in range(5):  # Mon–Fri
            d = monday + timedelta(days=week * 7 + day)
            for start_h, end_h in ((9, 12), (14, 17)):
                start = datetime.combine(d, dtime(start_h, 0), tzinfo=SL)
                end = datetime.combine(d, dtime(end_h, 0), tzinfo=SL)
                windows.append({
                    "startAt": isoz(start),
                    "endAt": isoz(end),
                    "note": "AM clinic" if start_h == 9 else "PM clinic",
                })
    out = request("POST", f"/doctors/{doctor_id}/availability/bulk", token=token,
                  body={"windows": windows})
    print(f"  availability: created {len(out)} windows ({monday} → {monday + timedelta(weeks=8)})")
    return len(out)


def add_walk_in_queue(hw_token: str, *, patient_id: int, doctor_id: int) -> None:
    target = (date.today() + timedelta(days=14)).isoformat()
    out = request("POST", "/queue", token=hw_token, body={
        "patientId": patient_id,
        "source": "walk_in",
        "priority": "routine",
        "preferredDoctorId": doctor_id,
        "targetDate": target,
        "notes": "Patient asked for a follow-up review in ~2 weeks.",
    })
    print(f"  queue entry: id={out['id']} source={out['source']}")


CASES = {
    "cold": {
        "vitals": {"height": 168, "weight": 72, "sysBp": 128, "diaBp": 82, "pulse": 76, "temperature": 36.7},
        "notes": {"complaint": "Headache and fatigue", "onset": "3 days",
                  "symptoms": "Mild fever, no cough", "observations": "Alert, no acute distress"},
        "diagnoses": [{"code": "common_cold"}],
        "medications": [
            {"genericName": "Paracetamol", "tradeName": "Panadol",
             "dose": "500mg", "frequency": "QID PRN", "duration": "5 days",
             "instructions": "Take with food"},
            {"genericName": "Cetirizine", "dose": "10mg", "frequency": "OD at night", "duration": "5 days"},
        ],
        "labs": [{"testName": "FBC", "instructions": "If symptoms persist"}],
        "followUp": {"kind": "weeks", "weeks": 2},
    },
    "htn": {
        "vitals": {"height": 172, "weight": 84, "sysBp": 152, "diaBp": 96, "pulse": 88, "temperature": 36.6},
        "notes": {"complaint": "Recurrent dizziness", "onset": "2 weeks",
                  "symptoms": "Occipital headache, no chest pain", "observations": "BP elevated on review"},
        "diagnoses": [{"code": "hypertension"}],
        "medications": [
            {"genericName": "Amlodipine", "dose": "5mg", "frequency": "OD", "duration": "30 days"},
            {"genericName": "Losartan", "dose": "50mg", "frequency": "OD", "duration": "30 days"},
        ],
        "labs": [{"testName": "Renal panel + electrolytes"}],
        "followUp": {"kind": "weeks", "weeks": 4},
    },
    "asthma": {
        "vitals": {"height": 165, "weight": 60, "sysBp": 118, "diaBp": 76, "pulse": 92, "temperature": 36.8},
        "notes": {"complaint": "Shortness of breath at night", "onset": "1 week",
                  "symptoms": "Audible wheeze, dry cough", "observations": "No accessory-muscle use on video"},
        "diagnoses": [{"code": "asthma"}],
        "medications": [
            {"genericName": "Salbutamol", "tradeName": "Ventolin",
             "dose": "100mcg", "frequency": "2 puffs PRN", "duration": "30 days",
             "instructions": "Use spacer"},
            {"genericName": "Budesonide", "dose": "200mcg", "frequency": "BID", "duration": "30 days"},
        ],
        "labs": [],
        "followUp": {"kind": "weeks", "weeks": 3},
    },
    "diabetes": {
        "vitals": {"height": 170, "weight": 92, "sysBp": 134, "diaBp": 84, "pulse": 80, "temperature": 36.5},
        "notes": {"complaint": "Polyuria and fatigue", "onset": "1 month",
                  "symptoms": "Increased thirst, blurred vision", "observations": "Mildly overweight"},
        "diagnoses": [{"code": "diabetes"}],
        "medications": [
            {"genericName": "Metformin", "dose": "500mg", "frequency": "BID with meals", "duration": "30 days"},
        ],
        "labs": [{"testName": "HbA1c, fasting glucose"}],
        "followUp": {"kind": "weeks", "weeks": 6},
    },
}


def drive_to_completed(hw_token: str, doctor_token: str, *, appt_id: int, case: str = "cold") -> None:
    """Take an appointment from `scheduled` all the way to `completed`."""
    c = CASES[case]
    request("POST", f"/appointments/{appt_id}/consent", token=hw_token, body={
        "scope": "session", "agreed": True,
    })
    request("PUT", f"/appointments/{appt_id}/preconsult", token=hw_token, body=c["vitals"])
    request("POST", f"/appointments/{appt_id}/start-meeting", token=hw_token)
    draft = request("POST", f"/appointments/{appt_id}/consultation/draft", token=doctor_token)
    cid = draft["consultationId"]
    request("PATCH", f"/consultations/{cid}", token=doctor_token, body={
        "notes": c["notes"],
        "diagnoses": c["diagnoses"],
        "medications": c["medications"],
        "labs": c["labs"],
        "referrals": [],
    })
    request("POST", f"/consultations/{cid}/submit", token=doctor_token, body={
        "signature": TINY_PNG,
        "followUp": c["followUp"],
    })
    print(f"  drove appt {appt_id} ({case}) → completed (consultation {cid})")


# ── Main ──────────────────────────────────────────────────────────────

def main() -> None:
    print("waiting for backend…")
    wait_for_health()
    print("backend up.")

    print("logging in admin + healthworker…")
    admin_token = login("admin", "admin")
    hw_token = login("healthworker", "H")

    print("creating doctor…")
    doctor_id = create_doctor(admin_token)

    print("logging in doctor…")
    doctor_token = login(DOCTOR_USER, DOCTOR_PASS)

    print("seeding patients…")
    patients = [
        create_patient(hw_token, given="Nuwan", family="Perera", dob="1985-04-12",
                       gender="male", n_id="852031234V", lang="en"),
        create_patient(hw_token, given="Kavitha", family="Rajan", dob="1992-08-30",
                       gender="female", n_id="199276543210", lang="ta"),
        create_patient(hw_token, given="Sahan", family="Fernando", dob="1978-11-02",
                       gender="male", n_id="781112345V", lang="si"),
        create_patient(hw_token, given="Priyanka", family="Wijesinghe", dob="1968-02-19",
                       gender="female", n_id="688501234V", lang="si"),
        create_patient(hw_token, given="Tharindu", family="Bandara", dob="2001-09-07",
                       gender="male", n_id="200125012345", lang="en"),
    ]

    print("seeding doctor availability (next 8 weeks, Mon–Fri AM+PM)…")
    seed_eight_weeks_availability(hw_token, doctor_id=doctor_id)

    print("seeding appointments…")
    # Earlier-today completed appointments — populate the morning calendar before
    # the demo target so the day looks like a real clinic.
    morning = [
        (sl_today_at(8, 0),  patients[1], "htn"),
        (sl_today_at(8, 30), patients[3], "asthma"),
        (sl_today_at(9, 0),  patients[4], "diabetes"),
    ]
    for when, pid, case in morning:
        a = create_appointment(hw_token, patient_id=pid, doctor_id=doctor_id, when=when)
        drive_to_completed(hw_token, doctor_token, appt_id=a, case=case)

    # Demo target — today at 10:00 SL, in `scheduled`.
    demo_appt = create_appointment(hw_token, patient_id=patients[0], doctor_id=doctor_id,
                                   when=sl_today_at(10, 0))

    # Fallback PDF source — yesterday at 10:00 SL, drive all the way to `completed`.
    completed_appt = create_appointment(hw_token, patient_id=patients[1], doctor_id=doctor_id,
                                        when=sl_yesterday_at(10, 0))
    drive_to_completed(hw_token, doctor_token, appt_id=completed_appt, case="cold")

    print("seeding queue entry…")
    add_walk_in_queue(hw_token, patient_id=patients[2], doctor_id=doctor_id)

    print()
    print("─" * 60)
    print("DEMO SEED COMPLETE")
    print("─" * 60)
    print(f"  Frontend:     http://localhost:3000")
    print(f"  Swagger:      http://localhost:8000/docs")
    print()
    print("  admin login:        admin / admin")
    print("  healthworker login: healthworker / H")
    print(f"  doctor login:       {DOCTOR_USER} / {DOCTOR_PASS}")
    print()
    print(f"  Demo appointment id (scheduled, TODAY 10:00 SL): {demo_appt}")
    print(f"  Fallback completed appointment id (PDF):         {completed_appt}")
    print()


if __name__ == "__main__":
    try:
        main()
    except HTTPError as e:
        print(f"\nFAIL ({e.status}): {e.body}", file=sys.stderr)
        sys.exit(1)
