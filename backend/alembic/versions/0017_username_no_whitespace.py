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

Rollout
-------
The constraint is added `NOT VALID` first, then promoted with
`VALIDATE CONSTRAINT` once we know the table is clean.

That is not timidity about a lock — it is about who this migration is for.
Postgres validates a new CHECK against every existing row, and the rows this
policy exists to prevent *were reachable before it*: a whitespace-bearing
username is precisely the state the PR that introduced this file was written
to fix. So a plain `ADD CONSTRAINT` fails on exactly the deployments that
need it most. `entrypoint.sh` is `set -e` and runs `alembic upgrade head` on
every container start, which turns that failure into an API crash loop — a
full outage caused by one row belonging to one user who already could not
log in.

`NOT VALID` costs nothing in protection: Postgres enforces the CHECK on
every INSERT and UPDATE from the moment it is added. Only the scan of
pre-existing rows is deferred. On a clean database — every fresh install,
every CI run, every dev box — we validate immediately in the same
transaction and the end state is byte-identical to an ordinary
`ADD CONSTRAINT`.

When offenders do exist we report them and exit 0. We deliberately do NOT
repair them. `username` is the primary key, so trimming " alice" to "alice"
either collides with an existing row or, far worse, silently merges two
people's accounts — in a system holding medical records. The same
"reject, never repair" rule the application layer follows for credentials
applies here one layer down: surface the problem to a human, let them
decide. See the `Migration 0017` note in README.md.
"""
import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0017_username_no_whitespace"
down_revision: Union[str, None] = "0016_doctor_esignature"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONSTRAINT_NAME = "accounts_username_no_whitespace"

# '\s' covers space, tab, newline, CR, form feed and vertical tab.
# `standard_conforming_strings` is on by default, so this literal reaches the
# regex engine as a two-character escape rather than a literal backslash-s.
_PREDICATE = r"username !~ '\s'"
_OFFENDER_QUERY = sa.text(r"SELECT username FROM accounts WHERE username ~ '\s' ORDER BY username")

# A long listing helps nobody; the first few are enough to start remediating.
_OFFENDER_LIMIT = 50

# Child of the `alembic` logger, which alembic.ini runs at INFO with
# propagation to a root console handler on stderr — so this reaches an
# operator through `docker compose logs api` with no extra wiring. Even
# without that config, logging's lastResort handler emits WARNING to stderr.
_log = logging.getLogger("alembic.runtime.migration")


def _constraint_state(conn: sa.engine.Connection) -> Union[bool, None]:
    """None if the constraint is absent, else its `convalidated` flag."""
    return conn.execute(
        sa.text(
            """
            SELECT c.convalidated
              FROM pg_constraint c
              JOIN pg_class t ON t.oid = c.conrelid
             WHERE c.conname = :name AND t.relname = 'accounts'
            """
        ),
        {"name": CONSTRAINT_NAME},
    ).scalar()


def _report(offenders: Sequence[str]) -> None:
    """Tell the operator what to fix, and why we will not fix it for them."""
    shown = list(offenders[:_OFFENDER_LIMIT])
    # repr() is load-bearing: ' alice' and 'alice' are indistinguishable
    # printed plain, and the invisible character IS the bug.
    listing = "\n".join(f"      {name!r}" for name in shown)
    if len(offenders) > len(shown):
        listing += f"\n      ... and {len(offenders) - len(shown)} more"

    _log.warning(
        "\n"
        "  ================= MANUAL REMEDIATION REQUIRED =================\n"
        f"  {len(offenders)} account(s) have a username containing whitespace:\n"
        f"{listing}\n"
        "\n"
        "  Each of these accounts is ALREADY unreachable: login is an exact\n"
        "  primary-key lookup against what the user types, and nobody can\n"
        "  type a leading space they cannot see. This migration will NOT\n"
        "  repair them automatically -- username is the primary key, so a\n"
        "  trim can collide with an existing account or silently merge two\n"
        "  people's records.\n"
        "\n"
        f"  The constraint {CONSTRAINT_NAME!r} has been added NOT VALID: new\n"
        "  and updated rows are rejected from now on, but the rows above are\n"
        "  grandfathered in and the constraint is not yet marked validated.\n"
        "\n"
        "  To finish, for each account either\n"
        "    DELETE FROM accounts WHERE username = '<old>';\n"
        "  or rename it to a free name (check for a collision first):\n"
        "    UPDATE accounts SET username = '<new>' WHERE username = '<old>';\n"
        "  then mark the constraint validated:\n"
        f"    ALTER TABLE accounts VALIDATE CONSTRAINT {CONSTRAINT_NAME};\n"
        "\n"
        "  Check status at any time with:\n"
        "    SELECT convalidated FROM pg_constraint\n"
        f"     WHERE conname = '{CONSTRAINT_NAME}';\n"
        "  ==============================================================="
    )


def upgrade() -> None:
    conn = op.get_bind()
    state = _constraint_state(conn)

    if state is True:
        # Already fully applied. Re-running a migration should be a no-op,
        # not a DuplicateObject error — a previous run may have been
        # interrupted, or the constraint hand-applied as a hotfix.
        return

    if state is None:
        op.execute(
            f"ALTER TABLE accounts ADD CONSTRAINT {CONSTRAINT_NAME} "
            f"CHECK ({_PREDICATE}) NOT VALID"
        )

    offenders = conn.execute(_OFFENDER_QUERY).scalars().all()
    if not offenders:
        # The normal path: nothing to grandfather, so make the invariant
        # total. End state is identical to a plain validated ADD CONSTRAINT.
        op.execute(f"ALTER TABLE accounts VALIDATE CONSTRAINT {CONSTRAINT_NAME}")
        return

    _report(offenders)


def downgrade() -> None:
    op.execute(
        f"ALTER TABLE accounts DROP CONSTRAINT IF EXISTS {CONSTRAINT_NAME}"
    )
