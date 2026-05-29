"""HW-uploaded photos for an appointment — FEEDBACK §3.

Bytes live in S3 (`appointment_attachments.object_key` holds the key); the
row carries metadata only. The list endpoint returns metadata; clients fetch
each blob through the singular GET, which proxies the bytes from S3 so they
stay behind this router's auth. Doctors can read attachments on their own
appointments but cannot upload or delete (HW-only writes, doctors are
read-only consumers).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import CurrentUser, current_user, db_dep, require_role
from ..errors import conflict, forbidden, not_found, unprocessable
from ..models import Appointment, AppointmentAttachment, Doctor
from ..schemas import AppointmentDetailOut, AttachmentMetaOut, AttachmentUpdateIn
from ..services.storage import delete_object, get_bytes, object_key, put_bytes


router = APIRouter(prefix="/appointments", tags=["attachments"])


ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB per attachment

# Extension for the S3 key — cosmetic (the key is opaque), but keeps objects
# recognisable when browsing the bucket. Mirrors ALLOWED_MIME.
_MIME_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

WRITEABLE_STATES = (
    "scheduled",
    "consent_pending",
    "data_collection",
    "in_progress",
    "awaiting_notes",
)


def _appt(db: Session, aid: int) -> Appointment:
    a = db.get(Appointment, aid)
    if not a:
        raise not_found("appointment_not_found")
    return a


def _scope_read(db: Session, appt: Appointment, user: CurrentUser) -> None:
    if user.role == "doctor":
        d = db.scalar(select(Doctor).where(Doctor.username == user.username))
        if not d or d.doctor_id != appt.doctor_id:
            raise forbidden("not_your_appointment")
    elif user.role not in ("admin", "healthworker"):
        raise forbidden()


def _attachment(db: Session, appt_id: int, attachment_id: int) -> AppointmentAttachment:
    row = db.get(AppointmentAttachment, attachment_id)
    if not row or row.appointment_id != appt_id:
        raise not_found("attachment_not_found")
    return row


@router.post(
    "/{appt_id}/attachments",
    response_model=AttachmentMetaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("healthworker"))],
)
async def upload_attachment(
    appt_id: int,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> AttachmentMetaOut:
    appt = _appt(db, appt_id)
    if appt.status not in WRITEABLE_STATES:
        raise conflict("invalid_state", currentStatus=appt.status)

    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME:
        raise unprocessable(
            "attachment_unsupported_type",
            allowed=sorted(ALLOWED_MIME),
        )

    blob = await file.read()
    if not blob:
        raise unprocessable("attachment_empty")
    if len(blob) > MAX_BYTES:
        raise unprocessable("attachment_too_large", max=MAX_BYTES)

    # Upload to S3 before the insert: a failed upload raises here, leaving no
    # dangling row. boto3 is sync, so offload it off the event loop.
    key = object_key(f"attachments/{appt_id}", _MIME_EXT[mime])
    await run_in_threadpool(put_bytes, key, blob, mime)

    row = AppointmentAttachment(
        appointment_id=appt_id,
        mime_type=mime,
        filename=(file.filename or "upload")[:255],
        object_key=key,
        byte_size=len(blob),
        caption=(caption or None),
        uploaded_by=user.username,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AttachmentMetaOut.model_validate(row)


@router.get("/{appt_id}/attachments", response_model=list[AttachmentMetaOut])
def list_attachments(
    appt_id: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> list[AttachmentMetaOut]:
    appt = _appt(db, appt_id)
    _scope_read(db, appt, user)
    rows = db.scalars(
        select(AppointmentAttachment)
        .where(AppointmentAttachment.appointment_id == appt_id)
        .order_by(AppointmentAttachment.uploaded_at)
    ).all()
    return [AttachmentMetaOut.model_validate(r) for r in rows]


@router.get("/{appt_id}/attachments/{attachment_id}")
def stream_attachment(
    appt_id: int,
    attachment_id: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> Response:
    appt = _appt(db, appt_id)
    _scope_read(db, appt, user)
    row = _attachment(db, appt_id, attachment_id)
    # Proxy the bytes from S3 (sync endpoint → boto3 call is fine here; FastAPI
    # runs sync routes in a threadpool). Keeps PII behind this route's auth.
    data = get_bytes(row.object_key)
    return Response(
        content=data,
        media_type=row.mime_type,
        headers={
            # `inline` so the browser renders it directly in an <img>/iframe;
            # the doctor view shows thumbnails by pointing <img src> at this URL.
            "Content-Disposition": f'inline; filename="{row.filename}"',
            "Cache-Control": "private, max-age=300",
        },
    )


@router.patch(
    "/{appt_id}/attachments/{attachment_id}",
    response_model=AttachmentMetaOut,
    dependencies=[Depends(require_role("healthworker"))],
)
def update_attachment(
    appt_id: int,
    attachment_id: int,
    payload: AttachmentUpdateIn,
    db: Session = Depends(db_dep),
) -> AttachmentMetaOut:
    appt = _appt(db, appt_id)
    if appt.status in ("completed", "cancelled"):
        raise conflict("invalid_state", currentStatus=appt.status)
    row = _attachment(db, appt_id, attachment_id)
    if payload.caption is not None:
        row.caption = payload.caption or None
    db.commit()
    db.refresh(row)
    return AttachmentMetaOut.model_validate(row)


@router.delete(
    "/{appt_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_role("healthworker"))],
)
def delete_attachment(
    appt_id: int,
    attachment_id: int,
    db: Session = Depends(db_dep),
) -> Response:
    appt = _appt(db, appt_id)
    if appt.status in ("completed", "cancelled"):
        raise conflict("invalid_state", currentStatus=appt.status)
    row = _attachment(db, appt_id, attachment_id)
    key = row.object_key
    db.delete(row)
    db.commit()
    # Best-effort: the row (source of truth) is gone; an orphaned object is
    # harmless and reclaimable. Done after commit so a delete failure here
    # can't roll back the row removal.
    delete_object(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Re-export so AppointmentDetailOut consumers can import the schema
# without pulling the whole attachments router.
__all__ = ["router", "AppointmentDetailOut"]
