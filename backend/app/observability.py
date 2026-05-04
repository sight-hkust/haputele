"""Per-request id propagation for logs and error bodies.

`RequestIdMiddleware` assigns each incoming request a short UUID, then sets
`request_id_var` so any log emitted during that request gets the id stamped on
it by `RequestIdFilter`. The same id is echoed back on the response's
`X-Request-ID` header and embedded in every JSON error body (see the FastAPI
exception handlers in `main.py`), so a user-facing error report can be
correlated to the exact backend log line that recorded it.
"""
from __future__ import annotations

import logging
import sys
from contextvars import ContextVar


request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


class RequestIdFilter(logging.Filter):
    """Annotate every log record with the active request id (or '-' if none)."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        return True


_LOG_FORMAT = "%(asctime)s %(levelname)s [req=%(request_id)s] %(name)s: %(message)s"


def configure_logging(level: int = logging.INFO) -> None:
    """Install a stdout handler whose format carries the request id.

    Idempotent — re-runs (e.g. on uvicorn reload) replace the previously
    installed handler instead of stacking duplicates.
    """
    root = logging.getLogger()
    for h in list(root.handlers):
        if getattr(h, "_haputele_managed", False):
            root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT))
    handler.addFilter(RequestIdFilter())
    handler._haputele_managed = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(level)

    # uvicorn installs its own handlers on these loggers, which would bypass
    # the request-id filter. Clear them and let records propagate up to root.
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True
