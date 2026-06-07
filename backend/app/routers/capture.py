"""Phone-as-camera capture sessions — QR-driven, token-authenticated uploads.

Two audiences share the `/capture` prefix:

  Desktop (logged-in operator, cookie + CSRF auth)
    POST   /capture/sessions            mint a session, get the raw token
    GET    /capture/sessions/{id}       poll status (no token echoed)
    GET    /capture/sessions/{id}/relay pull a parked rubber_stamp photo
    DELETE /capture/sessions/{id}       close early (QR stops working)

  Phone (whoever scanned the QR — the token IS the credential)
    GET    /capture/{token}             peek: what is this capture for?
    POST   /capture/{token}             upload a photo

The phone endpoints intentionally bypass the session/CSRF stack, exactly
like routers/doctor_onboarding.py: the scanner has no account and no
cookie, and the unguessable 32-byte token is the whole credential.

`purpose` decides what an upload becomes:
  appointment_attachment → committed straight to the appointment as an
      AppointmentAttachment (phone → server; never touches the desktop).
  rubber_stamp → parked in the session's relay slot for the desktop form
      to pull into its stamp editor (no destination record exists yet).

Route declaration order matters: the literal `/sessions…` routes are
declared before `/{token}` so a request to `/capture/sessions` can never
be mis-parsed as a token named "sessions" (real tokens never are).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..deps import CurrentUser, current_user, db_dep
from ..errors import conflict, forbidden, not_found, unprocessable
from ..models import Appointment, AppointmentAttachment
from ..schemas import (
    CaptureSessionCreateIn,
    CaptureSessionOut,
    CaptureSessionStatusOut,
    CapturePeekOut,
)
from ..services import capture
from ..services.storage import delete_object, get_bytes, object_key, put_bytes
# Reuse the exact validation surface the HW upload uses, so a photo that
# would be accepted via "Add photos" is accepted via the phone too.
from .attachments import ALLOWED_MIME, MAX_BYTES, WRITEABLE_STATES, _MIME_EXT


_logger = logging.getLogger("haputele.capture")

router = APIRouter(prefix="/capture", tags=["capture"])


# ── Desktop (authenticated) ───────────────────────────────────────────

@router.post(
    "/sessions",
    response_model=CaptureSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_capture_session(
    payload: CaptureSessionCreateIn,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> CaptureSessionOut:
    """Mint a capture session. Role + target are validated per purpose so a
    token can only ever do what the operator who minted it is allowed to do."""
    if payload.purpose == "appointment_attachment":
        # Mirror the HW-only write rule on attachments.
        if user.role != "healthworker":
            raise forbidden()
        if payload.appointmentId is None:
            raise unprocessable("appointment_required")
        appt = db.get(Appointment, payload.appointmentId)
        if appt is None:
            raise not_found("appointment_not_found")
        if appt.status not in WRITEABLE_STATES:
            raise conflict("invalid_state", currentStatus=appt.status)
        row, raw = capture.create_session(
            db,
            purpose=payload.purpose,
            created_by=user.username,
            appointment_id=payload.appointmentId,
        )
    else:  # rubber_stamp — used from the admin doctor form
        if user.role != "admin":
            raise forbidden()
        row, raw = capture.create_session(
            db, purpose=payload.purpose, created_by=user.username
        )

    _logger.info(
        "capture session created: id=%s purpose=%s by=%s",
        row.id, row.purpose, user.username,
    )
    return CaptureSessionOut(
        id=row.id, token=raw, purpose=row.purpose, expiresAt=row.expires_at
    )


@router.get("/sessions/{session_id}", response_model=CaptureSessionStatusOut)
def capture_session_status(
    session_id: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> CaptureSessionStatusOut:
    """Poll a session the caller owns. Never echoes the token."""
    session = capture.get_owned(db, session_id=session_id, username=user.username)
    now = datetime.now(timezone.utc)
    return CaptureSessionStatusOut(
        id=session.id,
        purpose=session.purpose,
        expiresAt=session.expires_at,
        closed=session.closed_at is not None or session.expires_at <= now,
        uploadCount=session.upload_count,
        relayReady=session.relay_object_key is not None,
    )


@router.get("/sessions/{session_id}/relay")
def pull_capture_relay(
    session_id: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> Response:
    """Pull the parked rubber_stamp photo into the desktop form, one-shot.

    Clears the relay slot on read so a re-poll won't re-deliver the same
    photo; the desktop loads the bytes into the stamp editor and then
    closes the session.
    """
    session = capture.get_owned(db, session_id=session_id, username=user.username)
    if session.purpose != "rubber_stamp" or not session.relay_object_key:
        raise not_found("capture_relay_empty")
    key = session.relay_object_key
    mime = session.relay_mime or "image/jpeg"
    data = get_bytes(key)
    session.relay_object_key = None
    session.relay_mime = None
    session.relay_uploaded_at = None
    db.commit()
    delete_object(key)  # best-effort; row no longer references it
    return Response(
        content=data,
        media_type=mime,
        headers={"Cache-Control": "no-store"},
    )


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def close_capture_session(
    session_id: int,
    db: Session = Depends(db_dep),
    user: CurrentUser = Depends(current_user),
) -> Response:
    """Close a session early so the QR stops working the moment the desktop
    modal is dismissed, rather than lingering until the TTL."""
    session = capture.get_owned(db, session_id=session_id, username=user.username)
    capture.close(db, session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Phone (token-authenticated, no session/CSRF) ──────────────────────

@router.get("/{token}", response_model=CapturePeekOut)
def peek_capture(token: str, db: Session = Depends(db_dep)) -> CapturePeekOut:
    """Validate the token and tell the phone page what it's capturing for.

    404 `capture_session_not_found` covers unknown / closed / expired —
    the page renders a generic "this link isn't active" screen.
    """
    session = capture.lookup_live(db, raw_token=token)
    return CapturePeekOut(purpose=session.purpose, expiresAt=session.expires_at)


@router.post("/{token}", status_code=status.HTTP_201_CREATED)
async def upload_capture(
    token: str,
    file: UploadFile = File(...),
    db: Session = Depends(db_dep),
) -> dict:
    """Accept a photo from the phone and route it by the session's purpose."""
    session = capture.lookup_live(db, raw_token=token)

    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME:
        raise unprocessable("attachment_unsupported_type", allowed=sorted(ALLOWED_MIME))
    blob = await file.read()
    if not blob:
        raise unprocessable("attachment_empty")
    if len(blob) > MAX_BYTES:
        raise unprocessable("attachment_too_large", max=MAX_BYTES)

    if session.purpose == "appointment_attachment":
        appt = db.get(Appointment, session.appointment_id)
        if appt is None or appt.status not in WRITEABLE_STATES:
            raise conflict(
                "invalid_state",
                currentStatus=(appt.status if appt else None),
            )
        key = object_key(f"attachments/{session.appointment_id}", _MIME_EXT[mime])
        await run_in_threadpool(put_bytes, key, blob, mime)
        row = AppointmentAttachment(
            appointment_id=session.appointment_id,
            mime_type=mime,
            filename=(file.filename or "phone-photo")[:255],
            object_key=key,
            byte_size=len(blob),
            caption=None,
            # Attribute to the operator who opened the session — the phone
            # holder is anonymous, and this keeps the audit trail meaningful.
            uploaded_by=session.created_by,
        )
        db.add(row)
        session.upload_count += 1
        db.commit()
        return {"ok": True, "purpose": session.purpose}

    # rubber_stamp relay: park the latest photo, replacing any prior one.
    old_key = session.relay_object_key
    key = object_key("capture/relay", _MIME_EXT[mime])
    await run_in_threadpool(put_bytes, key, blob, mime)
    session.relay_object_key = key
    session.relay_mime = mime
    session.relay_uploaded_at = datetime.now(timezone.utc)
    session.upload_count += 1
    db.commit()
    if old_key:
        delete_object(old_key)
    return {"ok": True, "purpose": session.purpose}
