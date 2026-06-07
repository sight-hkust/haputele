"""add account profile fields (full_name, contact)

Revision ID: 0013_account_profile
Revises: 0012_account_disabled
Create Date: 2026-06-07

Adds optional `full_name` and `contact` to `accounts` so the sys-admin
(ops super user) can record who an operating account (admin / healthworker)
belongs to and how to reach them. Both are nullable — existing accounts
predate the columns and a username-only account stays valid.

Doctors keep their own richer profile on the `doctor` table; these two
columns are only ever populated for the operating roles.

Downgrade drops both columns (and any data in them).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0013_account_profile"
down_revision: Union[str, None] = "0012_account_disabled"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("full_name", sa.Text(), nullable=True))
    op.add_column("accounts", sa.Column("contact", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "contact")
    op.drop_column("accounts", "full_name")
