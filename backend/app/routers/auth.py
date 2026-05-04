from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..config import settings
from ..deps import CurrentUser, current_user, db_dep
from ..errors import unauthorized
from ..models import Account
from ..schemas import LoginIn, LoginOut, MeOut
from ..security import (
    clear_session_cookies,
    create_token,
    generate_csrf_token,
    set_session_cookies,
    verify_password,
)


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
    token, expires = create_token(account.username, account.role)
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
