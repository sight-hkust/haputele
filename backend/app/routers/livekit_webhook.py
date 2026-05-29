"""LiveKit webhook handler — auto-finishes meetings the healthworker forgot to end.

LiveKit Cloud POSTs lifecycle events here as a JSON-encoded `WebhookEvent`
proto, with a JWT signed by `LIVEKIT_API_SECRET` in the `Authorization`
header. We verify the signature with the SDK's `WebhookReceiver`, then act
only on `room_finished`:

  room name "appt-{id}" → if appointment.status == "in_progress",
                          flip to "awaiting_notes" (same transition as a
                          manual End Meeting click).

Idempotency: appointments past `in_progress` (awaiting_notes/completed/
cancelled) no-op cleanly. We always return 204 on accepted events so
LiveKit stops retrying. Other event types (room_started, participant_*,
track_*, …) are accepted and ignored — LiveKit doesn't let us filter
subscriptions, so we receive everything.

The endpoint is intentionally unauthenticated (no session cookie, no
CSRF) — LiveKit is the only valid caller and the JWT signature is the
only credential that matters. The setup gate whitelists this path so
webhook retries before first-run setup don't pile up as 409s.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, Request, Response
from livekit import api
from sqlalchemy.orm import Session

from ..config import settings
from ..deps import db_dep
from ..errors import unauthorized, unprocessable
from ..models import Appointment


_logger = logging.getLogger("haputele.livekit_webhook")

router = APIRouter(prefix="/livekit", tags=["livekit"])


_ROOM_PREFIX = "appt-"


def _appointment_id_from_room(room_name: str) -> int | None:
    if not room_name.startswith(_ROOM_PREFIX):
        return None
    try:
        return int(room_name[len(_ROOM_PREFIX):])
    except ValueError:
        return None


@router.post("/webhook")
async def livekit_webhook(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(db_dep),
) -> Response:
    if not (settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET):
        # Receiving a webhook when LiveKit isn't configured means the URL
        # leaked or someone is probing — refuse rather than no-op silently.
        raise unprocessable("livekit_not_configured")
    if not authorization:
        raise unauthorized("missing_authorization")

    body = (await request.body()).decode("utf-8")
    receiver = api.WebhookReceiver(
        api.TokenVerifier(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
    )
    try:
        event = receiver.receive(body, authorization)
    except Exception as exc:  # bad signature, expired, malformed, replay
        _logger.warning("livekit webhook rejected: %s", exc)
        raise unauthorized("invalid_webhook_signature")

    if event.event != "room_finished":
        return Response(status_code=204)  # accept-and-ignore everything else

    room_name = event.room.name if event.room else ""
    appt_id = _appointment_id_from_room(room_name)
    if appt_id is None:
        _logger.info("ignoring room_finished for unknown room name: %r", room_name)
        return Response(status_code=204)

    appt = db.get(Appointment, appt_id)
    if appt is None:
        _logger.info("room_finished for missing appointment %d", appt_id)
        return Response(status_code=204)

    if appt.status == "in_progress":
        appt.status = "awaiting_notes"
        db.commit()
        _logger.info(
            "appt %d auto-advanced in_progress → awaiting_notes via room_finished",
            appt_id,
        )
    else:
        # Already past in_progress (manual End Meeting beat us, or stale
        # retry). Not an error — webhook handlers must be idempotent.
        _logger.debug(
            "room_finished for appt %d in state %r — no-op", appt_id, appt.status
        )
    return Response(status_code=204)
