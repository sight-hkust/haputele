"""Deep-dependency probe behind GET /health?full=true.

Plain /health is a liveness probe: process identity and uptime, no
dependencies touched, so it stays green even while Postgres or the object
store is down. `?full=true` is the readiness variant: it actively checks
the three backing services, and the endpoint answers 503 while any
*configured* dependency is failing.

Checks run concurrently and every one is hard-bounded at ~2s, so the
overall probe is capped at GATHER_TIMEOUT_S (3s): a check still running
at the cap is abandoned — its worker thread is left to die on its own
timers — and reported as "timed out". A hung service can never hang the
probe.

  db      — SELECT 1 over a dedicated short-timeout engine.
            connect_timeout bounds the connect; statement_timeout bounds
            the query itself, so a Postgres that accepts TCP but never
            answers cannot stall the probe. Deliberately NOT the app
            engine: it has neither timeout, so against a down Postgres a
            connect can hang for the OS default (~2min) — the wrong tempo
            for a probe. NullPool keeps the probe from perturbing the
            app's pool state.
  s3      — head_bucket on a dedicated short-timeout client from
            storage.get_probe_s3_client(), which shares the app client's
            endpoint / credential / path-style wiring, so the probe
            checks exactly what the app talks to.
  livekit — TCP connect to LIVEKIT_URL's host:port. The api never opens a
            control connection to LiveKit (it only mints JWTs; browsers
            connect), so reachability is the honest check. Empty
            LIVEKIT_URL is a supported deployment (meeting tokens fail
            closed with 422) → not_configured, not an error.

Status tags are module constants (STATUS_*) so a typo at a producer or
consumer site cannot silently flip a pass into a failure; the tests
assert the literal wire strings, which pins the contract.

Error bodies carry the exception class name only — boto3/psycopg2 message
text embeds internal endpoints (S3 URL + bucket, db host:port) and this
endpoint is unauthenticated. The full message goes to the log instead.
latencyMs is wall clock around the whole check (client construction
included for db/s3) — probe cost, a close proxy for service response
time. not_configured carries no latency because nothing was probed.

run_full_probe() is single-flight with a short result cache: concurrent
callers share one in-flight probe, and a result younger than CACHE_TTL_S
is served without re-probing — a client hammering ?full=true cannot
multiply connections to the backing services.
"""
from __future__ import annotations

import logging
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from urllib.parse import urlparse

from sqlalchemy import NullPool, create_engine, text

from ..config import settings
from .storage import get_probe_s3_client

_logger = logging.getLogger("haputele.health_probe")

CHECK_TIMEOUT_S = 2
CHECK_TIMEOUT_MS = CHECK_TIMEOUT_S * 1000
GATHER_TIMEOUT_S = 3  # hard wall-clock cap on one probe pass
CACHE_TTL_S = 2.0  # results younger than this are served without re-probing

STATUS_OK = "ok"
STATUS_ERROR = "error"
STATUS_NOT_CONFIGURED = "not_configured"

# Single-flight state for run_full_probe(); guarded by _probe_lock.
_probe_lock = threading.Lock()
_last: tuple[float, dict] | None = None  # (perf_counter, last result)


def _err(exc: BaseException) -> dict:
    """Error body. The wire carries only the exception class name —
    boto3/psycopg2 message text embeds internal endpoints and this
    endpoint is unauthenticated. The full message goes to the log."""
    _logger.warning("health probe check failed: %s: %s", exc.__class__.__name__, exc)
    return {"status": STATUS_ERROR, "error": exc.__class__.__name__}


def _check_db() -> dict:
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={
            "connect_timeout": CHECK_TIMEOUT_S,
            # Server-side bound for the query itself: connect_timeout only
            # covers the handshake, and a hung-but-accepting Postgres would
            # otherwise stall SELECT 1 past every client-side timeout.
            "options": f"-c statement_timeout={CHECK_TIMEOUT_MS}",
        },
        poolclass=NullPool,
        future=True,
    )
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": STATUS_OK}
    except Exception as exc:  # noqa: BLE001 — a probe reports, never raises
        return _err(exc)
    finally:
        engine.dispose()


def _check_s3() -> dict:
    try:
        client = get_probe_s3_client(CHECK_TIMEOUT_S)
        client.head_bucket(Bucket=settings.S3_BUCKET)
        return {"status": STATUS_OK}
    except Exception as exc:  # noqa: BLE001
        return _err(exc)


def _check_livekit() -> dict:
    raw = (settings.LIVEKIT_URL or "").strip()
    if not raw:
        return {"status": STATUS_NOT_CONFIGURED}
    try:
        parsed = urlparse(raw if "://" in raw else f"ws://{raw}")
        host = parsed.hostname
        if not host:
            return {"status": STATUS_ERROR, "error": "LIVEKIT_URL has no host"}
        port = parsed.port or (443 if parsed.scheme in ("wss", "https") else 80)
        with socket.create_connection((host, port), timeout=CHECK_TIMEOUT_S):
            pass
        return {"status": STATUS_OK}
    except (OSError, ValueError) as exc:
        return _err(exc)


def _timed(fn):
    """Wrap a check so its result carries `latencyMs` (wall clock around the
    call, milliseconds, 1 decimal). Also the last line of defence: a check
    that escapes its own try/except still yields an error body instead of
    blowing up the future."""

    def wrapped() -> dict:
        start = time.perf_counter()
        try:
            result = fn()
        except Exception as exc:  # noqa: BLE001
            result = _err(exc)
        if result.get("status") != STATUS_NOT_CONFIGURED:
            result["latencyMs"] = round((time.perf_counter() - start) * 1000, 1)
        return result

    return wrapped


def _run_checks() -> dict:
    """One probe pass: all checks concurrently, wall-clock capped.

    The name→function map is built per call (not at module level) so tests
    can monkeypatch _check_* and have the probe pick the patches up; _timed
    wraps whatever is installed at call time.

    The executor is shut down with wait=False on purpose: the default
    context-manager exit blocks until every future finishes, which would
    let a check that outlives GATHER_TIMEOUT_S (e.g. an unbounded DNS
    resolution inside a client library) stall the response anyway. The
    abandoned worker thread is non-daemon and exits on its own timers.
    """
    checks = {"db": _check_db, "s3": _check_s3, "livekit": _check_livekit}
    deps: dict[str, dict] = {}
    pool = ThreadPoolExecutor(max_workers=len(checks))
    try:
        futures = {name: pool.submit(_timed(fn)) for name, fn in checks.items()}
        for name, fut in futures.items():
            started = time.perf_counter()
            try:
                deps[name] = fut.result(timeout=GATHER_TIMEOUT_S)
            except (TimeoutError, FutureTimeoutError):  # same class on 3.11+
                elapsed = round((time.perf_counter() - started) * 1000, 1)
                deps[name] = {"status": STATUS_ERROR, "error": "timed out", "latencyMs": elapsed}
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return {"dependencies": deps}


def run_full_probe() -> dict:
    """Single-flight wrapper around _run_checks with a short result cache.

    The lock is held across the probe, so concurrent callers queue (for at
    most one probe pass) and then hit the fresh cache instead of launching
    duplicate probes. Tests must reset _last between cases — the TTL would
    otherwise leak one test's (monkeypatched) result into the next.
    """
    global _last
    with _probe_lock:
        if _last is not None and (time.perf_counter() - _last[0]) < CACHE_TTL_S:
            return _last[1]
        result = _run_checks()
        _last = (time.perf_counter(), result)
        return result
