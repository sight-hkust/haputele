"""add accounts.disabled_at for sys-admin account management

Revision ID: 0012_account_disabled
Revises: 0011_invite_email_approval
Create Date: 2026-06-07

Adds a nullable `disabled_at` timestamp to `accounts`. The ops super user
(sys-admin) disables an operating account (admin / healthworker) by
stamping this column; `/auth/login` refuses any account whose
`disabled_at` is non-NULL. NULL means "active", which is the only value
existing rows can have, so the column is added without a backfill.

Soft-disable rather than row deletion is deliberate: `accounts.username`
is FK-referenced (RESTRICT) by `doctor_availability.created_by`,
`appointment_attachments.uploaded_by`, and `queue_entries.created_by`, so
any account that ever created data cannot be hard-deleted. Disable keeps
the audit trail intact while blocking sign-in.

Downgrade drops the column; any disabled accounts silently become
sign-in-able again, which is the inverse of the feature this enables.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0012_account_disabled"
down_revision: Union[str, None] = "0011_invite_email_approval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("accounts", "disabled_at")
