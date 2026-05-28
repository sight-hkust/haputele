import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from .config import settings
from .database import SessionLocal
from .middleware.request_id import REQUEST_ID_HEADER, RequestIdMiddleware
from .middleware.setup_gate import SetupRequiredMiddleware
from .observability import configure_logging
from .security import CSRF_HEADER_NAME
from .routers import (
    appointments,
    attachments,
    auth,
    availability,
    consultations,
    doctors,
    exports,
    patients,
    preconsult,
    queue,
    setup,
    summary,
    sysadmin,
)
from .services.storage import ensure_bucket
from .services.system_config import load_system_config


_logger = logging.getLogger("haputele")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        load_system_config(db)
    finally:
        db.close()
    ensure_bucket()
    yield


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or "-"


async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Inject `requestId` into the standard `{"detail": {...}}` error envelope.

    Endpoints raise via the helpers in `errors.py`, which set detail to a dict
    like `{"error": "doctor_slot_taken"}`. We splice the request id alongside
    so the client receives a single self-contained correlation token.
    """
    rid = _request_id(request)
    detail = exc.detail
    if isinstance(detail, dict):
        body: dict = {**detail, "requestId": rid}
    elif isinstance(detail, str):
        body = {"error": detail, "requestId": rid}
    else:
        body = {"error": "http_error", "detail": detail, "requestId": rid}
    headers = dict(exc.headers or {})
    headers[REQUEST_ID_HEADER] = rid
    return JSONResponse(status_code=exc.status_code, content={"detail": body}, headers=headers)


async def _validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    rid = _request_id(request)
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "error": "validation_failed",
                "errors": exc.errors(),
                "requestId": rid,
            },
        },
        headers={REQUEST_ID_HEADER: rid},
    )


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    rid = _request_id(request)
    _logger.exception(
        "unhandled exception while serving %s %s",
        request.method, request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": {"error": "internal_error", "requestId": rid}},
        headers={REQUEST_ID_HEADER: rid},
    )


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(title="HapuTele API", version="0.1.0", lifespan=lifespan)

    # Starlette wraps middleware last-added-first, so on entry the order is
    # RequestId → SetupGate → CORS → app, and the reverse on exit. RequestId
    # is outermost so every response (including SetupGate short-circuits and
    # CORS preflight replies) gets an X-Request-ID header and a tagged log
    # line. CORS is innermost so its headers ride on the actual app response.
    #
    # Cookies + credentials mode forbid wildcard origins (browsers ignore
    # `Access-Control-Allow-Origin: *` when credentials=true). When the
    # frontend shares an origin via the /api rewrite, CORS_ALLOW_ORIGINS
    # stays empty and the middleware is effectively a no-op for browser
    # requests; populate it only when the API is reached cross-origin.
    cors_origins = [
        o.strip() for o in settings.CORS_ALLOW_ORIGINS.split(",") if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", CSRF_HEADER_NAME],
        expose_headers=[REQUEST_ID_HEADER],
    )
    app.add_middleware(SetupRequiredMiddleware)
    app.add_middleware(RequestIdMiddleware)

    app.add_exception_handler(HTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)

    app.include_router(setup.router)
    app.include_router(sysadmin.router)
    app.include_router(auth.router)
    app.include_router(doctors.router)
    app.include_router(patients.router)
    app.include_router(appointments.router)
    app.include_router(availability.doctor_router)
    app.include_router(availability.flat_router)
    app.include_router(preconsult.router)
    app.include_router(attachments.router)
    app.include_router(consultations.appts_router)
    app.include_router(consultations.cons_router)
    app.include_router(queue.router)
    app.include_router(summary.router)
    app.include_router(exports.router)

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
