"""Sys-admin endpoints — platform administration, not clinical.

Today: read-only `/me` and `/system-config`, plus account creation for
operating roles (admin, healthworker). Doctor accounts use POST /doctors
because they require a profile row beyond plain account credentials.
"""
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Literal

from ..deps import CurrentUser, db_dep, require_role
from ..errors import unprocessable
from ..models import Account
from ..security import hash_password
from ..services.passwords import validate_new_account
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


# ── operating-account creation ───────────────────────────────────────


class AccountCreateIn(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str
    # Pydantic validates `role` against the literal; an unknown value
    # surfaces as a 422 from the framework before our handler runs.
    role: Literal["admin", "healthworker"]


class AccountOut(BaseModel):
    username: str
    role: str


@router.post(
    "/accounts",
    response_model=AccountOut,
    status_code=status.HTTP_201_CREATED,
)
def create_account(
    payload: AccountCreateIn,
    db: Session = Depends(db_dep),
    _: CurrentUser = Depends(require_role("sys-admin")),
) -> AccountOut:
    validate_new_account(username=payload.username, password=payload.password)
    # Fast-path duplicate check; the PK below is authoritative against races.
    if db.get(Account, payload.username):
        raise unprocessable("username_taken")
    account = Account(
        username=payload.username,
        password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent insert won the race; the DB's PK uniqueness is the
        # ultimate source of truth, so we surface the same 422 as the
        # pre-check rather than leak a 500.
        db.rollback()
        raise unprocessable("username_taken")
    # Account has no server-side defaults today; the response can echo
    # the payload directly without refreshing from the DB.
    return AccountOut(username=payload.username, role=payload.role)
