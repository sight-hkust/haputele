"""Sys-admin endpoints — platform administration, not clinical.

The sys-admin is the platform "ops super user": minted once by the
first-run wizard (`/setup/initialize`), a DB-enforced singleton, distinct
from the clinical `admin` role.

  `/me`            — the signed-in ops account and its editable profile
  `/system-config` — clinic identity, timezones, consent version

Account management (roster, create, reset-password, disable, enable,
delete) used to live here too. It moved to `routers/accounts.py`, which
serves both administrative roles and derives what each may touch from the
caller's role. This module keeps only what is genuinely sys-admin-only.
"""
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from sqlalchemy.orm import Session

from ..deps import CurrentUser, db_dep, require_role
from ..errors import not_found, unprocessable
from ..models import Account, SystemConfig
from ..services.system_config import get_system_config, reload_system_config


router = APIRouter(prefix="/sysadmin", tags=["sysadmin"])


def _clean(value: str | None) -> str | None:
    """Trim a free-text config field; empty/whitespace becomes NULL so the
    DB doesn't accumulate blank strings that the UI would render as empty."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


@router.get("/me")
def me(
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(require_role("sys-admin")),
) -> dict:
    """The signed-in ops account, including its editable profile. The
    sys-admin manages its own account from the System page (it's excluded
    from the /accounts roster), so this carries full_name/contact."""
    account = db.get(Account, user.username)
    return {
        "username": user.username,
        "role": user.role,
        "fullName": account.full_name if account else None,
        "contact": account.contact if account else None,
    }


@router.get("/system-config")
def system_config(_: CurrentUser = Depends(require_role("sys-admin"))) -> dict:
    cfg = get_system_config()
    return {
        "initializedAt": cfg.initialized_at,
        "instituteName": cfg.institute_name,
        "instituteAddressLines": cfg.institute_address_lines,
        "instituteContactPhone": cfg.institute_contact_phone,
        "instituteContactEmail": cfg.institute_contact_email,
        "appTimezone": cfg.app_timezone,
        "exportTimezone": cfg.export_timezone,
        "masterConsentVersion": cfg.master_consent_version,
    }


class SystemConfigUpdateIn(BaseModel):
    # All fields are optional (PATCH semantics). Omitted = leave untouched;
    # explicit null clears a nullable field to NULL.
    instituteName: str | None = None
    instituteAddressLines: list[str] | None = None
    instituteContactPhone: str | None = None
    instituteContactEmail: str | None = None
    appTimezone: str | None = None
    exportTimezone: str | None = None
    masterConsentVersion: str | None = None


def _valid_timezone(tz: str | None) -> bool:
    if tz is None:
        return True
    try:
        ZoneInfo(tz)
        return True
    except (ZoneInfoNotFoundError, KeyError):
        return False


@router.patch("/system-config")
def update_system_config(
    payload: SystemConfigUpdateIn,
    db: Session = Depends(db_dep),
    _: CurrentUser = Depends(require_role("sys-admin")),
) -> dict:
    """Edit the clinic / institute identity and system defaults. Reloads the
    in-memory LiveConfig cache so runtime consumers (PDF, exports) see the
    change immediately without a restart."""
    row = db.get(SystemConfig, 1)
    if row is None:
        raise not_found("system_config_not_found")

    fields = payload.model_dump(exclude_unset=True)

    for tz_key in ("appTimezone", "exportTimezone"):
        if tz_key in fields and not _valid_timezone(fields[tz_key]):
            raise unprocessable("invalid_timezone")

    if "instituteName" in fields:
        row.institute_name = _clean(payload.instituteName)
    if "instituteAddressLines" in fields:
        row.institute_address_lines = payload.instituteAddressLines or None
    if "instituteContactPhone" in fields:
        row.institute_contact_phone = _clean(payload.instituteContactPhone)
    if "instituteContactEmail" in fields:
        row.institute_contact_email = _clean(payload.instituteContactEmail)
    if "appTimezone" in fields:
        row.app_timezone = payload.appTimezone
    if "exportTimezone" in fields:
        row.export_timezone = payload.exportTimezone
    if "masterConsentVersion" in fields:
        row.master_consent_version = _clean(payload.masterConsentVersion)

    db.commit()
    db.refresh(row)
    reload_system_config(db)

    return {
        "initializedAt": row.initialized_at,
        "instituteName": row.institute_name,
        "instituteAddressLines": row.institute_address_lines,
        "instituteContactPhone": row.institute_contact_phone,
        "instituteContactEmail": row.institute_contact_email,
        "appTimezone": row.app_timezone,
        "exportTimezone": row.export_timezone,
        "masterConsentVersion": row.master_consent_version,
    }
