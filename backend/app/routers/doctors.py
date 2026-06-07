import base64
import logging
import secrets

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from datetime import datetime, timezone

from ..config import settings
from ..deps import CurrentUser, db_dep, require_role
from ..errors import conflict, not_found, unprocessable
from ..models import Account, Doctor, DoctorInvite
from ..schemas import (
    DoctorCreate,
    DoctorDetailOut,
    DoctorInviteCreate,
    DoctorOut,
    DoctorRejectIn,
    DoctorSummaryOut,
    DoctorUpdate,
)
from ..security import hash_password
from ..services import doctor_invites as invites
from ..services.email import is_configured as email_configured, send_templated
from ..services.signature import decode_rubber_stamp
from ..services.storage import delete_object, get_bytes, object_key, put_bytes


def _doctors_with_live_invite(db: Session, doctor_ids: list[int]) -> set[int]:
    """Single query: which of these doctor_ids have a live unconsumed invite?

    A "live" invite is `consumed_at IS NULL AND expires_at > NOW()`. Used by
    list_doctors to compute onboardingStatus without N+1, and by the detail
    endpoint as a degenerate single-element case.
    """
    if not doctor_ids:
        return set()
    rows = db.scalars(
        select(DoctorInvite.doctor_id)
        .where(
            DoctorInvite.doctor_id.in_(doctor_ids),
            DoctorInvite.consumed_at.is_(None),
            DoctorInvite.expires_at > datetime.now(timezone.utc),
        )
        .distinct()
    ).all()
    return set(rows)


def _onboarding_status(doctor: Doctor, *, has_live_invite: bool) -> str:
    """Resolve the 4-way status from Doctor row state + invite liveness.

    Priority (top wins): rejected > awaiting_setup (live invite + no row-
    completion) > awaiting_approval (row exists but unapproved) > active.

    Note: a doctor in the new-doctor flow has `approved_at IS NULL` AND
    has consumed their invite by the time we look. A doctor in the
    rotation flow has `approved_at` populated (backfilled by 0010 for
    pre-existing rows, or set by the legacy POST /doctors path which
    auto-approves).
    """
    if doctor.rejected_at is not None:
        return "rejected"
    if has_live_invite:
        return "awaiting_setup"
    if doctor.approved_at is None:
        return "awaiting_approval"
    return "active"


def _attach_status(out: DoctorOut, doctor: Doctor, *, has_live_invite: bool) -> DoctorOut:
    out.onboardingStatus = _onboarding_status(doctor, has_live_invite=has_live_invite)
    return out


_logger = logging.getLogger("haputele.doctors")


router = APIRouter(prefix="/doctors", tags=["doctors"])

REQUIRED_PRESCRIPTION_FIELDS = (
    "slmcRegistrationNumber",
    "qualifications",
    "practitionerAddress",
    "instituteContact",
    "rubberStampImage",
)


