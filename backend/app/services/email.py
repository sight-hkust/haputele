"""Resend transactional email service.

Same shape as services/livekit.py: thin wrapper around the vendor SDK,
fails loudly with a 422 when not configured so callers can branch on
the standard error envelope. There is no fallback transport — if
RESEND_API_KEY is empty we treat the system as "email disabled" and
let callers decide whether that's an error or a soft-skip.

Configuration states:

    RESEND_API_KEY="" → is_configured() == False.
        send_email() raises 422 email_not_configured. Tests and dev
        environments without a Resend account hit this branch.

    RESEND_API_KEY=set, RESEND_FROM=onboarding@resend.dev → dev mode.
        Resend will only deliver to the email registered on the
        account; everything else is silently dropped on their side.
        We don't enforce that here — operators flipping to a real
        FROM = the only correct step.

    RESEND_API_KEY=set, RESEND_FROM=verified domain → prod mode.

Suppression: every send_email() call first checks email_suppressions.
Addresses recorded there (by the webhook handler on hard bounce /
complaint) are skipped silently and the function returns `None`.
Callers wanting send-or-fail semantics for critical mail (password
reset) should check the return value.
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Iterable

import resend
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..errors import unprocessable
from ..models import EmailSuppression


_logger = logging.getLogger("haputele.email")


# Jinja2 environment, configured once at import time. StrictUndefined turns
# typos in template variables into immediate exceptions instead of silently
# rendering blanks — easier to catch in tests than in production. Autoescape
# is on for .html only; .txt templates render literally.
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"
_jinja = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "htm"]),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


def is_configured() -> bool:
    return bool(settings.RESEND_API_KEY and settings.RESEND_FROM)


def _normalize(addr: str) -> str:
    return addr.strip().lower()


_TAG_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")


def _sanitize_tag(value: str) -> str:
    """Replace characters Resend's tag validator rejects with underscores."""
    return "".join(c if c in _TAG_ALLOWED else "_" for c in str(value))


def _filter_suppressed(db: Session, addresses: Iterable[str]) -> tuple[list[str], list[str]]:
    """Split `addresses` into (sendable, suppressed). Both lowercased."""
    lowered = [_normalize(a) for a in addresses if a]
    if not lowered:
        return [], []
    rows = db.execute(
        select(EmailSuppression.email).where(EmailSuppression.email.in_(lowered))
    ).all()
    suppressed = {r[0] for r in rows}
    sendable = [a for a in lowered if a not in suppressed]
    return sendable, sorted(suppressed)


def send_email(
    db: Session,
    *,
    to: str | list[str],
    subject: str,
    html: str,
    text: str | None = None,
    tags: dict[str, str] | None = None,
    scheduled_at: "datetime | None" = None,
    idempotency_key: str | None = None,
) -> str | None:
    """Send a transactional email via Resend.

    Returns the Resend message id on success, or `None` if every
    requested recipient was on the suppression list (the call was a
    no-op). Raises 422 `email_not_configured` if RESEND_API_KEY or
    RESEND_FROM are unset.

    Optional parameters:

      scheduled_at: datetime in any timezone. Resend holds the email
        until this moment. Up to 30 days in the future per Resend's
        cap. We convert to ISO 8601 with timezone before handing off;
        a naive datetime is treated as UTC. Past values are passed
        through unchanged (Resend rejects them with 422; we surface
        that error rather than silently sending immediately).

      idempotency_key: scopes the API call. If you POST again with the
        same key inside Resend's 24-hour window, you'll get the same
        message id back instead of a duplicate send. Use a stable
        identifier per logical operation — e.g. for reminders,
        `reminder.t-24h:appt-{id}`. Validator: 1–256 chars.

    Callers should treat a `None` return as "delivery not attempted"
    — for critical flows (password reset) decide explicitly whether
    that should bubble up as a user-visible error.
    """
    if not is_configured():
        raise unprocessable("email_not_configured")

    recipients = [to] if isinstance(to, str) else list(to)
    sendable, suppressed = _filter_suppressed(db, recipients)
    if suppressed:
        _logger.info(
            "resend.send skipped %d suppressed recipient(s): %s",
            len(suppressed), suppressed,
        )
    if not sendable:
        return None

    resend.api_key = settings.RESEND_API_KEY
    params: dict = {
        "from": settings.RESEND_FROM,
        "to": sendable,
        "subject": subject,
        "html": html,
    }
    if text:
        params["text"] = text
    if settings.RESEND_REPLY_TO:
        params["reply_to"] = settings.RESEND_REPLY_TO
    if scheduled_at is not None:
        # Resend accepts ISO 8601 with timezone. A naive datetime is
        # treated as UTC — explicit assumption documented in the
        # docstring so call sites don't get a silent timezone shift.
        from datetime import timezone as _tz
        when = scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=_tz.utc)
        params["scheduled_at"] = when.isoformat()
    if tags:
        # Resend expects [{"name": ..., "value": ...}, …]; tags surface
        # in their dashboard and webhook payloads for filtering. Their
        # validator rejects anything outside [A-Za-z0-9_-], so we
        # normalise on the way out — internal `kind` strings like
        # "reminder.t-24h" become "reminder_t-24h" without callers
        # needing to think about it.
        params["tags"] = [
            {"name": _sanitize_tag(k), "value": _sanitize_tag(v)}
            for k, v in tags.items()
        ]

    options = None
    if idempotency_key:
        # SendOptions is just a TypedDict; the SDK forwards `idempotency_key`
        # as the `Idempotency-Key` HTTP header. Resend dedups same-key calls
        # within a 24h window.
        options = {"idempotency_key": idempotency_key}

    result = resend.Emails.send(params, options) if options else resend.Emails.send(params)
    msg_id = result.get("id") if isinstance(result, dict) else None
    _logger.info(
        "resend.sent id=%s to=%s subject=%r scheduled_at=%s key=%s",
        msg_id, sendable, subject,
        params.get("scheduled_at"), idempotency_key,
    )
    return msg_id


