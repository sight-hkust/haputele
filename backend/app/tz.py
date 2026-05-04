"""Application timezones — sourced from system_config at runtime.

The database stores TIMESTAMPTZ values in UTC; we convert to local time
at the display boundary (PDF rendering, export filenames, age calcs).

After the first-run setup feature, both `app_timezone` and `export_timezone`
live in the system_config row (`backend/alembic/versions/0006_system_init.py`).
The setup wizard prefills them from the `APP_TIMEZONE` env var as a
convenience, but at runtime nothing reads the env var directly.

`tzdata` is bundled in python:3.12-slim, so ZoneInfo(...) works without
extra apt-get install.
"""
from zoneinfo import ZoneInfo

from .services.system_config import get_system_config


def app_tz() -> ZoneInfo:
    return get_system_config().app_tz


def export_tz() -> ZoneInfo:
    return get_system_config().export_tz
