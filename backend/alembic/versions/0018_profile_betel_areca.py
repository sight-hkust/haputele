"""profile gains a betel leaf / areca nut chewing column

Revision ID: 0018_profile_betel_areca
Revises: 0017_username_no_whitespace
Create Date: 2026-08-19

Issue #64. The lifestyle section captured smoking and alcohol only, both of
which skew heavily male across South Asia, so betel quid and areca nut chewing
— the leading oral-cancer risk factor in the region — had nowhere to be
recorded. (#64 spells it "acorn"; that was a mishearing of "areca" in the field
notes the issue was transcribed from.)

Shape follows `smoking` rather than `alcohol`: never/current/prior, because
"prior" stays clinically meaningful for cancer risk long after someone stops.

The CHECK mirrors how smoking and alcohol were declared in 0001, so the enum
holds regardless of which code path writes the row — the schema layer
(`BetelArecaStatus`) rejects bad values at the API boundary, and this is the
backstop underneath it.

Nullable with no backfill: every existing profile predates the question being
asked, and NULL correctly means "never asked" rather than "answered none".
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0018_profile_betel_areca"
down_revision: Union[str, None] = "0017_username_no_whitespace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE profile ADD COLUMN IF NOT EXISTS betel_areca VARCHAR(20)
            CONSTRAINT profile_betel_areca_check
            CHECK (betel_areca IN ('never','current','prior'))
        """
    )


def downgrade() -> None:
    # Dropping the column takes its CHECK with it.
    op.execute("ALTER TABLE profile DROP COLUMN IF EXISTS betel_areca")
