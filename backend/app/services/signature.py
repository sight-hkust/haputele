"""Validating decoders for the base64 image blobs we accept from clients:
patient/consultation signatures and doctor rubber stamps.

All three share the same shape — accept a `data:image/...;base64,...` data URL
or a raw base64 string, decode it, enforce a size cap, and check that the bytes
actually look like one of the allowed image formats. The asset types differ
only in their size budget, allowed magics, and the stable error codes raised on
each rejection path (so the frontend can render a context-appropriate sentence).
"""
from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass

from ..errors import unprocessable


_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"


@dataclass(frozen=True)
class _ImagePolicy:
    max_bytes: int
    allowed_magics: tuple[bytes, ...]
    missing_code: str
    format_code: str
    too_large_code: str


def _decode(raw: str | None, policy: _ImagePolicy) -> bytes:
    if raw is None or not raw.strip():
        raise unprocessable(policy.missing_code)

    payload = raw.strip()
    if payload.startswith("data:"):
        # data:image/png;base64,XXXX  → keep only the base64 portion
        _, _, payload = payload.partition(",")

    try:
        decoded = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise unprocessable(policy.format_code)

    if len(decoded) > policy.max_bytes:
        raise unprocessable(policy.too_large_code, max=policy.max_bytes)

    if not any(decoded.startswith(m) for m in policy.allowed_magics):
        raise unprocessable(policy.format_code)

    return decoded


# ~200 KB is generous for a 1-bit, low-resolution canvas trace. Same budget for
# patient-consent signatures and doctor consultation signatures — both come
# from the same in-browser <canvas> signature pad.
_SIGNATURE_POLICY = _ImagePolicy(
    max_bytes=200 * 1024,
    allowed_magics=(_PNG_MAGIC,),
    missing_code="signature_required",
    format_code="invalid_signature_format",
    too_large_code="signature_too_large",
)

# Rubber stamps are uploaded photos, so we allow JPEG too and grant a larger
# budget. 1 MB is comfortably above what a phone-camera shot of a stamp needs
# after even modest compression.
_RUBBER_STAMP_POLICY = _ImagePolicy(
    max_bytes=1024 * 1024,
    allowed_magics=(_PNG_MAGIC, _JPEG_MAGIC),
    missing_code="rubber_stamp_required",
    format_code="invalid_rubber_stamp_image",
    too_large_code="rubber_stamp_too_large",
)


def decode_signature(raw: str | None) -> bytes:
    """Decode a base64 / data-URL PNG signature into bytes.

    Used for both patient consent signatures and doctor consultation
    submission signatures. Callers should only invoke this when they actually
    require a signature (e.g. when the consent row is `agreed=true`).
    """
    return _decode(raw, _SIGNATURE_POLICY)


def decode_rubber_stamp(raw: str | None) -> bytes:
    """Decode a base64 / data-URL doctor rubber-stamp image into bytes."""
    return _decode(raw, _RUBBER_STAMP_POLICY)
