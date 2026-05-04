"""system initialization + sys-admin role

Revision ID: 0006_system_init
Revises: 0005_consent_attachments
Create Date: 2026-05-28

Lands the first-run setup feature:

  1. Widens accounts.role CHECK to include 'sys-admin' and adds a partial
     unique index so at most one sys-admin account can exist (mirrors the
     existing one-admin / one-healthworker singletons).
  2. system_config single-row table. id=1 is enforced via CHECK + DEFAULT.
     initialized_at IS NULL means the system has never run /setup/initialize;
     all non-setup, non-health, non-docs routes return 409 setup_required
     in that state (enforced by SetupRequiredMiddleware, not the DB).
  3. setup_tokens table. token_hash is sha256 hex (length 64, UNIQUE).
     A row with consumed_at IS NULL is the live setup token; the bootstrap
     script in entrypoint.sh creates / reuses / rotates it.

No data backfill: existing dev DBs with admin/healthworker rows will hit
the setup gate on next boot. The operator either runs /setup/initialize
(creating a sys-admin alongside the existing seed accounts) or wipes
db_data and lets the seeder repopulate.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0006_system_init"
down_revision: Union[str, None] = "0005_consent_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0001 created accounts with an anonymous CHECK on role. Discover its
    # generated name via pg_constraint and drop, then re-add an explicitly
    # named CHECK that includes 'sys-admin'.
    op.execute(
        """
        DO $$
        DECLARE
            cname text;
        BEGIN
            SELECT conname INTO cname
            FROM pg_constraint
            WHERE conrelid = 'accounts'::regclass
              AND contype  = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%role%';
            IF cname IS NOT NULL THEN
                EXECUTE format('ALTER TABLE accounts DROP CONSTRAINT %I', cname);
            END IF;
        END $$
        """
    )
    op.execute(
        "ALTER TABLE accounts "
        "ADD CONSTRAINT accounts_role_check "
        "CHECK (role IN ('admin','doctor','healthworker','sys-admin'))"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_sysadmin_idx "
        "ON accounts ((role)) WHERE role = 'sys-admin'"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS system_config (
            id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            initialized_at           TIMESTAMPTZ,
            institute_name           TEXT,
            institute_address_lines  JSONB,
            institute_contact_phone  TEXT,
            institute_contact_email  TEXT,
            app_timezone             TEXT,
            export_timezone          TEXT,
            master_consent_version   TEXT,
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT system_config_initialized_complete CHECK (
                initialized_at IS NULL
                OR (
                    institute_name IS NOT NULL
                    AND institute_address_lines IS NOT NULL
                    AND institute_contact_phone IS NOT NULL
                    AND institute_contact_email IS NOT NULL
                    AND app_timezone IS NOT NULL
                    AND export_timezone IS NOT NULL
                    AND master_consent_version IS NOT NULL
                )
            )
        )
        """
    )
    # Singleton sentinel. ON CONFLICT DO NOTHING in case of partial re-runs.
    op.execute(
        "INSERT INTO system_config (id, initialized_at) "
        "VALUES (1, NULL) ON CONFLICT (id) DO NOTHING"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS setup_tokens (
            id          SERIAL PRIMARY KEY,
            token_hash  VARCHAR(64) NOT NULL UNIQUE
                          CHECK (CHAR_LENGTH(token_hash) = 64),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            consumed_at TIMESTAMPTZ
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS setup_tokens")
    op.execute("DROP TABLE IF EXISTS system_config")
    op.execute("DROP INDEX IF EXISTS accounts_one_sysadmin_idx")
    op.execute("ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_role_check")
    op.execute(
        "ALTER TABLE accounts "
        "ADD CONSTRAINT accounts_role_check "
        "CHECK (role IN ('admin','doctor','healthworker'))"
    )
