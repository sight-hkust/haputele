"""Operating-account management, shared by the two administrative roles.

An "operating account" is a person who is *only* an `accounts` row —
username, password, display name, contact. Admins and healthworkers are
operating accounts; that single row is the whole person, so create /
edit / disable / delete on this surface is complete and correct.

Doctors are deliberately NOT managed here. A doctor is two rows — the
`accounts` row plus a `doctors` row carrying the clinical profile,
signature, stamp, availability and approval state — and arrives through
an invite → self-fill → approve flow. These endpoints know nothing about
the second row, so a delete here would orphan it and a disable here would
write `accounts.disabled_at` while healthworker booking reads
`doctors.active`. Doctor lifecycle lives in `routers/doctors.py`. Doctors
still *appear* in the sys-admin roster, flagged `manageable=False`, so the
frontend can route the click to the real doctor editor.

The sys-admin singleton is excluded from every mutating path: disabling
or deleting the one ops account is a permanent lockout.

Who may touch what depends on the CALLER, not on a fixed list:

    sys-admin → admin, healthworker
    admin     → healthworker

That asymmetry is the security boundary. An admin who could create admin
accounts, or reset another admin's password, has promoted themselves to
sys-admin — so admin gets no reach over `admin` or `sys-admin` rows at
all, not even roster visibility. Every endpoint below derives its gate
from `manageable_roles()` so the rule is stated once rather than
re-implemented seven times (and so the eighth endpoint someone adds
inherits it).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
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
)
from ..security import hash_password
from ..services.credentials import NewPassword, NewUsername


router = APIRouter(prefix="/accounts", tags=["accounts"])

# The caller's role → the target roles it may create and mutate.
PERMITTED_TARGETS: dict[str, tuple[str, ...]] = {
    "sys-admin": ("admin", "healthworker"),
    "admin": ("healthworker",),
}

# Both administrative roles reach this surface; PERMITTED_TARGETS decides
# what each of them can actually do once inside.
admin_or_sysadmin = require_role("admin", "sys-admin")


def manageable_roles(user: CurrentUser) -> tuple[str, ...]:
    """Target roles this caller may create and mutate.

    Empty tuple for any role not listed — a fail-closed default, so a role
    added to the system later gets no account powers until someone opts it
    in explicitly.
    """
    return PERMITTED_TARGETS.get(user.role, ())


def _clean(value: str | None) -> str | None:
    """Trim a free-text profile field; empty/whitespace becomes NULL so the
    DB doesn't accumulate blank strings that the UI would render as empty."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


# ── roster ───────────────────────────────────────────────────────────


class AccountRow(BaseModel):
    username: str
    role: str
    # Ops-managed profile (operating accounts only); None for doctors.
    fullName: str | None = None
    contact: str | None = None
    # Account-level soft-disable stamp. Always None for doctors (their
    # lifecycle is the `active` flag below, not this column).
    disabledAt: datetime | None
    # True only for rows THIS caller may mutate. The frontend uses it to
    # decide which rows show action buttons.
    manageable: bool
    # Populated only for doctor rows, mirroring `doctor.active`, so the
    # roster shows an accurate status for accounts whose lifecycle lives
    # in the /doctors surface rather than accounts.disabled_at.
    doctorActive: bool | None = None
    # Populated only for doctor rows — lets the frontend open the doctor's
    # full editor (GET /doctors/{id}) from the roster.
    doctorId: int | None = None


def _visible_roles(user: CurrentUser) -> tuple[str, ...]:
    """Roles this caller may SEE in the roster.

    Sys-admin additionally sees doctors read-only, because its roster is
    the whole-platform view and the row is the entry point to the doctor
    editor. Admin sees healthworkers only — it already has a dedicated
    doctor surface at /doctors, and must not see admin or sys-admin rows.
    """
    roles = manageable_roles(user)
    if user.role == "sys-admin":
        return roles + ("doctor",)
    return roles


@router.get("", response_model=list[AccountRow])
def list_accounts(
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(admin_or_sysadmin),
) -> list[AccountRow]:
    """Roster of the accounts this caller may see. The sys-admin's own row
    is never listed — it manages itself from the System page."""
    visible = _visible_roles(user)
    if not visible:
        return []
    # One extra query for the doctor active/id, keyed by username, so the
    # roster build stays O(1) in round-trips regardless of account count.
    doctor_by_username = (
        {
            username: (active, doctor_id)
            for username, active, doctor_id in db.execute(
                select(Doctor.username, Doctor.active, Doctor.doctor_id)
            ).all()
        }
        if "doctor" in visible
        else {}
    )
    accounts = db.scalars(
        select(Account)
        .where(Account.role.in_(visible))
        .order_by(Account.role, Account.username)
    ).all()
    allowed = manageable_roles(user)
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
                manageable=a.role in allowed,
                doctorActive=doc[0] if doc else None,
                doctorId=doc[1] if doc else None,
            )
        )
    return rows


