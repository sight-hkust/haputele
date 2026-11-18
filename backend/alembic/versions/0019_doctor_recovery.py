"""Verified doctor email and one-time password recovery."""

from alembic import op
import sqlalchemy as sa

revision = "0019_doctor_recovery"
down_revision = "0018_profile_betel_areca"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("doctor", sa.Column("verified_email", sa.String(255)))
    op.add_column(
        "accounts",
        sa.Column("credential_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("accounts", sa.Column("reset_digest", sa.String(64)))
    op.add_column("accounts", sa.Column("reset_expires_at", sa.DateTime(timezone=True)))
    op.create_index(
        "accounts_reset_digest_idx",
        "accounts",
        ["reset_digest"],
        unique=True,
        postgresql_where=sa.text("reset_digest IS NOT NULL"),
    )
    # Every password write, including operator resets and invite redemption,
    # invalidates previously issued links and logged-in sessions atomically.
    op.execute("""
        CREATE FUNCTION invalidate_old_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            NEW.credential_version := OLD.credential_version + 1;
            NEW.reset_digest := NULL;
            NEW.reset_expires_at := NULL;
            UPDATE doctor_invites i SET consumed_at = NOW()
              FROM doctor d WHERE d.username = NEW.username AND i.doctor_id = d.doctor_id
              AND i.consumed_at IS NULL;
            RETURN NEW;
        END $$;
    """)
    op.execute("""
        CREATE TRIGGER accounts_password_changed BEFORE UPDATE OF password ON accounts
        FOR EACH ROW WHEN (NEW.role = 'doctor' AND OLD.password IS DISTINCT FROM NEW.password)
        EXECUTE FUNCTION invalidate_old_credentials()
    """)


def downgrade():
    op.execute("DROP TRIGGER accounts_password_changed ON accounts")
    op.execute("DROP FUNCTION invalidate_old_credentials()")
    op.drop_index("accounts_reset_digest_idx", table_name="accounts")
    for column in ("reset_expires_at", "reset_digest", "credential_version"):
        op.drop_column("accounts", column)
    op.drop_column("doctor", "verified_email")
