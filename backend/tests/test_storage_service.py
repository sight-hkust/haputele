"""Contract tests for the S3 blob helpers (services/storage).

Signatures, rubber stamps, and attachment bytes now live in object storage;
these tests pin the put/get/delete round-trip and the not-found behaviour the
routers rely on. Like the DB-backed tests, they skip when the backing service
isn't reachable so a bare `pytest` on a dev box doesn't fail spuriously.
"""
from __future__ import annotations

import socket
from urllib.parse import urlparse

import pytest

from app.config import settings
from app.errors import not_found  # noqa: F401  (documents the raised type's origin)
from app.services import storage


def _s3_reachable() -> bool:
    # Endpoint is empty for real AWS S3 — assume reachable there; only probe
    # the in-compose rustfs/minio case where a host:port is configured.
    endpoint = settings.S3_ENDPOINT_URL
    if not endpoint:
        return True
    parsed = urlparse(endpoint)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not _s3_reachable(), reason=f"S3 at {settings.S3_ENDPOINT_URL!r} not reachable"
)


@pytest.fixture(scope="module", autouse=True)
def _bucket():
    storage.ensure_bucket()
    yield


def test_object_key_is_prefixed_and_unique():
    a = storage.object_key("signatures/consent", "png")
    b = storage.object_key("signatures/consent", "png")
    assert a.startswith("signatures/consent/")
    assert a.endswith(".png")
    assert a != b  # uuid4-based, so two calls never collide


def test_put_get_roundtrip_preserves_bytes():
    key = storage.object_key("test/roundtrip", "bin")
    payload = b"\x89PNG\r\n\x1a\n-not-really-but-binary-\x00\xff"
    storage.put_bytes(key, payload, "application/octet-stream")
    try:
        assert storage.get_bytes(key) == payload
    finally:
        storage.delete_object(key)


def test_get_missing_key_raises_404():
    missing = storage.object_key("test/missing", "bin")
    with pytest.raises(Exception) as exc:  # HTTPException(404, object_not_found)
        storage.get_bytes(missing)
    assert getattr(exc.value, "status_code", None) == 404
    assert exc.value.detail.get("error") == "object_not_found"


def test_delete_is_idempotent_and_removes_object():
    key = storage.object_key("test/delete", "bin")
    storage.put_bytes(key, b"transient", "application/octet-stream")
    storage.delete_object(key)
    # Object is gone...
    with pytest.raises(Exception) as exc:
        storage.get_bytes(key)
    assert getattr(exc.value, "status_code", None) == 404
    # ...and deleting an already-absent key is a no-op (best-effort contract).
    storage.delete_object(key)
