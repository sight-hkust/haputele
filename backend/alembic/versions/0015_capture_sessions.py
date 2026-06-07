"""capture sessions (phone-as-camera via QR)

Revision ID: 0015_capture_sessions
Revises: 0014_doctor_status_audit
Create Date: 2026-06-07

Adds the capture_sessions table backing the "scan a QR code to use your
phone as a one-shot camera" flow. A logged-in operator mints a session,
gets a raw token, and shows a QR encoding {FRONTEND_BASE_URL}/capture/
{token}. The phone that scans it uploads photos straight to the server.

We store only sha256-hex of the raw token (same pattern as setup_tokens
and doctor_invites). `purpose` switches server behaviour on upload:

  appointment_attachment → photo committed directly as an
      appointment_attachments row on appointment_id (FK, ON DELETE
      CASCADE so a deleted appointment takes its live sessions with it).
  rubber_stamp → latest photo parked in the relay_* columns for the
      desktop form to pull (no appointment_id).

token_hash is UNIQUE so a lookup-by-hash is a single index hit. No
separate liveness index — sessions are few and short-lived, and every
lookup is by token_hash anyway.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0015_capture_sessions"
down_revision: Union[str, None] = "0014_doctor_status_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS capture_sessions (
            id                SERIAL PRIMARY KEY,
            token_hash        VARCHAR(64) NOT NULL UNIQUE,
            purpose           VARCHAR(30) NOT NULL,
            appointment_id    INTEGER REFERENCES appointments(appointment_id) ON DELETE CASCADE,
            created_by        VARCHAR(255) NOT NULL REFERENCES accounts(username),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at        TIMESTAMPTZ NOT NULL,
            closed_at         TIMESTAMPTZ,
            upload_count      INTEGER NOT NULL DEFAULT 0,
            relay_object_key  VARCHAR(512),
            relay_mime        VARCHAR(50),
            relay_uploaded_at TIMESTAMPTZ
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS capture_sessions")
