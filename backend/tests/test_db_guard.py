"""The guard that stands between this suite and a live database.

No database required — these are pure string tests. That matters: if this
module needed Postgres it would be skipped on exactly the machines where a
misconfigured DATABASE_URL does the damage.
"""
from __future__ import annotations

import pytest

from tests.dbguard import assert_test_database, is_test_database, target_database


LOCAL_TEST_URL = "postgresql+psycopg2://hapu:hapu@localhost:5432/haputele_test"
# The value docker-compose.yml exports into the api container. This exact URL
# is what wiped the dev database on 2026-08-05.
COMPOSE_DEV_URL = "postgresql+psycopg2://hapu:hapu@db:5432/haputele"


def test_extracts_the_database_name():
    assert target_database(LOCAL_TEST_URL) == "haputele_test"
    assert target_database(COMPOSE_DEV_URL) == "haputele"


def test_query_string_is_not_part_of_the_name():
    url = "postgresql+psycopg2://hapu:hapu@db:5432/haputele_test?sslmode=require"
    assert target_database(url) == "haputele_test"
    assert is_test_database(url)


def test_trailing_slash_is_not_part_of_the_name():
    assert target_database(LOCAL_TEST_URL + "/") == "haputele_test"


def test_accepts_a_test_database():
    assert is_test_database(LOCAL_TEST_URL)
    assert_test_database(LOCAL_TEST_URL)  # does not raise


def test_rejects_the_dev_database():
    assert not is_test_database(COMPOSE_DEV_URL)
    with pytest.raises(pytest.UsageError) as exc:
        assert_test_database(COMPOSE_DEV_URL)
    assert "haputele" in str(exc.value)


def test_rejects_a_url_naming_no_database():
    url = "postgresql+psycopg2://hapu:hapu@db:5432/"
    assert target_database(url) == ""
    with pytest.raises(pytest.UsageError):
        assert_test_database(url)


def test_rejects_a_name_that_merely_contains_test():
    # 'haputele_test_backup' is a real database someone would keep around;
    # a substring match would have happily wiped it.
    url = "postgresql+psycopg2://hapu:hapu@db:5432/haputele_test_backup"
    with pytest.raises(pytest.UsageError):
        assert_test_database(url)


def test_refusal_message_names_the_database_and_the_fix():
    with pytest.raises(pytest.UsageError) as exc:
        assert_test_database(COMPOSE_DEV_URL)
    message = str(exc.value)
    assert "REFUSING TO RUN" in message
    assert "'haputele'" in message
    assert "haputele_test" in message
