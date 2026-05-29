"""S3-compatible object storage client + first-run bucket bootstrap.

`get_s3_client()` builds a boto3 client from `settings.S3_*`. The endpoint
URL points at the in-compose `rustfs` service in dev; in prod it should
be empty (boto3 then hits the regional AWS S3 endpoint) or set to a
custom S3 gateway.

`ensure_bucket()` is called from the FastAPI lifespan so the app refuses
to come up against a missing/unreachable bucket. We treat 404/NoSuchBucket
as "create it" and any other error as fatal — getting this wrong silently
loses uploads, so we'd rather crash early.

`put_bytes` / `get_bytes` / `delete_object` are the blob I/O surface the
routers use: we store an opaque object key in Postgres and the bytes here,
then proxy reads back through the API (never presigned URLs) so patient PII
stays behind the existing cookie auth. boto3 is synchronous, so `async`
callers must wrap these in `run_in_threadpool` to avoid blocking the loop.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from uuid import uuid4

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from ..config import settings
from ..errors import not_found


_logger = logging.getLogger("haputele.storage")


@lru_cache(maxsize=1)
def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL or None,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID or None,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY or None,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if settings.S3_FORCE_PATH_STYLE else "auto"},
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def ensure_bucket(bucket: str | None = None) -> None:
    """Create `bucket` if it doesn't already exist. Idempotent.

    Distinguishes `head_bucket` 404 (missing → create) from 403
    (exists but we lack permission → fatal, surfaces the misconfig).
    Treats `BucketAlreadyOwnedByUs`/`BucketAlreadyExists` raised during
    the create as success — handles the race where two workers boot
    simultaneously.
    """
    name = bucket or settings.S3_BUCKET
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=name)
        _logger.info("s3 bucket present: %s", name)
        return
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if code not in ("404", "NoSuchBucket") and status != 404:
            raise

    try:
        # us-east-1 must NOT carry a CreateBucketConfiguration — every
        # other region requires one. Branch accordingly.
        if settings.S3_REGION and settings.S3_REGION != "us-east-1":
            client.create_bucket(
                Bucket=name,
                CreateBucketConfiguration={"LocationConstraint": settings.S3_REGION},
            )
        else:
            client.create_bucket(Bucket=name)
        _logger.info("s3 bucket created: %s", name)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("BucketAlreadyOwnedByUs", "BucketAlreadyExists"):
            _logger.info("s3 bucket already exists (race): %s", name)
            return
        raise


def object_key(prefix: str, ext: str) -> str:
    """Build an opaque, collision-free object key under `prefix`.

    Random (uuid4) rather than the row PK so callers can upload *before* the
    DB insert — no flush-to-get-id dance, and the key never has to change.
    """
    return f"{prefix}/{uuid4().hex}.{ext}"


def put_bytes(key: str, data: bytes, content_type: str) -> None:
    """Upload `data` under `key`. Callers commit the key to Postgres only
    after this returns, so a failed upload raises before any DB write."""
    get_s3_client().put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def get_bytes(key: str) -> bytes:
    """Fetch the object at `key`. Raises 404 `object_not_found` if the key is
    absent — a DB row pointing at a missing object is a data-integrity bug, so
    we surface it rather than returning empty bytes."""
    try:
        resp = get_s3_client().get_object(Bucket=settings.S3_BUCKET, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404"):
            raise not_found("object_not_found")
        raise
    return resp["Body"].read()


def delete_object(key: str) -> None:
    """Best-effort delete. Used after the owning DB row is already gone, so a
    missing key is fine (S3 delete is idempotent) and we never raise — at
    worst we leak one orphaned object, which a future sweep can reclaim."""
    try:
        get_s3_client().delete_object(Bucket=settings.S3_BUCKET, Key=key)
    except ClientError as exc:
        _logger.warning("s3 delete failed for %s: %s", key, exc)
