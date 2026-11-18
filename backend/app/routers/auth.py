from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from pydantic import BaseModel, Field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..deps import CurrentUser, current_user, db_dep, require_role
from ..errors import forbidden, unauthorized, unprocessable
from ..models import Account, Doctor
from ..schemas import LoginIn, LoginOut, MeOut
from ..security import (
    clear_session_cookies,
    create_token,
    generate_csrf_token,
    hash_password,
    set_session_cookies,
    verify_password,
)

from ..services import password_recovery as recovery
from ..services.credentials import NewPassword


router = APIRouter(prefix="/auth", tags=["auth"])

# Stable machine code; the user-facing sentence lives in the frontend's
# error-codes table. Same code for "no such account", "wrong password", and
# "wrong role" so the response can't be used to enumerate usernames.
INVALID_CREDENTIALS = "invalid_credentials"


@router.post("/login", response_model=LoginOut)
def login(
    payload: LoginIn,
    response: Response,
    db: Session = Depends(db_dep),
) -> LoginOut:
    account = db.get(Account, payload.username)
    if not account or not verify_password(payload.password, account.password):
        raise unauthorized(INVALID_CREDENTIALS)
    if payload.role and payload.role != account.role:
        raise unauthorized(INVALID_CREDENTIALS)

    # Soft-disable gate. Checked AFTER password verification for the same
    # reason as the doctor gates below: an attacker who doesn't know the
    # password gets the generic invalid_credentials code, while the
    # legitimate owner of a disabled account sees why they're locked out.
    if account.disabled_at is not None:
        raise forbidden("account_disabled")

    # Approval gate for self-onboarded doctors. We check AFTER password
    # verification so a wrong password still returns the generic
    # invalid_credentials code — an attacker who doesn't know the password
    # gets the same response either way. Only the legitimate owner sees
    # the specific pending/rejected code, which is what they need to
    # understand why they can't get in.
    if account.role == "doctor":
        doctor = db.scalar(select(Doctor).where(Doctor.username == account.username))
        if doctor is not None:
            if doctor.rejected_at is not None:
                raise forbidden("account_rejected")
            if doctor.approved_at is None:
                raise forbidden("account_pending_approval")

    token, expires = create_token(account.username, account.role, account.credential_version)
    set_session_cookies(
        response,
        session_token=token,
        csrf_token=generate_csrf_token(),
        max_age_seconds=settings.JWT_EXPIRE_MIN * 60,
    )
    return LoginOut(username=account.username, role=account.role, expiresAt=expires)


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    _: CurrentUser = Depends(current_user),
) -> Response:
    # Authenticated logout: the CSRF check inside `current_user` keeps a
    # cross-site attacker from forcibly signing the user out. We mutate
    # the response object we received so FastAPI returns the cleared
    # cookies; returning a model would discard the headers we just set.
    clear_session_cookies(response)
    response.status_code = 204
    return response


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser = Depends(current_user)) -> MeOut:
    return MeOut(username=user.username, role=user.role)


class DoctorRecoveryRequest(BaseModel):
    email: str = Field(min_length=1, max_length=255)


class DoctorRecoveryReset(BaseModel):
    token: str = Field(min_length=1, max_length=128)
    password: NewPassword


@router.post("/doctor-recovery/request", status_code=202, response_class=Response)
def request_doctor_recovery(
    body: DoctorRecoveryRequest, request: Request, tasks: BackgroundTasks
) -> Response:
    if recovery.allow_request(request.client.host if request.client else "unknown"):
        tasks.add_task(recovery.send_recovery, body.email)
    return Response(status_code=202)


@router.post("/doctor-recovery/reset", status_code=204, response_class=Response)
def reset_doctor_password(body: DoctorRecoveryReset, db: Session = Depends(db_dep)) -> Response:
    recovery.reset_password(db, body.token, body.password)
    return Response(status_code=204)


class DoctorPasswordChange(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=1024)
    newPassword: NewPassword


@router.post("/doctor-password/change", status_code=204, response_class=Response)
def change_doctor_password(
    body: DoctorPasswordChange,
    user: CurrentUser = Depends(require_role("doctor")),
    db: Session = Depends(db_dep),
) -> Response:
    account = db.get(Account, user.username, with_for_update=True)
    if not account or not verify_password(body.currentPassword, account.password):
        raise unprocessable("incorrect_current_password")
    if len(body.newPassword.encode()) > 72:
        raise unprocessable("password_too_long")
    account.password = hash_password(body.newPassword)
    db.commit()
    response = Response(status_code=204)
    clear_session_cookies(response)
    return response