# ── creation ─────────────────────────────────────────────────────────


class AccountCreateIn(BaseModel):
    username: NewUsername
    password: NewPassword
    # Pydantic rejects a role outside the literal with a 422 before the
    # handler runs; the handler then decides whether THIS caller may create
    # that role (403). The two are different failures: "no such role" vs
    # "not yours to create".
    role: Literal["admin", "healthworker"]
    # Optional ops-managed profile captured at create time.
    fullName: str | None = None
    contact: str | None = None


class AccountOut(BaseModel):
    username: str
    role: str


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreateIn,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(admin_or_sysadmin),
) -> AccountOut:
    # The escalation gate: an admin creating an `admin` stops here.
    if payload.role not in manageable_roles(user):
        raise forbidden("cannot_manage_role")
    # Credential rules live on AccountCreateIn's field types — Pydantic has
    # already rejected a bad payload before this handler runs.
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


# ── management (profile / password / disable / delete) ───────────────


def _manageable_account(db: Session, username: str, user: CurrentUser) -> Account:
    """Fetch an account and assert THIS caller may mutate it.

    404 `account_not_found` if it doesn't exist; 403 `cannot_manage_role`
    for anything outside the caller's permitted targets — doctors (use
    /doctors), the sys-admin singleton, and, for an admin caller, other
    admins. Centralised so every mutating endpoint enforces the same gate.
    """
    account = db.get(Account, username)
    if account is None:
        raise not_found("account_not_found")
    if account.role not in manageable_roles(user):
        raise forbidden("cannot_manage_role")
    return account


def _self_editable_account(db: Session, username: str, user: CurrentUser) -> Account:
    """Like `_manageable_account`, but also lets the signed-in sys-admin edit
    their OWN row (profile + password). The sys-admin is excluded from the
    roster and from `manageable_roles`, so without this it could never
    change its own password.

    Deliberately sys-admin only: admin self-service isn't part of this
    surface today, and widening it here would be an unrelated change.
    Disable / enable / delete keep the stricter `_manageable_account` gate
    so the ops account can never lock itself out.
    """
    account = db.get(Account, username)
    if account is None:
        raise not_found("account_not_found")
    if account.role in manageable_roles(user):
        return account
    if user.role == "sys-admin" and account.username == user.username:
        return account
    raise forbidden("cannot_manage_role")


def _row(account: Account, user: CurrentUser) -> AccountRow:
    return AccountRow(
        username=account.username,
        role=account.role,
        fullName=account.full_name,
        contact=account.contact,
        disabledAt=account.disabled_at,
        manageable=account.role in manageable_roles(user),
    )


class AccountUpdateIn(BaseModel):
    # Both optional and only applied when present (PATCH semantics): an
    # omitted field is left untouched; an explicit "" clears it to NULL.
    fullName: str | None = None
    contact: str | None = None


@router.patch("/{username}", response_model=AccountRow)
def update_account(
    username: str,
    payload: AccountUpdateIn,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(admin_or_sysadmin),
) -> AccountRow:
    """Edit an operating account's ops-managed profile (display name,
    contact); the sys-admin may also edit its own row. Username (the PK)
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
    return _row(account, user)


class PasswordResetIn(BaseModel):
    password: NewPassword


@router.post("/{username}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    username: str,
    payload: PasswordResetIn,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(admin_or_sysadmin),
) -> Response:
    """Set a new password for an operating account (handed to the user
    out-of-band — operating accounts carry no email for a reset link), or
    change the sys-admin's own password."""
    account = _self_editable_account(db, username, user)
    # Password rules enforced by PasswordResetIn.password's type.
    account.password = hash_password(payload.password)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{username}/disable", response_model=AccountRow)
def disable_account(
    username: str,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(admin_or_sysadmin),
) -> AccountRow:
    """Soft-disable an operating account — blocks /auth/login while
    preserving every record it created. Idempotent: disabling an already-
    disabled account leaves the original stamp untouched."""
    account = _manageable_account(db, username, user)
    if account.disabled_at is None:
        account.disabled_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(account)
    return _row(account, user)


@router.post("/{username}/enable", response_model=AccountRow)
def enable_account(
    username: str,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(admin_or_sysadmin),
) -> AccountRow:
    """Re-enable a disabled operating account. Idempotent."""
    account = _manageable_account(db, username, user)
    if account.disabled_at is not None:
        account.disabled_at = None
        db.commit()
        db.refresh(account)
    return _row(account, user)


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


@router.delete("/{username}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    username: str,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(admin_or_sysadmin),
) -> Response:
    """Hard-delete an operating account. Refuses (409 `account_in_use`) if
    the account is FK-referenced by data it created — disable it instead."""
    account = _manageable_account(db, username, user)
    if _account_is_referenced(db, username):
        raise conflict("account_in_use")
    db.delete(account)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
