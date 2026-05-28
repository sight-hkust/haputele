"""S3-compatible object storage client + first-run bucket bootstrap.

`get_s3_client()` builds a boto3 client from `settings.S3_*`. The endpoint
URL points at the in-compose `rustfs` service in dev; in prod it should
be empty (boto3 then hits the regional AWS S3 endpoint) or set to a
custom S3 gateway.

`ensure_bucket()` is called from the FastAPI lifespan so the app refuses
to come up against a missing/unreachable bucket. We treat 404/NoSuchBucket
as "create it" and any other error as fatal — getting this wrong silently
loses uploads, so we'd rather crash early.
"""
from __future__ import annotations

import logging
from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from ..config import settings


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