def _sniff_stamp(data: bytes) -> tuple[str, str]:
    """(mime, ext) from magic bytes — PNG/JPEG only, matching the uploader's
    accept list. Anything else is treated as PNG (browsers infer from the
    actual bytes regardless of the hint)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    return "image/png", "png"


def _encode_stamp(data: bytes | None) -> str | None:
    """Bytes → `data:image/<mime>;base64,...` for re-display on the edit page."""
    if not data:
        return None
    mime, _ = _sniff_stamp(data)
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


@router.post("", response_model=DoctorOut, status_code=status.HTTP_201_CREATED)
def create_doctor(
    payload: DoctorCreate,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(require_role("admin", "sys-admin")),
) -> DoctorOut:
    """Legacy admin-fills-everything path. Two sub-modes by `password`:

      password set    → admin types the password and shares it offline.
      password absent → password-rotation invite goes out to the doctor's
                        email so they can pick a password without admin
                        ever seeing it. Requires email_configured().

    Doctor is auto-approved on this path — the admin typed every field
    themselves so there's nothing to review. For the "doctor fills
    everything" path use POST /doctors/invites instead.
    """
    missing = [f for f in REQUIRED_PRESCRIPTION_FIELDS if not getattr(payload, f, None)]
    if missing:
        raise unprocessable("missing_prescription_fields", missing=missing)

    if db.get(Account, payload.username):
        raise unprocessable("username_taken")

    invite_mode = not payload.password
    if invite_mode and not email_configured():
        raise unprocessable("email_not_configured")

    # Normalise the email so the case-insensitive uniqueness checks (and
    # the partial unique index) see a consistent value regardless of how
    # the admin typed it.
    email = payload.email.strip().lower()
    # Block reuse of a *live* email up front with a friendly 409 rather
    # than letting the partial unique index surface a raw IntegrityError.
    if db.scalar(
        select(Doctor).where(
            func.lower(Doctor.email) == email, Doctor.rejected_at.is_(None)
        )
    ):
        raise conflict("email_already_used")

    stamp = decode_rubber_stamp(payload.rubberStampImage)
    mime, ext = _sniff_stamp(stamp)
    stamp_key = object_key("doctors/stamps", ext)
    put_bytes(stamp_key, stamp, mime)

    # In invite mode, generate a random password that's effectively
    # un-guessable. The doctor will replace it via the onboarding flow;
    # the value never leaves this function (no log, no return).
    initial_password = payload.password or secrets.token_urlsafe(48)

    account = Account(
        username=payload.username,
        password=hash_password(initial_password),
        role="doctor",
    )
    now = datetime.now(timezone.utc)
    doctor = Doctor(
        username=payload.username,
        given_name=payload.givenName,
        family_name=payload.familyName,
        contact=payload.contact,
        email=email,
        slmc_registration_number=payload.slmcRegistrationNumber,
        qualifications=payload.qualifications,
        practitioner_address=payload.practitionerAddress,
        institute_name=payload.instituteName,
        institute_contact=payload.instituteContact,
        rubber_stamp_key=stamp_key,
        active=True,
        created_at=now,
        # Legacy path is auto-approved — admin typed every field, there's
        # nothing to review. Record who did it for the audit trail.
        approved_at=now,
        approved_by=user.username,
    )
    db.add(account)
    db.add(doctor)
    db.commit()
    db.refresh(doctor)

    if invite_mode:
        _send_invite(db, doctor)

    out = DoctorOut.model_validate(doctor)
    return _attach_status(out, doctor, has_live_invite=invite_mode)


@router.post("/{doctor_id}/invites", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(require_role("admin", "sys-admin"))])
def reissue_invite(doctor_id: int, db: Session = Depends(db_dep)) -> Response:
    """Issue a fresh password-rotation invite for an existing doctor.

    Used when the original link expired, was lost, or the doctor's email
    address has been corrected. Any prior live invite for the same
    doctor is revoked inside `invites.issue_rotation()`.
    """
    if not email_configured():
        raise unprocessable("email_not_configured")
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise not_found("doctor_not_found")
    _send_invite(db, doctor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/invites", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role("admin", "sys-admin"))])
def invite_new_doctor(
    payload: DoctorInviteCreate, db: Session = Depends(db_dep),
) -> dict:
    """Email-only invite: admin types just the doctor's email, the
    doctor fills out their full profile via the onboarding link.

    The Doctor row is NOT created here — it springs into existence when
    the doctor consumes the invite. The admin then sees it in their
    "awaiting approval" queue and approves or rejects.

    Refuses (409 `email_already_used`) if the address is already in use
    by an existing doctor or has a separate live invite.
    """
    if not email_configured():
        raise unprocessable("email_not_configured")
    invite, raw_token = invites.issue_new_doctor(
        db, email=payload.email, family_name=payload.familyName,
    )
    _send_new_doctor_invite(db, invite, raw_token)
    return {"inviteId": invite.id, "email": invite.email}


def _send_new_doctor_invite(db: Session, invite: DoctorInvite, raw_token: str) -> None:
    """Dispatch a new-doctor (full-profile) invite email. Best-effort: a
    Resend failure is logged but doesn't raise — the invite row already
    exists and can be re-sent."""
    link = invites.build_invite_link(raw_token)
    try:
        msg_id = send_templated(
            db,
            to=invite.email,
            subject="You're invited to HapuTele",
            template="doctor_invite",
            context={
                "mode": "new",
                # Hint only — may be None. The template falls back to
                # "Hi there," when absent.
                "family_name": invite.family_name,
                "link": link,
                "expires_hours": int(
                    (invite.expires_at - invite.created_at).total_seconds() // 3600
                ),
            },
            tags={"kind": "doctor.invite.new", "invite_id": str(invite.id)},
        )
        _logger.info(
            "new-doctor invite sent: email=%s invite_id=%s msg_id=%s",
            invite.email, invite.id, msg_id,
        )
    except Exception:
        _logger.exception(
            "new-doctor invite email failed (invite row %s still issued): email=%s",
            invite.id, invite.email,
        )


@router.post("/{doctor_id}/approve", response_model=DoctorOut)
def approve_doctor(
    doctor_id: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(require_role("admin", "sys-admin")),
) -> DoctorOut:
    """Approve a self-onboarded doctor. Idempotent — re-calling after
    approval is a no-op that still returns the current state.

    A rejected row is a tombstone and can't be approved (409
    `doctor_rejected`); to give a rejected doctor another chance, invite
    them to reapply (POST /{id}/reinvite-reapply), which produces a fresh
    submission rather than resurrecting the rejected one."""
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise not_found("doctor_not_found")
    if doctor.rejected_at is not None:
        raise conflict("doctor_rejected")
    # Only send the notification email on the actual NULL→approved
    # transition. Repeat approval calls are no-ops at the DB level AND
    # at the email level, so a fat-fingered double-click doesn't ping
    # the doctor twice.
    just_approved = doctor.approved_at is None
    if just_approved:
        doctor.approved_at = datetime.now(timezone.utc)
        doctor.approved_by = user.username
        db.commit()
        db.refresh(doctor)
        _send_approval_notification(db, doctor)
    _logger.info("doctor approved: id=%s username=%s", doctor_id, doctor.username)
    out = DoctorOut.model_validate(doctor)
    has_live = doctor.doctor_id in _doctors_with_live_invite(db, [doctor.doctor_id])
    return _attach_status(out, doctor, has_live_invite=has_live)


def _send_approval_notification(db: Session, doctor: Doctor) -> None:
    """Dispatch the "your account is ready" email. Best-effort: a Resend
    failure here is logged but does NOT roll back the approval. The
    admin sees the doctor as approved either way; the doctor either gets
    the email or (worst case) finds out the next time they try to log in.

    Skipped silently if the email service isn't configured — the admin
    is still in the loop and can tell the doctor by other means.
    """
    if not email_configured():
        _logger.info(
            "approval email skipped (email_not_configured): doctor_id=%s",
            doctor.doctor_id,
        )
        return
    login_link = f"{settings.FRONTEND_BASE_URL or ''}/login"
    try:
        msg_id = send_templated(
            db,
            to=doctor.email,
            subject="Your HapuTele account is approved",
            template="doctor_approved",
            context={
                "family_name": doctor.family_name,
                "login_link": login_link,
            },
            tags={"kind": "doctor.approved", "doctor_id": str(doctor.doctor_id)},
            # Same approval can't be triggered twice (NULL→ts is the
            # state change we guard on), but pass an idempotency key
            # anyway for symmetry with the invite path. If approval is
            # ever moved to an at-least-once delivery (job queue), the
            # key remains the right uniqueness token at Resend.
            idempotency_key=f"doctor.approved:doctor-{doctor.doctor_id}",
        )
        _logger.info(
            "doctor approval email sent: doctor_id=%s msg_id=%s",
            doctor.doctor_id, msg_id,
        )
    except Exception:
        _logger.exception(
            "doctor approval email failed (doctor still approved): doctor_id=%s",
            doctor.doctor_id,
        )


@router.post("/{doctor_id}/reject", response_model=DoctorOut)
def reject_doctor(
    doctor_id: int,
    payload: DoctorRejectIn,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(require_role("admin", "sys-admin")),
) -> DoctorOut:
    """Reject a self-onboarded doctor. Stamps rejected_at +
    rejected_reason and deactivates so they can't log in.

    Refuses (409 `doctor_already_approved`) if the doctor is already
    approved — admin should deactivate via the normal DELETE path instead
    so the audit trail stays clean ("rejected" specifically means the
    onboarding submission was bad).
    """
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise not_found("doctor_not_found")
    if doctor.approved_at is not None:
        raise conflict("doctor_already_approved")
    doctor.rejected_at = datetime.now(timezone.utc)
    doctor.rejected_by = user.username
    doctor.rejected_reason = (payload.reason or "").strip() or None
    doctor.active = False
    db.commit()
    db.refresh(doctor)
    _logger.info(
        "doctor rejected: id=%s username=%s reason=%r",
        doctor_id, doctor.username, doctor.rejected_reason,
    )
    out = DoctorOut.model_validate(doctor)
    has_live = doctor.doctor_id in _doctors_with_live_invite(db, [doctor.doctor_id])
    return _attach_status(out, doctor, has_live_invite=has_live)


@router.post("/{doctor_id}/reinvite-reapply", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role("admin", "sys-admin"))])
def reinvite_reapply(doctor_id: int, db: Session = Depends(db_dep)) -> dict:
    """Invite a previously-rejected doctor to reapply with a fresh
    submission.

    Issues a *new-doctor* invite (full profile form) to the rejected
    doctor's email. The rejected row stays as an immutable audit record;
    consuming the invite creates a brand-new Doctor row that links back to
    it via previous_doctor_id. This replaces the old "clear rejected_at on
    the same row" hack so the history of attempts is preserved.

    Refuses (409 `doctor_not_rejected`) for any doctor that isn't in the
    rejected state — reapplication only makes sense from a rejection.
    """
    if not email_configured():
        raise unprocessable("email_not_configured")
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise not_found("doctor_not_found")
    if doctor.rejected_at is None:
        raise conflict("doctor_not_rejected")
    # issue_new_doctor re-checks that no *live* doctor holds this email —
    # the rejected row we're reapplying from doesn't count, so this passes.
    invite, raw_token = invites.issue_new_doctor(
        db, email=doctor.email, family_name=doctor.family_name,
    )
    _send_new_doctor_invite(db, invite, raw_token)
    _logger.info(
        "reapply invite sent for rejected doctor: id=%s email=%s invite_id=%s",
        doctor_id, doctor.email, invite.id,
    )
    return {"inviteId": invite.id, "email": invite.email}


def _send_invite(db: Session, doctor: Doctor) -> None:
    """Issue an invite row and dispatch the email. Logs but doesn't raise
    on Resend failure — the admin has already gotten a 201 for the
    create, and the invite row exists for re-send."""
    invite, raw_token = invites.issue_rotation(db, doctor_id=doctor.doctor_id)
    link = invites.build_invite_link(raw_token)
    try:
        msg_id = send_templated(
            db,
            to=doctor.email,
            subject="Set your password",
            template="doctor_invite",
            context={
                "mode": "rotation",
                "family_name": doctor.family_name,
                "link": link,
                "expires_hours": int(
                    (invite.expires_at - invite.created_at).total_seconds() // 3600
                ),
            },
            tags={"kind": "doctor.invite", "doctor_id": str(doctor.doctor_id)},
        )
        _logger.info(
            "doctor invite sent: doctor_id=%s email=%s msg_id=%s",
            doctor.doctor_id, doctor.email, msg_id,
        )
    except Exception:
        _logger.exception(
            "doctor invite email failed (invite row %s still issued): doctor_id=%s",
            invite.id, doctor.doctor_id,
        )


_ONBOARDING_STATUSES = frozenset(
    {"awaiting_approval", "awaiting_setup", "active", "rejected"}
)


@router.get("", response_model=list[DoctorOut])
def list_doctors(
    active: bool | None = None,
    status: str | None = None,
    db: Session = Depends(db_dep),
    user=Depends(require_role("admin", "doctor", "healthworker", "sys-admin")),
):
    """List doctors, newest submission first.

    `status` filters by the computed onboarding status (admin-only buckets
    awaiting_approval / awaiting_setup / rejected are meaningless for the
    other roles, which only ever see approved doctors). Because
    awaiting_setup depends on invite liveness — not a column — the status
    filter is applied after the per-row computation rather than in SQL.
    """
    if status is not None and status not in _ONBOARDING_STATUSES:
        raise unprocessable("invalid_status", allowed=sorted(_ONBOARDING_STATUSES))

    stmt = select(Doctor)
    if active is not None:
        stmt = stmt.where(Doctor.active.is_(active))
    # Healthworkers (booking flow) and doctors (browsing colleagues) only
    # ever see approved, non-rejected doctors. Admins and the ops sys-admin
    # see everyone, including awaiting_approval and rejected entries, so
    # they can act on them.
    if user.role not in ("admin", "sys-admin"):
        stmt = stmt.where(
            Doctor.approved_at.is_not(None),
            Doctor.rejected_at.is_(None),
        )
    # Newest submission first so the approval queue surfaces fresh
    # submissions at the top; doctor_id as a stable tiebreaker.
    rows = db.scalars(
        stmt.order_by(Doctor.created_at.desc(), Doctor.doctor_id.desc())
    ).all()
    # Two queries total: the doctor list, then a single batched lookup of
    # "which of these have a live invite". O(1) regardless of doctor count.
    awaiting_ids = _doctors_with_live_invite(db, [r.doctor_id for r in rows])
    out = [
        _attach_status(
            DoctorOut.model_validate(r), r, has_live_invite=r.doctor_id in awaiting_ids,
        )
        for r in rows
    ]
    if status is not None:
        out = [d for d in out if d.onboardingStatus == status]
    return out


@router.get("/summary", response_model=DoctorSummaryOut,
            dependencies=[Depends(require_role("admin", "sys-admin"))])
def doctor_summary(db: Session = Depends(db_dep)) -> DoctorSummaryOut:
    """Per-status counts for the admin queue's tab badges.

    Same two-query shape as the list endpoint: all rows + the batched
    live-invite lookup. Doctor counts are modest (one clinic's roster),
    so materialising rows to compute status in Python is cheaper than the
    SQL gymnastics the invite-liveness join would need.
    """
    rows = db.scalars(select(Doctor)).all()
    awaiting_ids = _doctors_with_live_invite(db, [r.doctor_id for r in rows])
    summary = DoctorSummaryOut(total=len(rows))
    for r in rows:
        st = _onboarding_status(r, has_live_invite=r.doctor_id in awaiting_ids)
        if st == "awaiting_approval":
            summary.awaitingApproval += 1
        elif st == "awaiting_setup":
            summary.awaitingSetup += 1
        elif st == "rejected":
            summary.rejected += 1
        else:
            summary.active += 1
    return summary


@router.get("/{doctor_id}", response_model=DoctorDetailOut,
            dependencies=[Depends(require_role("admin", "doctor", "healthworker", "sys-admin"))])
def get_doctor(doctor_id: int, db: Session = Depends(db_dep)) -> DoctorDetailOut:
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise not_found("doctor_not_found")
    out = DoctorDetailOut.model_validate(doctor)
    out.rubberStampImage = _encode_stamp(get_bytes(doctor.rubber_stamp_key))
    has_live = doctor.doctor_id in _doctors_with_live_invite(db, [doctor.doctor_id])
    return _attach_status(out, doctor, has_live_invite=has_live)


@router.patch("/{doctor_id}", response_model=DoctorOut,
              dependencies=[Depends(require_role("admin", "sys-admin"))])
def update_doctor(doctor_id: int, payload: DoctorUpdate, db: Session = Depends(db_dep)) -> DoctorOut:
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise not_found("doctor_not_found")

    field_map = {
        "givenName": "given_name",
        "familyName": "family_name",
        "contact": "contact",
        "email": "email",
        "slmcRegistrationNumber": "slmc_registration_number",
        "qualifications": "qualifications",
        "practitionerAddress": "practitioner_address",
        "instituteName": "institute_name",
        "instituteContact": "institute_contact",
        "active": "active",
    }
    data = payload.model_dump(exclude_unset=True)

    superseded_key: str | None = None
    if "rubberStampImage" in data and data["rubberStampImage"] is not None:
        stamp = decode_rubber_stamp(data.pop("rubberStampImage"))
        mime, ext = _sniff_stamp(stamp)
        new_key = object_key("doctors/stamps", ext)
        put_bytes(new_key, stamp, mime)
        superseded_key = doctor.rubber_stamp_key
        doctor.rubber_stamp_key = new_key
    else:
        data.pop("rubberStampImage", None)

    if "password" in data and data["password"]:
        account = db.get(Account, doctor.username)
        if account:
            account.password = hash_password(data.pop("password"))
    else:
        data.pop("password", None)

    for k, v in data.items():
        col = field_map.get(k)
        if col is not None:
            setattr(doctor, col, v)

    db.commit()
    db.refresh(doctor)
    # Drop the superseded object only once the new key is committed — a failed
    # commit rolls back to old_key, so we must not delete it pre-commit.
    if superseded_key:
        delete_object(superseded_key)
    out = DoctorOut.model_validate(doctor)
    has_live = doctor.doctor_id in _doctors_with_live_invite(db, [doctor.doctor_id])
    return _attach_status(out, doctor, has_live_invite=has_live)


@router.delete("/{doctor_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role("admin", "sys-admin"))])
def delete_doctor(doctor_id: int, db: Session = Depends(db_dep)):
    # Soft delete — preserve FK references on past appointments/consultations.
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise not_found("doctor_not_found")
    doctor.active = False
    db.commit()
    return None


@router.delete("/{doctor_id}/purge", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role("admin", "sys-admin"))])
def purge_doctor(doctor_id: int, db: Session = Depends(db_dep)):
    """Hard-delete a *rejected* doctor record — the right-to-erasure path.

    Removes the Doctor row (cascading its invites), the backing Account,
    and the rubber-stamp object in S3. Restricted to rejected doctors
    (409 `doctor_not_rejected` otherwise) so it can never be used to wipe
    an active doctor with real clinical history; deactivation (soft
    delete) remains the path for those. Any later reapplication row that
    pointed here via previous_doctor_id is detached (FK ON DELETE SET NULL)
    rather than blocked.
    """
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise not_found("doctor_not_found")
    if doctor.rejected_at is None:
        raise conflict("doctor_not_rejected")

    stamp_key = doctor.rubber_stamp_key
    username = doctor.username
    # Deleting the account cascades to the doctor (doctor.username FK is
    # ON DELETE CASCADE), which in turn cascades to doctor_invites — one
    # ORM delete, no double-delete warning. Fall back to deleting the
    # doctor directly in the (shouldn't-happen) case the account is gone.
    account = db.get(Account, username)
    if account is not None:
        db.delete(account)
    else:
        db.delete(doctor)
    db.commit()
    # Best-effort object cleanup once the row is gone. A storage failure
    # here leaves an orphan object (harmless) but mustn't fail the purge.
    if stamp_key:
        try:
            delete_object(stamp_key)
        except Exception:
            _logger.exception("stamp object delete failed during purge: key=%s", stamp_key)
    _logger.info("doctor purged: id=%s username=%s", doctor_id, username)
    return None
