"""Runtime view of the system_config singleton row.

Env vars (settings.APP_TIMEZONE, settings.MASTER_CONSENT_VERSION) are
first-run seed defaults only — the setup wizard reads them as form
defaults. Runtime consumers (patients router, pdf, exports) read from
the cached LiveConfig populated here.

Lifecycle:
  - load_system_config(db) is called from the app lifespan startup hook
    and again inside POST /setup/initialize (via reload_system_config).
  - get_system_config() is the cheap accessor for everything downstream.

Concurrency: a single process loads the cache; uvicorn workers are
single-process in our compose deployment (CURRENT_INFRA.md §2). The lock
guards against unlikely re-entrant calls during init/teardown.
"""
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ..models import SystemConfig


@dataclass(frozen=True)
class LiveConfig:
    initialized_at: datetime | None
    institute_name: str | None
    institute_address_lines: list[str] | None
    institute_contact_phone: str | None
    institute_contact_email: str | None
    app_timezone: str | None
    export_timezone: str | None
    master_consent_version: str | None

    @property
    def is_initialized(self) -> bool:
        return self.initialized_at is not None

    @property
    def app_tz(self) -> ZoneInfo:
        if not self.app_timezone:
            raise RuntimeError("app_timezone not set — system is uninitialized")
        return ZoneInfo(self.app_timezone)

    @property
    def export_tz(self) -> ZoneInfo:
        if not self.export_timezone:
            raise RuntimeError("export_timezone not set — system is uninitialized")
        return ZoneInfo(self.export_timezone)


_EMPTY = LiveConfig(None, None, None, None, None, None, None, None)
_cache: LiveConfig = _EMPTY
_loaded: bool = False
_lock = Lock()


def _from_row(row: SystemConfig | None) -> LiveConfig:
    if row is None:
        return _EMPTY
    return LiveConfig(
        initialized_at=row.initialized_at,
        institute_name=row.institute_name,
        institute_address_lines=row.institute_address_lines,
        institute_contact_phone=row.institute_contact_phone,
        institute_contact_email=row.institute_contact_email,
        app_timezone=row.app_timezone,
        export_timezone=row.export_timezone,
        master_consent_version=row.master_consent_version,
    )


def load_system_config(db: Session) -> LiveConfig:
    global _cache, _loaded
    with _lock:
        _cache = _from_row(db.get(SystemConfig, 1))
        _loaded = True
    return _cache


def reload_system_config(db: Session) -> LiveConfig:
    return load_system_config(db)


def get_system_config() -> LiveConfig:
    if not _loaded:
        raise RuntimeError(
            "system_config not loaded — call load_system_config() in app lifespan"
        )
    return _cache
