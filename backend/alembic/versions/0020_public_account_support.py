"""Optional, deliberately published clinic contact for account support."""

from alembic import op
import sqlalchemy as sa

revision = "0020_public_account_support"
down_revision = "0019_doctor_recovery"
branch_labels = None
depends_on = None


def upgrade():
    # No backfill: institute identity and staff contacts were entered privately.
    op.add_column("system_config", sa.Column("public_support_email", sa.Text()))
    op.add_column("system_config", sa.Column("public_support_phone", sa.Text()))


def downgrade():
    op.drop_column("system_config", "public_support_phone")
    op.drop_column("system_config", "public_support_email")
