"""invite-by-email + admin approval workflow

Revision ID: 0010_invite_email_approval
Revises: 0009_appointment_reminder_refs
Create Date: 2026-05-29

Reshapes the invite + onboarding flow so the admin only types the
doctor's email (and optionally a family-name hint for the greeting),
and the doctor fills out every other field themselves. Adds an
approval step so submissions are visible to the admin before the
account is usable.

Schema changes:

  doctor_invites
    - doctor_id   → NULLable. NULL means "this invite hasn't been
                    consumed yet and there's no Doctor row for it" —
                    the "new doctor" mode. Set when the invite is
                    consumed via the self-onboarding form.
    - email       → new NOT NULL column. Captured at issue time so
                    we can address the invite, surface it on the
                    onboarding page, and reject double-invites of
                    the same address. Backfilled from the linked
                    Doctor row for any pre-existing invites.
    - family_name → optional name hint the admin can provide so the
                    invite email reads "Hi Dr. Perera" instead of a
                    generic greeting.

  doctor
    - approved_at      → TIMESTAMPTZ NULL. NULL = the doctor finished
                          onboarding but hasn't been approved yet.
                          NOT NULL = active and usable. Backfilled to
                          NOW() for every existing doctor so the upgrade
                          doesn't lock anyone out.
    - rejected_at      → TIMESTAMPTZ NULL. Set when an admin rejects a
                          submitted profile. Rejected doctors are also
                          deactivated (active=false) by the route
                          handler; the rejected_at flag preserves the
                          audit trail.
    - rejected_reason  → TEXT NULL. Free-form admin note. Surfaced on
                          the doctor's "your submission was rejected"
                          screen.

No data migration beyond the approved_at backfill — pre-existing
invite rows always have a linked doctor_id so the email backfill is
non-empty.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0011_invite_email_approval"
down_revision: Union[str, None] = "0010_email_invites_and_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # doctor_invites: relax doctor_id NOT NULL, add email + family_name.
    op.execute("ALTER TABLE doctor_invites ALTER COLUMN doctor_id DROP NOT NULL")
    op.execute("ALTER TABLE doctor_invites ADD COLUMN IF NOT EXISTS email TEXT")
    op.execute("ALTER TABLE doctor_invites ADD COLUMN IF NOT EXISTS family_name TEXT")
    # Backfill email from the linked doctor row, then enforce NOT NULL.
    op.execute(
        """
        UPDATE doctor_invites di
        SET email = d.email
        FROM doctor d
        WHERE di.doctor_id = d.doctor_id
          AND di.email IS NULL
        """
    )
    op.execute("ALTER TABLE doctor_invites ALTER COLUMN email SET NOT NULL")

    # doctor: approval state.
    op.execute("ALTER TABLE doctor ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ")
    op.execute("ALTER TABLE doctor ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ")
    op.execute("ALTER TABLE doctor ADD COLUMN IF NOT EXISTS rejected_reason TEXT")
    # Pre-existing rows are implicitly approved — anything else would
    # lock the clinic out of its current bookings on first deploy.
    op.execute("UPDATE doctor SET approved_at = NOW() WHERE approved_at IS NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE doctor DROP COLUMN IF EXISTS rejected_reason")
    op.execute("ALTER TABLE doctor DROP COLUMN IF EXISTS rejected_at")
    op.execute("ALTER TABLE doctor DROP COLUMN IF EXISTS approved_at")
    op.execute("ALTER TABLE doctor_invites DROP COLUMN IF EXISTS family_name")
    op.execute("ALTER TABLE doctor_invites DROP COLUMN IF EXISTS email")
    op.execute("ALTER TABLE doctor_invites ALTER COLUMN doctor_id SET NOT NULL")
