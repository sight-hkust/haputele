"""email suppression list

Revision ID: 0007_email_suppressions
Revises: 0006_system_init
Create Date: 2026-05-28

Adds the email_suppressions table. The Resend webhook handler writes
into it on `email.bounced` (hard bounce) and `email.complained`
events; services/email.py checks it before every outbound send.

Stored email is the lowercased canonical form — callers and the
webhook handler are responsible for lowercasing before insert/lookup
so the primary-key constraint actually catches duplicates.

reason is a free-form short string (typically the raw webhook event
type, e.g. "bounced.hard" or "complained"), kept untyped so we don't
have to migrate when Resend adds new event variants.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0009_email_suppressions"
down_revision: Union[str, None] = "0008_blobs_to_s3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_suppressions (
            email      VARCHAR(320) PRIMARY KEY,
            reason     VARCHAR(64) NOT NULL,
            detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS email_suppressions")
