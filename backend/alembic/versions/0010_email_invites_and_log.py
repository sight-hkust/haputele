"""doctor invites + notification log

Revision ID: 0008_email_invites_and_log
Revises: 0007_email_suppressions
Create Date: 2026-05-28

Lands the email-driven doctor onboarding and reminder features:

  1. doctor_invites — one-shot tokens that let an admin onboard a doctor
     without typing their password. token_hash is sha256-hex (64 chars,
     UNIQUE). A live row has consumed_at IS NULL AND expires_at > NOW().

     One doctor can have multiple historical invite rows; we don't enforce
     "at most one live invite per doctor" in the DB because rotation is a
     valid operation (admin reissues if the doctor lost the link). The
     onboarding endpoint accepts the most recent unconsumed/unexpired row.

  2. notification_log — idempotency guard for any outbound notification.
     dedup_key is a free-form string built by call sites (e.g.
     "reminder.t-24h:appt-123", "doctor.invite:doctor-45"). UNIQUE means
     the cron scanner can `INSERT … ON CONFLICT DO NOTHING` and only send
     when the insert returned a row — exactly-once delivery becomes a
     property of the table, not of the caller's locking.

     We don't FK to appointments / accounts here because the table is
     polymorphic: notifications about deleted entities should still be
     queryable for audit. Call sites that want strong typing pass the
     subject id inside dedup_key.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0010_email_invites_and_log"
down_revision: Union[str, None] = "0009_email_suppressions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS doctor_invites (
            id          SERIAL PRIMARY KEY,
            doctor_id   INTEGER NOT NULL REFERENCES doctor(doctor_id) ON DELETE CASCADE,
            token_hash  VARCHAR(64) NOT NULL UNIQUE
                          CHECK (CHAR_LENGTH(token_hash) = 64),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at  TIMESTAMPTZ NOT NULL,
            consumed_at TIMESTAMPTZ
        )
        """
    )
    # Hot-path index: onboarding POST looks up by token_hash (already covered
    # by UNIQUE) but the admin "re-issue invite" path also scans by doctor.
    op.execute(
        "CREATE INDEX IF NOT EXISTS doctor_invites_doctor_idx "
        "ON doctor_invites (doctor_id, created_at DESC)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_log (
            id            SERIAL PRIMARY KEY,
            dedup_key     TEXT NOT NULL UNIQUE,
            kind          TEXT NOT NULL,
            recipient     TEXT NOT NULL,
            sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            resend_msg_id TEXT
        )
        """
    )
    # The reminder cron also wants to "show me everything sent in the last
    # hour" for ops visibility; sent_at index keeps that cheap.
    op.execute(
        "CREATE INDEX IF NOT EXISTS notification_log_sent_at_idx "
        "ON notification_log (sent_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notification_log")
    op.execute("DROP TABLE IF EXISTS doctor_invites")
