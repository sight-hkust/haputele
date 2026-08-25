"""Build provenance and runtime identity for the /health endpoint.

The three BUILD_* values are baked into the image at build time (see
backend/Dockerfile; CI passes the git ref, sha, and build timestamp, see
.github/workflows/docker.yml). They are deliberately NOT part of Settings:
they describe the image, not runtime configuration, and must not be
overridable through config.yaml / .env at runtime.
"""
import os
import socket
import time

_PROCESS_STARTED = time.monotonic()

VERSION = os.environ.get("BUILD_VERSION", "dev")
BUILD_DATE = os.environ.get("BUILD_DATE", "unknown")
COMMIT = os.environ.get("BUILD_COMMIT", "unknown")


def uptime_seconds() -> float:
    """Seconds since this process started (monotonic clock)."""
    return time.monotonic() - _PROCESS_STARTED


def hostname() -> str:
    return socket.gethostname()