def update_scheduled(*, msg_id: str, scheduled_at: "datetime") -> None:
    """Reschedule an unsent email at Resend.

    Only `scheduled_at` is updatable — Resend doesn't let you change
    subject, body, or recipients. If the message has already been sent
    we get a 4xx; callers should wrap in try/except and treat that as
    "too late to change, oh well" since the email did go out.
    """
    if not is_configured():
        raise unprocessable("email_not_configured")
    from datetime import timezone as _tz
    when = scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=_tz.utc)
    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.update({"id": msg_id, "scheduled_at": when.isoformat()})
    _logger.info("resend.updated id=%s new_scheduled_at=%s", msg_id, when.isoformat())


def cancel_scheduled(*, msg_id: str) -> None:
    """Cancel an unsent scheduled email at Resend.

    Permanent — Resend won't let you un-cancel. Same already-sent error
    handling applies: cancel-after-send is best-effort.
    """
    if not is_configured():
        raise unprocessable("email_not_configured")
    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.cancel(msg_id)
    _logger.info("resend.cancelled id=%s", msg_id)


def suppress(
    db: Session, *, email: str, reason: str, detail: dict | None = None,
) -> None:
    """Idempotently mark an address as do-not-send.

    Called from the webhook handler on bounce/complaint. Safe to call
    repeatedly: the row's primary key is the lowercased email, and we
    overwrite reason+detail with the latest event so an operator sees
    the most recent cause when investigating.
    """
    addr = _normalize(email)
    if not addr:
        return
    existing = db.get(EmailSuppression, addr)
    if existing is None:
        db.add(
            EmailSuppression(email=addr, reason=reason, detail=detail or {})
        )
    else:
        existing.reason = reason
        existing.detail = detail or {}
    db.commit()
    _logger.info("email suppression upserted: %s reason=%s", addr, reason)


def render(template_stem: str, **context) -> tuple[str, str]:
    """Render a template pair into (html, text).

    `template_stem` is the filename without extension — e.g. "doctor_invite"
    looks up "doctor_invite.html" and "doctor_invite.txt". Both must exist;
    we always send a text alternative because spam filters score lower on
    HTML-only mail and screen readers prefer the text part.

    The caller's context dict is merged with a few globals (institute_name,
    reply_to) pulled from system_config so every template can rely on them
    without each call site repeating itself. System config lookup is done
    lazily inside the function because tests can render templates without
    a live LiveConfig cache.
    """
    full_context = {**_global_context(), **context}
    try:
        html_tmpl = _jinja.get_template(f"{template_stem}.html")
        text_tmpl = _jinja.get_template(f"{template_stem}.txt")
    except Exception as exc:
        # A missing template is a deploy bug, not a runtime user error —
        # surface it as 500-class via unhandled exception rather than a
        # silent fallback string.
        raise RuntimeError(f"email template {template_stem!r} not found: {exc}")
    return html_tmpl.render(**full_context), text_tmpl.render(**full_context)


def _global_context() -> dict:
    """Variables every template can reference without an explicit pass."""
    # Lazy import to avoid a hard dependency on system_config being loaded
    # at module-import time (tests, alembic env.py).
    try:
        from .system_config import get_system_config
        cfg = get_system_config()
        institute_name = cfg.institute_name
    except Exception:
        institute_name = None
    return {
        "institute_name": institute_name or "HapuTele",
        "reply_to": settings.RESEND_REPLY_TO or None,
    }


def send_templated(
    db: Session,
    *,
    to: str | list[str],
    subject: str,
    template: str,
    context: dict,
    tags: dict[str, str] | None = None,
    scheduled_at: "datetime | None" = None,
    idempotency_key: str | None = None,
) -> str | None:
    """Render `template` with `context` and send via send_email().

    Convenience wrapper for the common case of "fill in a Jinja template
    and ship it". `scheduled_at` and `idempotency_key` pass through
    unchanged — see send_email() for semantics.
    """
    html, text = render(template, **context)
    return send_email(
        db,
        to=to,
        subject=subject,
        html=html,
        text=text,
        tags=tags,
        scheduled_at=scheduled_at,
        idempotency_key=idempotency_key,
    )
