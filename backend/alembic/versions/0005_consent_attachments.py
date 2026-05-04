"""consent signature, primary complaint, appointment attachments

Revision ID: 0005_consent_attachments
Revises: 0004_drop_doctor_consultlink
Create Date: 2026-05-26

Three FEEDBACK.md items land here:
  1. Consents gain a captured signature image so an "agreed" click on the
     HW's tablet is backed by a defensible artifact. Old rows are
     grandfathered via a captured_at cutoff in the CHECK.
  2. Preconsultation gains a free-text primary_complaint so doctors see
     why the patient is here before joining the call.
  3. New appointment_attachments table for HW-uploaded photos (wounds,
     skin conditions, injuries). Bytes live in Postgres BYTEA — same
     pattern as doctor.rubber_stamp_image and consultations.signature.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0005_consent_attachments"
down_revision: Union[str, None] = "0004_drop_doctor_consultlink"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Anything captured before this instant is exempt from the signed-consent
# CHECK below. Pinning the grandfathering point keeps the rule strict for
# everything new while letting demo / pre-migration rows pass.
GRANDFATHER_CUTOFF = "2026-05-26 00:00:00+00"


def upgrade() -> None:
    op.execute("ALTER TABLE consents ADD COLUMN signature_image BYTEA")
    op.execute("ALTER TABLE consents ADD COLUMN signature_method VARCHAR(20)")
    op.execute(
        "ALTER TABLE consents ADD CONSTRAINT consents_signed_when_agreed CHECK ("
        "  agreed = false"
        "  OR signature_image IS NOT NULL"
        f"  OR captured_at < TIMESTAMPTZ '{GRANDFATHER_CUTOFF}'"
        ")"
    )

    op.execute("ALTER TABLE preconsultation ADD COLUMN primary_complaint TEXT")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS appointment_attachments (
            attachment_id    SERIAL PRIMARY KEY,
            appointment_id   INTEGER NOT NULL
                                 REFERENCES appointments(appointment_id) ON DELETE CASCADE,
            mime_type        VARCHAR(50) NOT NULL
                                 CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
            filename         VARCHAR(255) NOT NULL,
            bytes            BYTEA NOT NULL,
            byte_size        INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
            caption          TEXT,
            uploaded_by      VARCHAR(255) NOT NULL REFERENCES accounts(username),
            uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS attachment_appointment "
        "ON appointment_attachments (appointment_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS attachment_appointment")
    op.execute("DROP TABLE IF EXISTS appointment_attachments")
    op.execute("ALTER TABLE preconsultation DROP COLUMN IF EXISTS primary_complaint")
    op.execute("ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_signed_when_agreed")
    op.execute("ALTER TABLE consents DROP COLUMN IF EXISTS signature_method")
    op.execute("ALTER TABLE consents DROP COLUMN IF EXISTS signature_image")
