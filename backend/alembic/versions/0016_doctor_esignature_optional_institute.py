"""doctor saved e-signature + optional institute contact

Revision ID: 0016_doctor_esignature
Revises: 0015_capture_sessions
Create Date: 2026-06-09

Two changes to the doctor table:

  - default_signature_key → VARCHAR(512) NULL. S3 object key for the
    doctor's optional saved e-signature. When present, consultations can be
    finalised without drawing a signature; the bytes are copied into a fresh
    per-consultation object at submit time, so a later change to this key
    never alters a consultation that was already signed.
  - institute_contact     → drop NOT NULL. The institute phone is now
    optional at registration and on the self-service profile.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0016_doctor_esignature"
down_revision: Union[str, None] = "0015_capture_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE doctor ADD COLUMN IF NOT EXISTS default_signature_key VARCHAR(512)")
    op.execute("ALTER TABLE doctor ALTER COLUMN institute_contact DROP NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE doctor DROP COLUMN IF EXISTS default_signature_key")
    # NOT NULL is intentionally left relaxed on downgrade: rows inserted while
    # this migration was applied may legitimately hold NULL institute_contact,
    # and re-adding the constraint would fail against them. Re-tighten manually
    # only after backfilling if a true rollback is ever required.
