"""Refuse to run the suite against anything but a test database.

`conftest.py`'s `_wipe_setup_state` fixture is `autouse=True`: before every
single test it deletes every row from accounts, doctor, patients, consultations
and appointments — disabling the `consultations_locked_guard` and
`appointments_locked_guard` immutability triggers in order to do it — and
resets `system_config` to uninitialized.

That is correct behaviour for a test database and catastrophic for any other.
The suite picks its target from `DATABASE_URL`, and the api container exports
`postgresql+psycopg2://hapu:hapu@db:5432/haputele` (docker-compose.yml), so
`docker compose exec api pytest tests/` aimed the wipe at the dev database and
destroyed every account in it on 2026-08-05.

So the target is checked, once, at conftest import time — before collection,
before any fixture, where nothing can skip it. The rule is a name ending in
`_test`, which both the unset-DATABASE_URL default (`haputele_test`) and CI
(.github/workflows/docker.yml) already satisfy.

There is deliberately no override. An escape hatch for this would be a flag
whose only purpose is to re-enable deleting the data we are protecting, and a
flag that exists can be left set by a stray export. A database that needs to
run this suite can be renamed.

The scratch databases in test_migration_0017_username_whitespace.py
(`haputele_mig_<uuid>`) are unaffected: they are created by that module and
handed to alembic through a subprocess environment, and never become the base
URL this guard inspects.
"""
from __future__ import annotations

from urllib.parse import urlparse

import pytest


TEST_DB_SUFFIX = "_test"

_REFUSAL = """\

  ============================ REFUSING TO RUN ============================
  {name!r} is not a test database.

  This suite DELETES every row in accounts, doctor, patients, consultations
  and appointments before EACH test, and resets system_config. It runs only
  against a database whose name ends in {suffix!r}.

  Point it somewhere disposable:

      DATABASE_URL=postgresql+psycopg2://hapu:hapu@localhost:5432/haputele_test \\
          pytest backend/tests/

  Or leave DATABASE_URL unset — it defaults to that database.

  Note that the api container exports DATABASE_URL for the *dev* database, so
  `docker compose exec api pytest tests/` lands here. Override it explicitly:

      docker compose exec \\
          -e DATABASE_URL=postgresql+psycopg2://hapu:hapu@db:5432/haputele_test \\
          api pytest tests/
  =========================================================================
"""


def target_database(url: str) -> str:
    """The database name a SQLAlchemy URL points at, or "" if it names none.

    Strips the `+psycopg2` driver suffix so `urlparse` sees an ordinary
    scheme, the same normalisation `conftest._pg_reachable` uses. A query
    string (`?sslmode=require`) lands in `parsed.query`, not `parsed.path`,
    so it can't be mistaken for part of the name.
    """
    parsed = urlparse(url.replace("+psycopg2", ""))
    return (parsed.path or "").strip("/")


def is_test_database(url: str) -> bool:
    """True when `url` names a database this suite may destroy."""
    return target_database(url).endswith(TEST_DB_SUFFIX)


def assert_test_database(url: str) -> None:
    """Raise `pytest.UsageError` unless `url` names a test database.

    UsageError rather than a plain exception: pytest reports it as a usage
    problem and exits before collecting anything, so no fixture — including
    the wipe — ever gets the chance to run.
    """
    if is_test_database(url):
        return
    raise pytest.UsageError(
        _REFUSAL.format(name=target_database(url) or "<no database in DATABASE_URL>",
                        suffix=TEST_DB_SUFFIX)
    )
