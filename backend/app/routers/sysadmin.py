"""Sys-admin endpoints — platform administration, not clinical.

For now this router exposes two read-only routes that prove the role is
wired correctly. Future work (dev dashboard: edit system_config, ops
toggles, etc.) lands in a separate feature.
"""
from fastapi import APIRouter, Depends

from ..deps import CurrentUser, require_role
from ..services.system_config import get_system_config


router = APIRouter(prefix="/sysadmin", tags=["sysadmin"])


@router.get("/me")
def me(user: CurrentUser = Depends(require_role("sys-admin"))) -> dict:
    return {"username": user.username, "role": user.role}


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
