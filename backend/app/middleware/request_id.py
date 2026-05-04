"""Per-request id middleware. See `app.observability` for the bigger picture."""
from __future__ import annotations

import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..observability import request_id_var


REQUEST_ID_HEADER = "X-Request-ID"

# Accept incoming X-Request-ID only if it looks like an opaque token. Anything
# else (newlines, spaces, exotic unicode) gets replaced with a fresh uuid so a
# malicious client can't inject controls into our log lines.
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


_logger = logging.getLogger("haputele.request")


def _normalize(raw: str | None) -> str:
    if raw and _VALID_REQUEST_ID.match(raw):
        return raw
    return uuid.uuid4().hex


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assign each request a UUID, expose it on state/header/contextvar.

    The id is stashed in three places that each serve a different consumer:
      - `request.state.request_id` — read by FastAPI exception handlers when
        injecting `requestId` into error JSON bodies.
      - `request_id_var` contextvar — read by `RequestIdFilter` so log
        records made while handling this request carry the id.
      - `X-Request-ID` response header — visible to the browser/client, so
        the user can quote the id in a bug report.
    """

    async def dispatch(self, request: Request, call_next):
        request_id = _normalize(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        try:
            try:
                response: Response = await call_next(request)
            except Exception:
                duration_ms = (time.perf_counter() - start) * 1000
                _logger.exception(
                    "unhandled %s %s after %.1f ms",
                    request.method, request.url.path, duration_ms,
                )
                raise
            response.headers[REQUEST_ID_HEADER] = request_id
            duration_ms = (time.perf_counter() - start) * 1000
            _logger.info(
                "%s %s -> %d (%.1f ms)",
                request.method, request.url.path, response.status_code, duration_ms,
            )
            return response
        finally:
            # Reset only after the access log line, so the line itself is
            # still tagged with this request's id.
            request_id_var.reset(token)
