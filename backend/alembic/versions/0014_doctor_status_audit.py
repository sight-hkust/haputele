"""doctor status audit: submitted-at, actor columns, reapply linkage

Revision ID: 0014_doctor_status_audit
Revises: 0013_account_profile
Create Date: 2026-06-07

Makes the doctor approval lifecycle manageable at scale:

  doctor
    - created_at        → TIMESTAMPTZ NOT NULL. When the row sprang into
                          existence — i.e. when the doctor submitted their
                          profile (new-doctor flow) or the admin typed it
                          (legacy flow). Lets the admin sort the approval
                          queue newest-first and spot stale submissions.
                          Backfilled to COALESCE(approved_at, rejected_at,
                          NOW()) so pre-existing rows get a sane value.
    - approved_by       → VARCHAR(255) NULL, FK accounts(username). Which
                          admin approved. ON DELETE SET NULL so removing an
                          admin account doesn't erase the doctor's history.
    - rejected_by       → VARCHAR(255) NULL, FK accounts(username). Which
                          admin rejected.
    - previous_doctor_id → INTEGER NULL self-FK. When a rejected doctor
                          reapplies with the same email, the fresh row
                          points back at the rejected one it supersedes,
                          so the audit trail across attempts is navigable.

Partial unique index `doctor_one_live_email_idx` on lower(email) WHERE
rejected_at IS NULL: at most one *live* (approved or awaiting) doctor per
email, while any number of rejected tombstones may share that address.
This is what lets a rejected doctor be re-invited without the row-level
email collision, while still preventing two working accounts on one
address. Mirrors the partial-unique pattern of accounts_one_sysadmin_idx.

NOTE: index creation will fail if the existing data already has two
non-rejected doctors on the same (case-insensitive) email — that would
itself be a pre-existing data bug to resolve before upgrading.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0014_doctor_status_audit"
down_revision: Union[str, None] = "0013_account_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # created_at — add nullable, backfill, then enforce NOT NULL + default.
    op.execute("ALTER TABLE doctor ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ")
    op.execute(
        """
        UPDATE doctor
        SET created_at = COALESCE(approved_at, rejected_at, NOW())
        WHERE created_at IS NULL
        """
    )
    op.execute("ALTER TABLE doctor ALTER COLUMN created_at SET DEFAULT NOW()")
    op.execute("ALTER TABLE doctor ALTER COLUMN created_at SET NOT NULL")

    # Actor columns. FK to accounts; SET NULL on delete so the doctor's
    # history survives the admin's account being removed.
    op.execute("ALTER TABLE doctor ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255)")
    op.execute("ALTER TABLE doctor ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(255)")
    op.execute(
        """
        ALTER TABLE doctor
        ADD CONSTRAINT doctor_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES accounts(username) ON DELETE SET NULL
        """
    )
    op.execute(
        """
        ALTER TABLE doctor
        ADD CONSTRAINT doctor_rejected_by_fkey
        FOREIGN KEY (rejected_by) REFERENCES accounts(username) ON DELETE SET NULL
        """
    )

    # Reapplication linkage — self-FK.
    op.execute("ALTER TABLE doctor ADD COLUMN IF NOT EXISTS previous_doctor_id INTEGER")
    op.execute(
        """
        ALTER TABLE doctor
        ADD CONSTRAINT doctor_previous_doctor_id_fkey
        FOREIGN KEY (previous_doctor_id) REFERENCES doctor(doctor_id) ON DELETE SET NULL
        """
    )

    # At most one live (non-rejected) doctor per case-insensitive email.
    op.execute(
        """
        CREATE UNIQUE INDEX doctor_one_live_email_idx
        ON doctor (lower(email))
        WHERE rejected_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS doctor_one_live_email_idx")
    op.execute("ALTER TABLE doctor DROP CONSTRAINT IF EXISTS doctor_previous_doctor_id_fkey")
    op.execute("ALTER TABLE doctor DROP COLUMN IF EXISTS previous_doctor_id")
    op.execute("ALTER TABLE doctor DROP CONSTRAINT IF EXISTS doctor_rejected_by_fkey")
    op.execute("ALTER TABLE doctor DROP CONSTRAINT IF EXISTS doctor_approved_by_fkey")
    op.execute("ALTER TABLE doctor DROP COLUMN IF EXISTS rejected_by")
    op.execute("ALTER TABLE doctor DROP COLUMN IF EXISTS approved_by")
    op.execute("ALTER TABLE doctor DROP COLUMN IF EXISTS created_at")
