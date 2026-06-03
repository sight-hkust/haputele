"""One-shot demo seeder for the doctor-onboarding flow.

Usage (from inside the api container):

    docker compose exec api python -m app.scripts.demo_invite <doctor_email>

Steps it performs, all idempotent:

  1. Verifies system_config.initialized_at IS NOT NULL. If the wizard
     hasn't been run yet, exits 1 with a hint to visit /setup first.
  2. Upserts a `demo_admin / demo-admin-pass` admin account so the
     operator can log in and exercise the re-issue button later.
  3. Upserts a `demo_doctor` Doctor row with the email argument and
     an unguessable random password.
  4. Issues a fresh DoctorInvite (revoking any prior live one for that
     doctor), sends the templated invite email via Resend, prints both
     the recipient and the raw URL so the operator can click the link
     without waiting for inbox delivery.

Requires RESEND_API_KEY + RESEND_FROM + FRONTEND_BASE_URL to be set;
emits a clear error message if any of them is missing rather than
silently failing inside Resend.
"""
from __future__ import annotations

import argparse
import secrets
import sys

from app.database import SessionLocal
from app.models import Account, Doctor
from app.security import hash_password
from app.services import doctor_invites as invites
from app.services.email import is_configured, send_templated
from app.services.system_config import get_system_config, load_system_config


_DEMO_ADMIN_USERNAME = "demo_admin"
_DEMO_ADMIN_PASSWORD = "demo-admin-pass"  # only used in local demos
_DEMO_DOCTOR_USERNAME = "demo_doctor"


def _ensure_admin(db) -> None:
    if db.get(Account, _DEMO_ADMIN_USERNAME):
        print(f"  ✓ admin already exists: {_DEMO_ADMIN_USERNAME}")
        return
    db.add(Account(
        username=_DEMO_ADMIN_USERNAME,
        password=hash_password(_DEMO_ADMIN_PASSWORD),
        role="admin",
    ))
    db.commit()
    print(f"  ✓ created admin: {_DEMO_ADMIN_USERNAME} / {_DEMO_ADMIN_PASSWORD}")


def _ensure_doctor(db, *, email: str) -> Doctor:
    existing = db.query(Doctor).filter_by(username=_DEMO_DOCTOR_USERNAME).first()
    if existing:
        # Update the email in case the operator wants to re-run with a
        # different recipient (e.g. testing a colleague's address).
        if existing.email != email:
            existing.email = email
            db.commit()
            print(f"  ✓ updated existing doctor email → {email}")
        else:
            print(f"  ✓ doctor already exists: {_DEMO_DOCTOR_USERNAME} (email={email})")
        return existing

    db.add(Account(
        username=_DEMO_DOCTOR_USERNAME,
        password=hash_password(secrets.token_urlsafe(48)),
        role="doctor",
    ))
    db.add(Doctor(
        username=_DEMO_DOCTOR_USERNAME,
        given_name="Demo", family_name="Doctor",
        contact="+94 11 000 0000", email=email,
        slmc_registration_number="SLMC-DEMO", qualifications="MBBS",
        practitioner_address="Demo Address",
        institute_name="Demo Clinic", institute_contact="+94 11 111 1111",
        rubber_stamp_image=b"\x89PNG\r\n\x1a\n", active=True,
    ))
    db.commit()
    doctor = db.query(Doctor).filter_by(username=_DEMO_DOCTOR_USERNAME).first()
    print(f"  ✓ created doctor: {_DEMO_DOCTOR_USERNAME} (id={doctor.doctor_id}, email={email})")
    return doctor


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email", help="Doctor's email address (recipient of the invite)")
    args = parser.parse_args(argv)

    db = SessionLocal()
    try:
        load_system_config(db)
        if not get_system_config().is_initialized:
            print(
                "ERROR: system_config not initialized. Walk through the /setup "
                "wizard first (visit http://localhost:3000/setup and use the "
                "token printed in the api container logs).",
                file=sys.stderr,
            )
            return 1

        if not is_configured():
            print(
                "ERROR: email service not configured. Set RESEND_API_KEY and "
                "RESEND_FROM in the project-root .env, then `docker compose up`.",
                file=sys.stderr,
            )
            return 1

        print("Seeding demo accounts:")
        _ensure_admin(db)
        doctor = _ensure_doctor(db, email=args.email)

        print()
        print("Issuing invite + sending email…")
        invite, raw = invites.issue(db, doctor_id=doctor.doctor_id)
        link = invites.build_invite_link(raw)
        msg_id = send_templated(
            db,
            to=doctor.email,
            subject="Set your password",
            template="doctor_invite",
            context={
                "mode": "rotation",
                "family_name": doctor.family_name,
                "link": link,
                "expires_hours": int(
                    (invite.expires_at - invite.created_at).total_seconds() // 3600
                ),
            },
            tags={"kind": "doctor.invite", "doctor_id": str(doctor.doctor_id)},
        )
        print(f"  ✓ Resend message id: {msg_id}")
        print(f"  ✓ recipient: {doctor.email}")
        print()
        print("=" * 70)
        print("If you don't want to wait for the email, click this link directly:")
        print()
        print(f"  {link}")
        print()
        print("Admin credentials for re-issue testing:")
        print(f"  username: {_DEMO_ADMIN_USERNAME}")
        print(f"  password: {_DEMO_ADMIN_PASSWORD}")
        print("=" * 70)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
