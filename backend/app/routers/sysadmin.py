"""Sys-admin endpoints — platform administration, not clinical.

The sys-admin is the platform "ops super user": minted once by the
first-run wizard (`/setup/initialize`), a DB-enforced singleton, distinct
from the clinical `admin` role. These endpoints are the ops account-
management surface.

  read-only : `/me`, `/system-config`, `GET /accounts` (full roster)
  manage    : create / reset-password / disable / enable / delete for the
              operating roles (admin, healthworker)

Doctor accounts are read-only here: they carry a profile row and have
their own lifecycle (approval, invites, deactivate) under `/doctors`,
which is admin-gated. The sys-admin may edit its OWN profile + password
(self-service), but can never disable or delete the singleton ops account
— that would be a lockout.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Literal

from ..deps import CurrentUser, db_dep, require_role
from ..errors import conflict, forbidden, not_found, unprocessable
from ..models import (
    Account,
    AppointmentAttachment,
    Doctor,
    DoctorAvailability,
    QueueEntry,
    SystemConfig,
)
from ..security import hash_password
from ..services.passwords import validate_new_password
from ..services.system_config import get_system_config, reload_system_config


router = APIRouter(prefix="/sysadmin", tags=["sysadmin"])

# Roles the sys-admin may mutate through this surface. Doctors and the
# sys-admin singleton are intentionally excluded (see module docstring).
MANAGEABLE_ROLES = ("admin", "healthworker")


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


# ── account roster (read-only, all roles) ────────────────────────────


class AccountRow(BaseModel):
    username: str
    role: str
    # Ops-managed profile (operating accounts only); None for doctors and
    # the sys-admin.
    fullName: str | None = None
    contact: str | None = None
    # Account-level soft-disable stamp. Always None for doctors (their
    # lifecycle is the `active` flag below, not this column) and for the
    # sys-admin (never disabled here).
    disabledAt: datetime | None
    # True only for the operating roles this surface can mutate. The
    # frontend uses it to decide which rows show action buttons.
    manageable: bool
    # Populated only for doctor rows, mirroring `doctor.active`, so the
    # roster shows an accurate status for accounts whose lifecycle lives
    # in the /doctors surface rather than accounts.disabled_at.
    doctorActive: bool | None = None
    # Populated only for doctor rows — lets the frontend open the doctor's
    # full editor (GET /doctors/{id}) from the roster.
    doctorId: int | None = None


@router.get("/accounts", response_model=list[AccountRow])
def list_accounts(
    db: Session = Depends(db_dep),
    _: CurrentUser = Depends(require_role("sys-admin")),
) -> list[AccountRow]:
    """Roster of every account EXCEPT the ops account itself. Admins and
    healthworkers are manageable; doctors are surfaced read-only (managed
    via the shared doctor tools). The sys-admin manages its own account
    from the System page, so it's excluded here."""
    # One extra query for the doctor active/id, keyed by username, so the
    # roster build stays O(1) in round-trips regardless of account count.
    doctor_by_username = {
        username: (active, doctor_id)
        for username, active, doctor_id in db.execute(
            select(Doctor.username, Doctor.active, Doctor.doctor_id)
        ).all()
    }
    accounts = db.scalars(
        select(Account).where(Account.role != "sys-admin").order_by(Account.role, Account.username)
    ).all()
    rows: list[AccountRow] = []
    for a in accounts:
        doc = doctor_by_username.get(a.username) if a.role == "doctor" else None
        rows.append(
            AccountRow(
                username=a.username,
                role=a.role,
                fullName=a.full_name,
                contact=a.contact,
                disabledAt=a.disabled_at,
                manageable=a.role in MANAGEABLE_ROLES,
                doctorActive=doc[0] if doc else None,
                doctorId=doc[1] if doc else None,
            )
        )
    return rows


# ── operating-account creation ───────────────────────────────────────


