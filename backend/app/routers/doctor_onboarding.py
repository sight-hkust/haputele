"""Public doctor-onboarding endpoints — token-authenticated, no session.

A doctor receives an emailed link of the form

    {FRONTEND_BASE_URL}/doctor-onboarding/{raw_token}

The frontend mounts a page at that path which:
  1. GETs /doctor-onboarding/{token} — verifies the token is live and
     learns which flow this invite belongs to (rotation vs new doctor).
  2. POSTs /doctor-onboarding/{token} with either:
       - rotation: just {password}
       - new doctor: the full profile + username + password

These endpoints intentionally bypass our normal auth + CSRF stack: the
doctor isn't logged in yet, and there is no session cookie to defend.
The raw token (32 bytes of url-safe entropy) IS the credential, and
its single-use lifecycle is enforced inside services/doctor_invites.py.

Setup gate: post-init this path passes through normally (no `/setup/`
prefix). Pre-init the gate 409s setup_required, which is correct —
no doctors exist before first-run setup completes.
"""
from __future__ import annotations

import logging
from typing import Any, TypeVar

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from ..deps import db_dep
from ..errors import unprocessable
from ..models import Doctor
from ..schemas import (
    DoctorOnboardingComplete,
    DoctorOnboardingPeek,
    DoctorOnboardingSubmit,
)
from ..services import doctor_invites as invites
from ..services.signature import decode_rubber_stamp, decode_signature


_logger = logging.getLogger("haputele.doctor_onboarding")

router = APIRouter(prefix="/doctor-onboarding", tags=["doctor-onboarding"])

_M = TypeVar("_M", bound=BaseModel)


def _parse_body(model: type[_M], payload: dict[str, Any]) -> _M:
    """`model_validate`, but with FastAPI's error envelope instead of a 500.

    This is the one endpoint that parses its body by hand — the schema is
    chosen by the invite's mode, which lives in the database — so nothing
    has already turned a Pydantic error into an HTTP response for us. Left
    alone, a ValidationError is not a RequestValidationError and so misses
    main.py's 422 handler entirely, escaping to the catch-all as a 500. On a
    public, unauthenticated endpoint, for input the caller fully controls.

    Re-raising as RequestValidationError routes it through the very handler
    FastAPI uses for every ordinary body model, so a hand-parsed body and a
    framework-parsed one produce identical 422s.

    HTTPException is deliberately NOT caught. The credential validators in
    services/credentials.py raise it, and Pydantic lets non-ValueError
    exceptions through untouched — so `password_whitespace` /
    `setup_password_too_short` keep their specific codes instead of
    collapsing into a generic `validation_failed`.
    """
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(), body=payload) from exc


@router.get("/{token}", response_model=DoctorOnboardingPeek)
def peek(token: str, db: Session = Depends(db_dep)) -> DoctorOnboardingPeek:
    """Validate the token and return non-sensitive context for the page.

    Two response shapes by mode:
      - new      → {mode, email, familyName?}. The frontend renders the
                   full profile form. Email is shown read-only.
      - rotation → {mode, email, givenName, familyName}. The frontend
                   renders the slim password-only form.

    A 404 here means the token is unknown / expired / already consumed —
    the frontend should render a generic "this link isn't valid" screen.
    """
    invite = invites.lookup_live(db, raw_token=token)
    if invite.doctor_id is None:
        # New-doctor invite.
        return DoctorOnboardingPeek(
            mode="new",
            email=invite.email,
            familyName=invite.family_name,
        )
    # Rotation invite — Doctor row exists.
    doctor = db.get(Doctor, invite.doctor_id)
    if doctor is None:  # extremely unlikely (FK CASCADE) but defensive
        raise unprocessable("doctor_not_found")
    return DoctorOnboardingPeek(
        mode="rotation",
        email=doctor.email,
        givenName=doctor.given_name,
        familyName=doctor.family_name,
    )


@router.post("/{token}", status_code=status.HTTP_204_NO_CONTENT)
def complete(
    token: str,
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(db_dep),
) -> Response:
    """Consume the token. Body shape depends on the invite mode.

    Rotation: {password}. We just set the new password on the existing
    Account; Doctor row + approval state unchanged.

    New doctor: full DoctorOnboardingSubmit. We create the Account and
    Doctor row (approved_at = NULL — admin must approve next) and link
    the invite. Doctor can NOT log in until the admin clicks Approve.

    We dispatch on the actual invite mode (not on the payload shape) so
    a doctor can't accidentally send a new-doctor payload to a rotation
    invite or vice versa.
    """
    invite = invites.lookup_live(db, raw_token=token)
    # Dispatch first, THEN parse. The body arrives as a raw dict because the
    # schema depends on the invite, so each branch hands it to the model
    # that branch expects — and the NewUsername / NewPassword field types on
    # those models are what apply the credential policy here, exactly as
    # they do on the other six credential-setting paths. Validating the
    # password by hand before the branch (as this did) meant one code path
    # reimplementing the rules, and it accepted anything truthy: a JSON
    # number reached str.strip() and 500'd.

    if invite.doctor_id is not None:
        # Rotation: ignore anything other than password.
        rotation = _parse_body(DoctorOnboardingComplete, payload)
        doctor = invites.consume_rotation(
            db, raw_token=token, new_password=rotation.password,
        )
        _logger.info(
            "doctor rotation onboarded: doctor_id=%s username=%s",
            doctor.doctor_id, doctor.username,
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # New-doctor flow: validate the full payload. Email is intentionally
    # not part of the submission — the invite owns that value.
    submission = _parse_body(DoctorOnboardingSubmit, payload)
    try:
        stamp_bytes = decode_rubber_stamp(submission.rubberStampImage)
    except HTTPException:
        raise  # let rubber_stamp_too_large / invalid_rubber_stamp_image propagate as-is
    except Exception as exc:
        raise unprocessable("invalid_rubber_stamp_image", detail=str(exc))

    # Optional saved e-signature — decoded here so a bad image fails the
    # onboarding submit cleanly rather than deep in the service.
    signature_bytes = (
        decode_signature(submission.defaultSignatureImage)
        if submission.defaultSignatureImage
        else None
    )

    # Institute phone is optional; normalise blank/whitespace to None.
    institute_contact = (submission.instituteContact or "").strip() or None

    doctor = invites.consume_new_doctor(
        db,
        raw_token=token,
        # No .strip() — NewUsername rejects whitespace outright rather than
        # silently repairing it, so what was submitted is what gets stored.
        username=submission.username,
        password=submission.password,
        profile={
            "givenName": submission.givenName.strip(),
            "familyName": submission.familyName.strip(),
            "contact": submission.contact.strip(),
            "slmcRegistrationNumber": submission.slmcRegistrationNumber.strip(),
            "qualifications": submission.qualifications.strip(),
            "practitionerAddress": submission.practitionerAddress.strip(),
            "instituteName": submission.instituteName.strip(),
            "instituteContact": institute_contact,
        },
        rubber_stamp=stamp_bytes,
        default_signature=signature_bytes,
    )
    _logger.info(
        "new doctor self-onboarded (awaiting approval): doctor_id=%s username=%s",
        doctor.doctor_id, doctor.username,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
