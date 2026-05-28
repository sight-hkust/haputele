"""relax admin + healthworker role singletons

Revision ID: 0007_relax_role_singletons
Revises: 0006_system_init
Create Date: 2026-05-28

Drops the partial unique indexes that pinned `admin` and `healthworker`
to one row apiece. They were a relic of the seed.py-era design where
those two roles were shared kiosk accounts; the first-run wizard now
creates per-user credentials and the UI lets the operator add as many
admin and healthworker accounts as they need.

`accounts_one_sysadmin_idx` is intentionally kept — sys-admin remains a
true singleton, minted by /setup/initialize and never by /sysadmin/accounts.

Downgrade re-creates both indexes; that would fail against any DB that
now holds more than one admin or healthworker row, which is precisely
the user-facing change the upgrade is enabling.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0007_relax_role_singletons"
down_revision: Union[str, None] = "0006_system_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS accounts_one_admin_idx")
    op.execute("DROP INDEX IF EXISTS accounts_one_healthworker_idx")


def downgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_admin_idx "
        "ON accounts (role) WHERE role = 'admin'"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_healthworker_idx "
        "ON accounts (role) WHERE role = 'healthworker'"
    )