def _clean(value: str | None) -> str | None:
    """Trim a free-text profile field; empty/whitespace becomes NULL so the
    DB doesn't accumulate blank strings that the UI would render as empty."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


class AccountCreateIn(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str
    # Pydantic validates `role` against the literal; an unknown value
    # surfaces as a 422 from the framework before our handler runs.
    role: Literal["admin", "healthworker"]
    # Optional ops-managed profile captured at create time.
    fullName: str | None = None
    contact: str | None = None


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
    validate_new_password(payload.password)
    # Fast-path duplicate check; the PK below is authoritative against races.
    if db.get(Account, payload.username):
        raise unprocessable("username_taken")
    account = Account(
        username=payload.username,
        password=hash_password(payload.password),
        role=payload.role,
        full_name=_clean(payload.fullName),
        contact=_clean(payload.contact),
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


# ── operating-account management (password / disable / delete) ───────


def _manageable_account(db: Session, username: str) -> Account:
    """Fetch an account and assert it's one this surface may mutate.

    404 `account_not_found` if it doesn't exist; 403 `cannot_manage_role`
    for doctors (use /doctors) and the sys-admin singleton (no self-service
    here). Centralised so every mutating endpoint enforces the same gate.
    """
    account = db.get(Account, username)
    if account is None:
        raise not_found("account_not_found")
    if account.role not in MANAGEABLE_ROLES:
        raise forbidden("cannot_manage_role")
    return account


def _self_editable_account(db: Session, username: str, user: CurrentUser) -> Account:
    """Like `_manageable_account`, but also lets the signed-in sys-admin edit
    their OWN row (profile + password). Used for non-destructive self-service
    edits. Disable / enable / delete deliberately keep the stricter
    `_manageable_account` gate so the ops account can never lock itself out.
    """
    account = db.get(Account, username)
    if account is None:
        raise not_found("account_not_found")
    if account.role in MANAGEABLE_ROLES or account.username == user.username:
        return account
    raise forbidden("cannot_manage_role")


def _row(account: Account) -> AccountRow:
    return AccountRow(
        username=account.username,
        role=account.role,
        fullName=account.full_name,
        contact=account.contact,
        disabledAt=account.disabled_at,
        manageable=account.role in MANAGEABLE_ROLES,
    )


class AccountUpdateIn(BaseModel):
    # Both optional and only applied when present (PATCH semantics): an
    # omitted field is left untouched; an explicit "" clears it to NULL.
    fullName: str | None = None
    contact: str | None = None


@router.patch("/accounts/{username}", response_model=AccountRow)
def update_account(
    username: str,
    payload: AccountUpdateIn,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(require_role("sys-admin")),
) -> AccountRow:
    """Edit an operating account's ops-managed profile (display name,
    contact); the sys-admin may also edit their own row. Username (the PK)
    and role are immutable here; password is set via reset-password and
    status via disable/enable."""
    account = _self_editable_account(db, username, user)
    fields = payload.model_dump(exclude_unset=True)
    if "fullName" in fields:
        account.full_name = _clean(payload.fullName)
    if "contact" in fields:
        account.contact = _clean(payload.contact)
    db.commit()
    db.refresh(account)
    return _row(account)


class PasswordResetIn(BaseModel):
    password: str


@router.post("/accounts/{username}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    username: str,
    payload: PasswordResetIn,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(require_role("sys-admin")),
) -> Response:
    """Set a new password for an operating account (handed to the user
    out-of-band — operating accounts carry no email for a reset link), or
    change the sys-admin's own password."""
    account = _self_editable_account(db, username, user)
    validate_new_password(payload.password)
    account.password = hash_password(payload.password)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/accounts/{username}/disable", response_model=AccountRow)
def disable_account(
    username: str,
    db: Session = Depends(db_dep),
    _: CurrentUser = Depends(require_role("sys-admin")),
) -> AccountRow:
    """Soft-disable an operating account — blocks /auth/login while
    preserving every record it created. Idempotent: disabling an already-
    disabled account leaves the original stamp untouched."""
    account = _manageable_account(db, username)
    if account.disabled_at is None:
        account.disabled_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(account)
    return _row(account)


@router.post("/accounts/{username}/enable", response_model=AccountRow)
def enable_account(
    username: str,
    db: Session = Depends(db_dep),
    _: CurrentUser = Depends(require_role("sys-admin")),
) -> AccountRow:
    """Re-enable a disabled operating account. Idempotent."""
    account = _manageable_account(db, username)
    if account.disabled_at is not None:
        account.disabled_at = None
        db.commit()
        db.refresh(account)
    return _row(account)


def _account_is_referenced(db: Session, username: str) -> bool:
    """Whether any record pins this account via a RESTRICT foreign key.

    `accounts.username` is referenced by `doctor_availability.created_by`,
    `appointment_attachments.uploaded_by`, and `queue_entries.created_by`,
    none of which cascade — so a hard delete fails at the DB if any exist.
    We pre-check rather than let the IntegrityError surface as a 500.
    """
    for col in (
        DoctorAvailability.created_by,
        AppointmentAttachment.uploaded_by,
        QueueEntry.created_by,
    ):
        if db.scalar(select(col).where(col == username).limit(1)) is not None:
            return True
    return False


@router.delete("/accounts/{username}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    username: str,
    db: Session = Depends(db_dep),
    _: CurrentUser = Depends(require_role("sys-admin")),
) -> Response:
    """Hard-delete an operating account. Refuses (409 `account_in_use`) if
    the account is FK-referenced by data it created — disable it instead."""
    account = _manageable_account(db, username)
    if _account_is_referenced(db, username):
        raise conflict("account_in_use")
    db.delete(account)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
