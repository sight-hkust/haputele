"""drop doctor.consultlink

Revision ID: 0004_drop_doctor_consultlink
Revises: 0003_queue_and_followup
Create Date: 2026-05-04

The per-doctor static Google Meet URL is replaced by per-appointment LiveKit
rooms. The doctor-level field is no longer read or written by the application.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0004_drop_doctor_consultlink"
down_revision: Union[str, None] = "0003_queue_and_followup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("doctor", "consultlink")


def downgrade() -> None:
    op.add_column("doctor", sa.Column("consultlink", sa.String(length=500), nullable=True))
