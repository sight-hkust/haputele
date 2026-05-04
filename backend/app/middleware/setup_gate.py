"""Setup-required gate. Runs before auth.

Pre-init (system_config.initialized_at IS NULL):
  - /health, /docs(/*), /redoc(/*), /openapi.json: pass through
  - /setup/*: pass through
  - everything else: 409 {"detail": {"error": "setup_required"}}

Post-init:
  - /setup/status: pass through (lets the frontend pick its first screen)
  - /setup/*: 409 {"detail": {"error": "setup_already_completed"}}
  - everything else: pass through (normal per-route auth applies)
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .request_id import REQUEST_ID_HEADER
from ..services.system_config import get_system_config


_ALWAYS_OPEN_EXACT = {"/health", "/openapi.json"}
_ALWAYS_OPEN_PREFIXES = ("/docs", "/redoc")


def _is_always_open(path: str) -> bool:
    if path in _ALWAYS_OPEN_EXACT:
        return True
    for p in _ALWAYS_OPEN_PREFIXES:
        if path == p or path.startswith(p + "/"):
            return True
    return False


def _is_setup_path(path: str) -> bool:
    return path == "/setup" or path.startswith("/setup/")


def _gate_error(request: Request, code: str) -> JSONResponse:
    """Short-circuit error response that still carries the per-request id.

    RequestIdMiddleware wraps this middleware, so `request.state.request_id`
    is set; we copy it into the body and header so this 409 stays consistent
    with the FastAPI exception-handler error envelope downstream.
    """
    rid = getattr(request.state, "request_id", None) or "-"
    return JSONResponse(
        status_code=409,
        content={"detail": {"error": code, "requestId": rid}},
        headers={REQUEST_ID_HEADER: rid},
    )


class SetupRequiredMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if _is_always_open(path):
            return await call_next(request)

        cfg = get_system_config()
        if not cfg.is_initialized:
            if _is_setup_path(path):
                return await call_next(request)
            return _gate_error(request, "setup_required")

        # Initialized.
        if _is_setup_path(path):
            # /setup/status remains reachable after init so the frontend
            # can detect "already initialized" without parsing 409s.
            if path == "/setup/status":
                return await call_next(request)
            return _gate_error(request, "setup_already_completed")
        return await call_next(request)
