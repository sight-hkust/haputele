"""Resend webhook handler — maintains the email suppression list.

Resend POSTs delivery events (`email.delivered`, `email.bounced`,
`email.complained`, `email.opened`, …) signed with Svix. We verify
the signature with the Svix SDK, then act on the two events that
affect future sends:

  email.bounced (type == "hard")  → suppress the address
  email.complained                → suppress the address

Soft bounces are ignored — they're typically transient mailbox-full
/ greylisting. Other events (delivered, opened, clicked) we accept
and log so the request gets a 204 and Resend stops retrying.

The endpoint is intentionally unauthenticated (no session cookie,
no CSRF) — Resend is the only valid caller and the Svix signature
is the only credential that matters. The setup gate whitelists
`/resend/webhook` so retries before first-run setup don't pile up
as 409s.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy.orm import Session
from svix.webhooks import Webhook, WebhookVerificationError

from ..config import settings
from ..deps import db_dep
from ..errors import unauthorized, unprocessable
from ..services.email import suppress


_logger = logging.getLogger("haputele.resend_webhook")

router = APIRouter(prefix="/resend", tags=["resend"])


@router.post("/webhook")
async def resend_webhook(
    request: Request,
    svix_id: str | None = Header(default=None, alias="svix-id"),
    svix_timestamp: str | None = Header(default=None, alias="svix-timestamp"),
    svix_signature: str | None = Header(default=None, alias="svix-signature"),
    db: Session = Depends(db_dep),
) -> Response:
    if not settings.RESEND_WEBHOOK_SECRET:
        # Receiving a webhook with no configured secret means either the
        # URL leaked or an operator forgot to set the secret — refuse
        # rather than no-op silently and have events disappear.
        raise unprocessable("resend_webhook_not_configured")
    if not (svix_id and svix_timestamp and svix_signature):
        raise unauthorized("missing_svix_headers")

    body = await request.body()
    headers = {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
    }
    try:
        wh = Webhook(settings.RESEND_WEBHOOK_SECRET)
        wh.verify(body, headers)
    except WebhookVerificationError as exc:
        _logger.warning("resend webhook rejected: %s", exc)
        raise unauthorized("invalid_webhook_signature")

    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        # Signature was valid but body isn't JSON — shouldn't happen,
        # but ack with 204 so Resend stops retrying a broken event.
        _logger.warning("resend webhook: signature ok but body not JSON")
        return Response(status_code=204)

    event_type = payload.get("type") or ""
    data = payload.get("data") or {}

    if event_type == "email.bounced":
        # `bounce.type` is "hard" | "soft" | "undetermined". Only hard
        # bounces are suppressed — soft bounces (mailbox full, temp DNS
        # failure) often recover and aren't worth permanent blocklisting.
        bounce_type = (data.get("bounce") or {}).get("type", "")
        if bounce_type == "hard":
            for addr in _recipients(data):
                suppress(
                    db,
                    email=addr,
                    reason="bounced.hard",
                    detail={"bounce": data.get("bounce") or {}},
                )
        else:
            _logger.info("resend bounce ignored (type=%r)", bounce_type)
    elif event_type == "email.complained":
        for addr in _recipients(data):
            suppress(db, email=addr, reason="complained", detail={})
    else:
        _logger.debug("resend event accepted-and-ignored: %s", event_type)

    return Response(status_code=204)


def _recipients(data: dict) -> list[str]:
    """Pull recipient addresses out of a Resend event payload.

    Resend's event `data.to` is a list of strings; older payloads or
    edge events sometimes use a bare string — accept both so a schema
    drift doesn't silently break suppression.
    """
    to = data.get("to")
    if isinstance(to, str):
        return [to]
    if isinstance(to, list):
        return [t for t in to if isinstance(t, str)]
    return []
