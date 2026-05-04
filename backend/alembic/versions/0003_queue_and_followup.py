"""queue + consultation follow-up extensions

Revision ID: 0003_queue_and_followup
Revises: 0002_doctor_availability
Create Date: 2026-04-29

Adds:
  - `queue_entries` — backlog of patients needing a consultation, fed from
    three sources: external screening flags, walk-in requests, and
    doctor-recommended follow-ups. HW drains it by booking appointments.
  - `consultations.follow_up_weeks` — the doctor's "approximately N weeks
    later" target, distinct from `follow_up_date` (which is the resolved
    calendar date — the prescription PDF prints whichever is set).
  - `consultations.follow_up_appointment_id` — when the doctor books the
    exact follow-up appointment at submit time, this links to it so the
    consultation view can navigate to the booked slot.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0003_queue_and_followup"
down_revision: Union[str, None] = "0002_doctor_availability"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE consultations
            ADD COLUMN IF NOT EXISTS follow_up_weeks INTEGER
                CHECK (follow_up_weeks IS NULL OR follow_up_weeks BETWEEN 1 AND 52),
            ADD COLUMN IF NOT EXISTS follow_up_appointment_id INTEGER
                REFERENCES appointments(appointment_id)
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS queue_entries (
            queue_id             SERIAL PRIMARY KEY,
            patient_id           INTEGER NOT NULL
                                     REFERENCES patients(patient_id) ON DELETE CASCADE,
            source               VARCHAR(20) NOT NULL
                                     CHECK (source IN ('screening','walk_in','follow_up')),
            status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending','booked','cancelled')),
            priority             VARCHAR(20) NOT NULL DEFAULT 'routine'
                                     CHECK (priority IN ('urgent','routine')),
            preferred_doctor_id  INTEGER REFERENCES doctor(doctor_id),
            target_date          DATE,
            notes                TEXT,
            source_meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
            appointment_id       INTEGER REFERENCES appointments(appointment_id),
            created_by           VARCHAR(255) NOT NULL REFERENCES accounts(username),
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            booked_at            TIMESTAMPTZ,
            cancelled_at         TIMESTAMPTZ,
            cancellation_reason  TEXT,
            CHECK (
                (status = 'pending'   AND appointment_id IS NULL  AND booked_at IS NULL    AND cancelled_at IS NULL) OR
                (status = 'booked'    AND appointment_id IS NOT NULL AND booked_at IS NOT NULL AND cancelled_at IS NULL) OR
                (status = 'cancelled' AND cancelled_at IS NOT NULL)
            )
        )
        """
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS queue_status_target "
        "ON queue_entries (status, target_date)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS queue_patient "
        "ON queue_entries (patient_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS queue_pref_doctor "
        "ON queue_entries (preferred_doctor_id) "
        "WHERE preferred_doctor_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS queue_appointment "
        "ON queue_entries (appointment_id) "
        "WHERE appointment_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS queue_appointment")
    op.execute("DROP INDEX IF EXISTS queue_pref_doctor")
    op.execute("DROP INDEX IF EXISTS queue_patient")
    op.execute("DROP INDEX IF EXISTS queue_status_target")
    op.execute("DROP TABLE IF EXISTS queue_entries")
    op.execute(
        """
        ALTER TABLE consultations
            DROP COLUMN IF EXISTS follow_up_appointment_id,
            DROP COLUMN IF EXISTS follow_up_weeks
        """
    )
