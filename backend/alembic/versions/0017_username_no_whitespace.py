"""accounts.username may not contain whitespace

Revision ID: 0017_username_no_whitespace
Revises: 0016_doctor_esignature
Create Date: 2026-08-04

Credential policy backstop. `NewUsername` (services/credentials.py) rejects
any whitespace in a username at the API boundary; this CHECK makes the same
rule true of the data regardless of which code path writes it, now or later.

Why this matters specifically for username: login is an exact primary-key
lookup (`db.get(Account, payload.username)`) and the login form sends what
the user typed verbatim. A username stored as " alice" is therefore
unreachable — nobody can type a leading space they cannot see in a field
that renders it invisibly at the margin. The constraint makes that state
unrepresentable rather than merely discouraged.

There is no password equivalent: by storage time it is a bcrypt hash, and
the plaintext rule can only live in the application layer.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0017_username_no_whitespace"
down_revision: Union[str, None] = "0016_doctor_esignature"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # '\s' covers space, tab, newline, CR, form feed and vertical tab.
    op.execute(
        """
        ALTER TABLE accounts
        ADD CONSTRAINT accounts_username_no_whitespace
        CHECK (username !~ '\\s')
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_username_no_whitespace"
    )
