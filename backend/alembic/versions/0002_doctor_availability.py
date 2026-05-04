"""doctor availability

Revision ID: 0002_doctor_availability
Revises: 0001_initial_schema
Create Date: 2026-04-29

Adds the `doctor_availability` table — advisory time windows that a doctor
(or a healthworker on their behalf) declares so the booking UI can show
when a doctor is reachable. Booking is *not* gated on these windows; they
are reference-only.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0002_doctor_availability"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS doctor_availability (
            availability_id  SERIAL PRIMARY KEY,
            doctor_id        INTEGER NOT NULL
                                 REFERENCES doctor(doctor_id) ON DELETE CASCADE,
            start_at         TIMESTAMPTZ NOT NULL,
            end_at           TIMESTAMPTZ NOT NULL,
            note             TEXT,
            created_by       VARCHAR(255) NOT NULL
                                 REFERENCES accounts(username),
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (end_at > start_at)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS doctor_availability_doctor_time "
        "ON doctor_availability (doctor_id, start_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS doctor_availability_time "
        "ON doctor_availability (start_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS doctor_availability_time")
    op.execute("DROP INDEX IF EXISTS doctor_availability_doctor_time")
    op.execute("DROP TABLE IF EXISTS doctor_availability")
