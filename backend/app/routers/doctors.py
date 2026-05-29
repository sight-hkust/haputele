import base64

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import db_dep, require_role
from ..errors import not_found, unprocessable
from ..models import Account, Doctor
from ..schemas import DoctorCreate, DoctorDetailOut, DoctorOut, DoctorUpdate
from ..security import hash_password
from ..services.signature import decode_rubber_stamp
from ..services.storage import delete_object, get_bytes, object_key, put_bytes


router = APIRouter(prefix="/doctors", tags=["doctors"])

REQUIRED_PRESCRIPTION_FIELDS = (
    "slmcRegistrationNumber",
    "qualifications",
    "practitionerAddress",
    "instituteContact",
    "rubberStampImage",
)


def _sniff_stamp(data: bytes) -> tuple[str, str]:
    """(mime, ext) from magic bytes — PNG/JPEG only, matching the uploader's
    accept list. Anything else is treated as PNG (browsers infer from the
    actual bytes regardless of the hint)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    return "image/png", "png"


def _encode_stamp(data: bytes | None) -> str | None:
    """Bytes → `data:image/<mime>;base64,...` for re-display on the edit page."""
    if not data:
        return None
    mime, _ = _sniff_stamp(data)
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


@router.post("", response_model=DoctorOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role("admin"))])
def create_doctor(payload: DoctorCreate, db: Session = Depends(db_dep)) -> DoctorOut:
    missing = [f for f in REQUIRED_PRESCRIPTION_FIELDS if not getattr(payload, f, None)]
    if missing:
        raise unprocessable("missing_prescription_fields", missing=missing)

    if db.get(Account, payload.username):
        raise unprocessable("username_taken")

    stamp = decode_rubber_stamp(payload.rubberStampImage)
    mime, ext = _sniff_stamp(stamp)
    stamp_key = object_key("doctors/stamps", ext)
    put_bytes(stamp_key, stamp, mime)

    account = Account(
        username=payload.username,
        password=hash_password(payload.password),
        role="doctor",
    )
    doctor = Doctor(
        username=payload.username,
        given_name=payload.givenName,
        family_name=payload.familyName,
        contact=payload.contact,
        email=payload.email,
        slmc_registration_number=payload.slmcRegistrationNumber,
        qualifications=payload.qualifications,
        practitioner_address=payload.practitionerAddress,
        institute_name=payload.instituteName,
        institute_contact=payload.instituteContact,
        rubber_stamp_key=stamp_key,
        active=True,
    )
    db.add(account)
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return DoctorOut.model_validate(doctor)


@router.get("", response_model=list[DoctorOut])
def list_doctors(active: bool | None = None, db: Session = Depends(db_dep),
                 _user=Depends(require_role("admin", "doctor", "healthworker"))):
    stmt = select(Doctor)
    if active is not None:
        stmt = stmt.where(Doctor.active.is_(active))
    rows = db.scalars(stmt.order_by(Doctor.doctor_id)).all()
    return [DoctorOut.model_validate(r) for r in rows]


@router.get("/{doctor_id}", response_model=DoctorDetailOut,
            dependencies=[Depends(require_role("admin", "doctor", "healthworker"))])
def get_doctor(doctor_id: int, db: Session = Depends(db_dep)) -> DoctorDetailOut:
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise not_found("doctor_not_found")
    out = DoctorDetailOut.model_validate(doctor)
    out.rubberStampImage = _encode_stamp(get_bytes(doctor.rubber_stamp_key))
    return out


@router.patch("/{doctor_id}", response_model=DoctorOut,
              dependencies=[Depends(require_role("admin"))])
def update_doctor(doctor_id: int, payload: DoctorUpdate, db: Session = Depends(db_dep)) -> DoctorOut:
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise not_found("doctor_not_found")

    field_map = {
        "givenName": "given_name",
        "familyName": "family_name",
        "contact": "contact",
        "email": "email",
        "slmcRegistrationNumber": "slmc_registration_number",
        "qualifications": "qualifications",
        "practitionerAddress": "practitioner_address",
        "instituteName": "institute_name",
        "instituteContact": "institute_contact",
        "active": "active",
    }
    data = payload.model_dump(exclude_unset=True)

    superseded_key: str | None = None
    if "rubberStampImage" in data and data["rubberStampImage"] is not None:
        stamp = decode_rubber_stamp(data.pop("rubberStampImage"))
        mime, ext = _sniff_stamp(stamp)
        new_key = object_key("doctors/stamps", ext)
        put_bytes(new_key, stamp, mime)
        superseded_key = doctor.rubber_stamp_key
        doctor.rubber_stamp_key = new_key
    else:
        data.pop("rubberStampImage", None)

    if "password" in data and data["password"]:
        account = db.get(Account, doctor.username)
        if account:
            account.password = hash_password(data.pop("password"))
    else:
        data.pop("password", None)

    for k, v in data.items():
        col = field_map.get(k)
        if col is not None:
            setattr(doctor, col, v)

    db.commit()
    db.refresh(doctor)
    # Drop the superseded object only once the new key is committed — a failed
    # commit rolls back to old_key, so we must not delete it pre-commit.
    if superseded_key:
        delete_object(superseded_key)
    return DoctorOut.model_validate(doctor)


@router.delete("/{doctor_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role("admin"))])
def delete_doctor(doctor_id: int, db: Session = Depends(db_dep)):
    # Soft delete — preserve FK references on past appointments/consultations.
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        raise not_found("doctor_not_found")
    doctor.active = False
    db.commit()
    return None
