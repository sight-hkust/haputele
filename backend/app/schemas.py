from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


# ── Auth ──────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    username: str
    password: str
    role: Optional[Literal["admin", "doctor", "healthworker"]] = None


# Successful login response. The JWT itself is delivered out-of-band as
# an HttpOnly cookie — never echo it in the body, that would defeat the
# point of HttpOnly. `expiresAt` is exposed so the client can show a
# "your session ends at …" hint and trigger a re-auth nudge.
class LoginOut(BaseModel):
    username: str
    role: str
    expiresAt: datetime


# GET /auth/me response. Returned only when the session cookie still
# decodes — the frontend uses this on mount to rehydrate state it can no
# longer keep in localStorage.
class MeOut(BaseModel):
    username: str
    role: str


# ── Doctors ───────────────────────────────────────────────────────────

class DoctorBase(BaseModel):
    givenName: str
    familyName: str
    contact: str
    email: EmailStr
    slmcRegistrationNumber: str
    qualifications: str
    practitionerAddress: str
    instituteName: str
    instituteContact: str
    rubberStampImage: str  # base64


class DoctorCreate(DoctorBase):
    username: str
    # Optional — if omitted/empty, the system creates the account with a
    # random password and emails the doctor an invite link to set their
    # own. Requires the email service to be configured; the endpoint will
    # 422 `email_not_configured` otherwise.
    password: Optional[str] = None


class DoctorOnboardingPeek(BaseModel):
    """Public view returned when a doctor visits an invite link.

    `mode` distinguishes the two invite shapes:
      - "new"      → the doctor is onboarding fresh. Frontend renders the
                     full profile form; email + familyName are shown read-only
                     as part of the welcome.
      - "rotation" → an existing doctor is just setting a new password.
                     Frontend renders the slim password-only form.
    """
    mode: str  # "new" | "rotation"
    email: str
    # Populated in "new" mode when the admin supplied a family-name hint
    # at invite time, and in "rotation" mode from the existing Doctor row.
    familyName: str | None = None
    givenName: str | None = None  # only in rotation mode


class DoctorOnboardingComplete(BaseModel):
    """Rotation-flow payload — just a new password."""
    password: str


class DoctorOnboardingSubmit(BaseModel):
    """New-doctor payload — full profile + chosen credentials.

    Note: there is deliberately NO email field. The invite already binds
    an email address; the server uses that value when creating the
    Account + Doctor row and ignores anything the client might send.
    This makes the "doctor submitted a different email" case
    unrepresentable rather than something we'd need to validate against.

    Server validates §1.7 mandatory fields are present. RubberStampImage
    is a base64 data URL (the same shape the admin form already uses).
    """
    username: str
    password: str
    givenName: str
    familyName: str
    contact: str
    slmcRegistrationNumber: str
    qualifications: str
    practitionerAddress: str
    instituteName: str
    instituteContact: str
    rubberStampImage: str  # base64


class DoctorInviteCreate(BaseModel):
    """Admin's invite-by-email request. Only the email is required.

    `familyName` is an optional hint solely for the invite email's
    greeting — the doctor's real family name is captured during
    onboarding. Not echoed in any later API response.
    """
    email: EmailStr
    familyName: str | None = None


class DoctorRejectIn(BaseModel):
    """Admin's reject payload. `reason` is shown to the doctor on a
    pending/rejected screen and stored on the Doctor row for audit."""
    reason: str | None = None


class DoctorUpdate(BaseModel):
    givenName: Optional[str] = None
    familyName: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    slmcRegistrationNumber: Optional[str] = None
    qualifications: Optional[str] = None
    practitionerAddress: Optional[str] = None
    instituteName: Optional[str] = None
    instituteContact: Optional[str] = None
    rubberStampImage: Optional[str] = None
    active: Optional[bool] = None


class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(validation_alias="doctor_id")
    username: str
    givenName: str = Field(validation_alias="given_name")
    familyName: str = Field(validation_alias="family_name")
    contact: str
    email: str
    slmcRegistrationNumber: str = Field(validation_alias="slmc_registration_number")
    qualifications: str
    practitionerAddress: str = Field(validation_alias="practitioner_address")
    instituteName: str = Field(validation_alias="institute_name")
    instituteContact: str = Field(validation_alias="institute_contact")
    active: bool
    # Three-state lifecycle:
    #   "awaiting_setup"    → live unconsumed invite, doctor hasn't filled
    #                         out the form yet (or has filled it out and
    #                         submitted but their row hasn't been created
    #                         yet — only possible in the legacy mode).
    #   "awaiting_approval" → doctor has submitted their profile; admin
    #                         hasn't approved yet. Account exists but
    #                         can't log in.
    #   "rejected"          → admin reviewed + rejected. active is also
    #                         false; rejected_at + rejected_reason are
    #                         populated on the Doctor row.
    #   "active"            → approved + onboarded. Normal state.
    onboardingStatus: str = "active"


class DoctorDetailOut(DoctorOut):
    """Singular `GET /doctors/{id}` response — adds the rubber stamp as a
    base64 data URL so the admin edit page can re-display the existing image.
    The list endpoint deliberately uses `DoctorOut` to keep payloads lean.
    """
    rubberStampImage: Optional[str] = None


# ── Master consent (in-line on POST /patients) ────────────────────────

def _require_aware(v: Optional[datetime]) -> Optional[datetime]:
    """Reject naive client-supplied timestamps so storage stays UTC-normalised.

    The DB column is TIMESTAMPTZ; a naive datetime would be interpreted as the
    server's local time, which is not what any honest client means. Clients
    should send ISO 8601 with an explicit offset (or `Z`), or omit the field
    and let the server stamp it with `datetime.now(timezone.utc)`.
    """
    if v is not None and v.tzinfo is None:
        raise ValueError("capturedAt must include a timezone offset (e.g. ...Z)")
    return v


class MasterConsentIn(BaseModel):
    agreed: bool
    version: Optional[str] = None  # default applied server-side
    capturedAt: Optional[datetime] = None
    signatureImage: Optional[str] = None  # base64 PNG; required server-side when agreed=true

    _aware_capturedAt = field_validator("capturedAt")(_require_aware)


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(validation_alias="consent_id")
    patientId: int = Field(validation_alias="patient_id")
    scope: str
    version: Optional[str]
    agreed: bool
    appointmentId: Optional[int] = Field(default=None, validation_alias="appointment_id")
    capturedAt: datetime = Field(validation_alias="captured_at")
    revokedAt: Optional[datetime] = Field(default=None, validation_alias="revoked_at")
    reason: Optional[str]
    # signatureMethod is exposed so the doctor view can render "signed" vs
    # legacy "click-only" consents differently. The bytes themselves stay
    # server-side — surface a hasSignature boolean instead.
    hasSignature: bool = Field(default=False)
    signatureMethod: Optional[str] = Field(default=None, validation_alias="signature_method")

    @model_validator(mode="before")
    @classmethod
    def _hassig(cls, value: Any) -> Any:
        if isinstance(value, dict) or value is None:
            return value
        # ORM row → derive hasSignature from signature key presence (the bytes
        # live in S3; the key column is non-null iff a signature was captured).
        as_dict = {
            "consent_id": value.consent_id,
            "patient_id": value.patient_id,
            "scope": value.scope,
            "version": value.version,
            "agreed": value.agreed,
            "appointment_id": value.appointment_id,
            "captured_at": value.captured_at,
            "revoked_at": value.revoked_at,
            "reason": value.reason,
            "signature_method": value.signature_method,
            "hasSignature": value.signature_key is not None,
        }
        return as_dict


class ReConsentIn(BaseModel):
    scope: Literal["master"] = "master"
    agreed: bool
    version: Optional[str] = None
    capturedAt: Optional[datetime] = None
    signatureImage: Optional[str] = None

    _aware_capturedAt = field_validator("capturedAt")(_require_aware)


class RevokeConsentIn(BaseModel):
    reason: Optional[str] = None


# ── Patients ──────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    masterConsent: MasterConsentIn
    given: str
    family: str
    gender: str
    dob: Optional[date] = None
    language: Optional[Literal["en", "ta", "si"]] = None
    screeningRef: Optional[str] = None
    nationalId: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None

    @field_validator("nationalId")
    @classmethod
    def _check_nid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) not in (10, 12):
            raise ValueError("nationalId must be 10 or 12 chars")
        return v


class PatientUpdate(BaseModel):
    given: Optional[str] = None
    family: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    language: Optional[Literal["en", "ta", "si"]] = None
    screeningRef: Optional[str] = None
    nationalId: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None

    @field_validator("nationalId")
    @classmethod
    def _check_nid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) not in (10, 12):
            raise ValueError("nationalId must be 10 or 12 chars")
        return v


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(validation_alias="patient_id")
    given: str = Field(validation_alias="given_name")
    family: str = Field(validation_alias="family_name")
    gender: str
    dob: Optional[date] = None
    language: Optional[str] = Field(default=None, validation_alias="plang")
    screeningRef: Optional[str] = Field(default=None, validation_alias="screening_ref")
    nationalId: Optional[str] = Field(default=None, validation_alias="n_id")
    contact: Optional[str] = None
    address: Optional[str] = None
    masterConsentId: Optional[int] = Field(default=None, validation_alias="master_consent_id")
    createdAt: datetime = Field(validation_alias="created_at")


# ── Profile JSONB entries ─────────────────────────────────────────────

# 9 patient-history disease codes (userStories §Patient profile)
DiseaseCode = Literal[
    "diabetes", "hypertension", "ihd", "asthma_copd", "kidney",
    "thyroid", "cancer", "mental_health", "other",
]


class DiseaseEntry(BaseModel):
    code: DiseaseCode
    text: Optional[str] = None

    @model_validator(mode="after")
    def _other_needs_text(self) -> "DiseaseEntry":
        if self.code == "other" and not (self.text and self.text.strip()):
            raise ValueError("text required when code='other'")
        return self


class SurgeryEntry(BaseModel):
    description: str


AllergyType = Literal["food", "medication", "other"]


class AllergyEntry(BaseModel):
    type: AllergyType
    name: str
    medication: Optional[str] = None
    treatedWhere: Optional[str] = None


class ExistingMedicationEntry(BaseModel):
    drug: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    notes: Optional[str] = None


# ── Lifestyle (typed enums per dataModel CHECK constraints) ──────────

SmokingStatus = Literal["never", "current", "prior"]
AlcoholStatus = Literal["none", "occasional", "regular"]


class Lifestyle(BaseModel):
    smoking: Optional[SmokingStatus] = None
    alcohol: Optional[AlcoholStatus] = None
    occupation: Optional[str] = None
    physicalActivity: Optional[str] = None


# ── Profile ──────────────────────────────────────────────────────────

class ProfileIn(BaseModel):
    diseaseHistory: list[DiseaseEntry] = Field(default_factory=list)
    surgicalHistory: list[SurgeryEntry] = Field(default_factory=list)
    allergies: list[AllergyEntry] = Field(default_factory=list)
    medications: list[ExistingMedicationEntry] = Field(default_factory=list)
    lifestyle: Lifestyle = Field(default_factory=Lifestyle)


class ProfileOut(BaseModel):
    patientId: int
    diseaseHistory: list[DiseaseEntry] = Field(default_factory=list)
    surgicalHistory: list[SurgeryEntry] = Field(default_factory=list)
    allergies: list[AllergyEntry] = Field(default_factory=list)
    medications: list[ExistingMedicationEntry] = Field(default_factory=list)
    lifestyle: Lifestyle = Field(default_factory=Lifestyle)
    updatedAt: datetime

    @model_validator(mode="before")
    @classmethod
    def _from_orm(cls, value: Any) -> Any:
        if isinstance(value, dict) or value is None:
            return value
        return {
            "patientId": value.patient_id,
            "diseaseHistory": value.diseases or [],
            "surgicalHistory": value.surgeries or [],
            "allergies": value.allergies or [],
            "medications": value.existing_medications or [],
            "lifestyle": {
                "smoking": value.smoking,
                "alcohol": value.alcohol,
                "occupation": value.occupation,
                "physicalActivity": value.physical_activity,
            },
            "updatedAt": value.updated_at,
        }


# ── Appointments ──────────────────────────────────────────────────────

class AppointmentCreate(BaseModel):
    patientId: int
    doctorId: int
    scheduledAt: datetime


class AppointmentUpdate(BaseModel):
    doctorId: Optional[int] = None
    scheduledAt: Optional[datetime] = None


class RequeueOnCancel(BaseModel):
    """Optional requeue block on appointment cancel.

    Mirrors `QueueEntryCreate` minus `patientId` (taken from the cancelled
    appointment) and `force` (an explicit HW action at cancel time bypasses
    the soft duplicate check).
    """
    source: Literal["screening", "walk_in"] = "walk_in"
    priority: Literal["urgent", "routine"] = "routine"
    preferredDoctorId: Optional[int] = None
    targetDate: Optional[date] = None
    notes: Optional[str] = None
    sourceMeta: dict = Field(default_factory=dict)


class AppointmentCancelIn(BaseModel):
    reason: Optional[str] = None
    requeue: Optional[RequeueOnCancel] = None


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(validation_alias="appointment_id")
    patientId: int = Field(validation_alias="patient_id")
    doctorId: int = Field(validation_alias="doctor_id")
    scheduledAt: datetime = Field(validation_alias="scheduled_at")
    status: str
    cancellationReason: Optional[str] = Field(default=None, validation_alias="cancellation_reason")
    createdAt: datetime = Field(validation_alias="created_at")


class CalendarAppointmentOut(AppointmentOut):
    """Calendar list item — adds denormalised display fields per §6."""
    patientName: str
    doctorName: str


# ── Doctor availability ───────────────────────────────────────────────

class AvailabilityCreate(BaseModel):
    startAt: datetime
    endAt: datetime
    note: Optional[str] = None

    _aware_startAt = field_validator("startAt")(_require_aware)
    _aware_endAt = field_validator("endAt")(_require_aware)


class AvailabilityUpdate(BaseModel):
    startAt: Optional[datetime] = None
    endAt: Optional[datetime] = None
    note: Optional[str] = None

    _aware_startAt = field_validator("startAt")(_require_aware)
    _aware_endAt = field_validator("endAt")(_require_aware)


class AvailabilityBulkCreate(BaseModel):
    windows: list[AvailabilityCreate] = Field(min_length=1, max_length=200)


class AvailabilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(validation_alias="availability_id")
    doctorId: int = Field(validation_alias="doctor_id")
    startAt: datetime = Field(validation_alias="start_at")
    endAt: datetime = Field(validation_alias="end_at")
    note: Optional[str] = None
    createdBy: str = Field(validation_alias="created_by")
    createdAt: datetime = Field(validation_alias="created_at")


# ── Session consent ───────────────────────────────────────────────────

class SessionConsentIn(BaseModel):
    scope: Literal["session"] = "session"
    agreed: bool
    capturedAt: Optional[datetime] = None
    signatureImage: Optional[str] = None

    _aware_capturedAt = field_validator("capturedAt")(_require_aware)


# ── Preconsult ────────────────────────────────────────────────────────

class PreconsultIn(BaseModel):
    height: Optional[int] = None
    weight: Optional[int] = None
    sysBp: Optional[int] = None
    diaBp: Optional[int] = None
    pulse: Optional[int] = None
    temperature: Optional[Decimal] = None
    primaryComplaint: Optional[str] = None


class PreconsultOut(BaseModel):
    # Pydantic v2 serializes Decimal as a JSON string by default. The frontend's
    # TS type declares `temperature: number | null`, so we emit float on the wire
    # to keep the contract honest. Internal handling stays Decimal — the float
    # cast happens only at response-serialisation time.
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    appointmentId: int = Field(validation_alias="appointment_id")
    height: Optional[int]
    weight: Optional[int]
    sysBp: Optional[int] = Field(default=None, validation_alias="systolic")
    diaBp: Optional[int] = Field(default=None, validation_alias="diastolic")
    pulse: Optional[int]
    temperature: Optional[float] = None
    primaryComplaint: Optional[str] = Field(default=None, validation_alias="primary_complaint")
    submittedAt: datetime = Field(validation_alias="submitted_at")

    @field_validator("temperature", mode="before")
    @classmethod
    def _decimal_to_float(cls, v: Any) -> Any:
        return float(v) if v is not None else None


# ── Consultation JSONB entries ────────────────────────────────────────

# 23 dropdown diagnosis codes (apiSequenceFlows §"JSONB schemas")
DiagnosisCode = Literal[
    "allergy", "alzheimers", "arthritis", "asthma", "autoimmune", "cancer",
    "ckd", "chronic_liver", "chronic_pain", "common_cold", "copd", "covid19",
    "diabetes", "heart_disease", "hiv_aids", "hypertension", "influenza",
    "mental_health", "obesity", "osteoporosis", "stroke", "thyroid", "others",
]


class DiagnosisEntry(BaseModel):
    code: DiagnosisCode
    text: Optional[str] = None

    @model_validator(mode="after")
    def _others_needs_text(self) -> "DiagnosisEntry":
        if self.code == "others" and not (self.text and self.text.strip()):
            raise ValueError("text required when code='others'")
        return self


class MedicationEntry(BaseModel):
    genericName: str
    tradeName: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None


class LabEntry(BaseModel):
    testName: Optional[str] = None
    instructions: Optional[str] = None


class ReferralEntry(BaseModel):
    specialistOrDepartment: Optional[str] = None
    instructions: Optional[str] = None


# ── Consultations ─────────────────────────────────────────────────────

class NotesPatch(BaseModel):
    complaint: Optional[str] = None
    onset: Optional[str] = None
    symptoms: Optional[str] = None
    observations: Optional[str] = None


class ConsultationPatch(BaseModel):
    notes: Optional[NotesPatch] = None
    diagnoses: Optional[list[DiagnosisEntry]] = None
    medications: Optional[list[MedicationEntry]] = None
    labs: Optional[list[LabEntry]] = None
    referrals: Optional[list[ReferralEntry]] = None


class FollowUpAppointment(BaseModel):
    kind: Literal["appointment"]
    scheduledAt: datetime  # doctor is implicitly self — server uses parent appointment's doctor

    _aware = field_validator("scheduledAt")(_require_aware)


class FollowUpWeeks(BaseModel):
    kind: Literal["weeks"]
    weeks: int = Field(ge=1, le=52)


FollowUp = Annotated[
    Union[FollowUpAppointment, FollowUpWeeks],
    Field(discriminator="kind"),
]


class ConsultationSubmitIn(BaseModel):
    signature: str  # base64 / data url
    followUp: Optional[FollowUp] = None


class ConsultationOut(BaseModel):
    id: int
    appointmentId: int
    status: str
    notes: NotesPatch
    diagnoses: list[DiagnosisEntry] = Field(default_factory=list)
    medications: list[MedicationEntry] = Field(default_factory=list)
    labs: list[LabEntry] = Field(default_factory=list)
    referrals: list[ReferralEntry] = Field(default_factory=list)
    followUpDate: Optional[date] = None
    followUpWeeks: Optional[int] = None
    followUpAppointmentId: Optional[int] = None
    signedAt: Optional[datetime] = None

    @classmethod
    def from_row(cls, c: Any) -> "ConsultationOut":
        return cls(
            id=c.consultation_id,
            appointmentId=c.appointment_id,
            status=c.status,
            notes=NotesPatch(
                complaint=c.notes_complaint,
                onset=c.notes_onset,
                symptoms=c.notes_symptoms,
                observations=c.notes_observations,
            ),
            diagnoses=c.diagnoses or [],
            medications=c.medications or [],  # Pydantic reads via aliases
            labs=c.labs or [],
            referrals=c.referrals or [],
            followUpDate=c.follow_up_date,
            followUpWeeks=c.follow_up_weeks,
            followUpAppointmentId=c.follow_up_appointment_id,
            signedAt=c.signed_at,
        )


# ── History ───────────────────────────────────────────────────────────

class HistoryConsultationItem(BaseModel):
    consultationId: int
    appointmentId: int
    date: datetime
    diagnoses: list[DiagnosisEntry] = Field(default_factory=list)
    prescription: list[MedicationEntry] = Field(default_factory=list)
    notes: NotesPatch


class PatientHistoryOut(BaseModel):
    appointments: list[AppointmentOut]
    consultations: list[HistoryConsultationItem]


# ── Attachments (HW-uploaded photos for an appointment) ─────────────

class AttachmentMetaOut(BaseModel):
    """Metadata for an appointment attachment. The raw bytes are fetched via
    the singular `GET /appointments/{id}/attachments/{aid}` endpoint so the
    JSON payload stays small."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(validation_alias="attachment_id")
    appointmentId: int = Field(validation_alias="appointment_id")
    filename: str
    mimeType: str = Field(validation_alias="mime_type")
    byteSize: int = Field(validation_alias="byte_size")
    caption: Optional[str] = None
    uploadedBy: str = Field(validation_alias="uploaded_by")
    uploadedAt: datetime = Field(validation_alias="uploaded_at")


class AttachmentUpdateIn(BaseModel):
    caption: Optional[str] = None


# ── Appointment detail (§7, §9, §10) ──────────────────────────────────

class AppointmentDetailOut(BaseModel):
    """Composite payload for `GET /appointments/{id}` covering §7, §9, §10.1.

    `profile` is included so the doctor "Begin consultation" view (§9) gets the
    patient health profile. `consultation` is the full consultation record (§10.1
    needs the locked, complete version when the appointment is `completed`).
    `attachments` carries metadata only — clients fetch bytes per id.
    """
    appointment: AppointmentOut
    patient: Optional[PatientOut] = None
    profile: Optional[ProfileOut] = None
    preconsult: Optional[PreconsultOut] = None
    consultation: Optional[ConsultationOut] = None
    masterConsentStatus: Literal["ok", "needs_reconsent"]
    attachments: list[AttachmentMetaOut] = Field(default_factory=list)


# ── Queue ─────────────────────────────────────────────────────────────

QueueSource = Literal["screening", "walk_in", "follow_up"]
QueueStatus = Literal["pending", "booked", "cancelled"]
QueuePriority = Literal["urgent", "routine"]


class QueueEntryCreate(BaseModel):
    patientId: int
    source: QueueSource  # 'follow_up' is server-only — manual create rejects it
    priority: QueuePriority = "routine"
    preferredDoctorId: Optional[int] = None
    targetDate: Optional[date] = None
    notes: Optional[str] = None
    sourceMeta: dict = Field(default_factory=dict)
    force: bool = False  # bypass duplicate-pending warning


class QueueEntryUpdate(BaseModel):
    priority: Optional[QueuePriority] = None
    preferredDoctorId: Optional[int] = None
    targetDate: Optional[date] = None
    notes: Optional[str] = None
    sourceMeta: Optional[dict] = None


class QueueBookIn(BaseModel):
    doctorId: int
    scheduledAt: datetime

    _aware = field_validator("scheduledAt")(_require_aware)


class QueueCancelIn(BaseModel):
    reason: Optional[str] = None


class QueueEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(validation_alias="queue_id")
    patientId: int = Field(validation_alias="patient_id")
    source: str
    status: str
    priority: str
    preferredDoctorId: Optional[int] = Field(default=None, validation_alias="preferred_doctor_id")
    targetDate: Optional[date] = Field(default=None, validation_alias="target_date")
    notes: Optional[str] = None
    sourceMeta: dict = Field(default_factory=dict, validation_alias="source_meta")
    appointmentId: Optional[int] = Field(default=None, validation_alias="appointment_id")
    createdBy: str = Field(validation_alias="created_by")
    createdAt: datetime = Field(validation_alias="created_at")
    bookedAt: Optional[datetime] = Field(default=None, validation_alias="booked_at")
    cancelledAt: Optional[datetime] = Field(default=None, validation_alias="cancelled_at")
    cancellationReason: Optional[str] = Field(default=None, validation_alias="cancellation_reason")


# ── Capture sessions (phone-as-camera via QR) ─────────────────────────

class CaptureSessionCreateIn(BaseModel):
    """Desktop → server: mint a capture session.

    `appointmentId` is required when purpose is appointment_attachment
    (that's where the phone's photos land) and ignored otherwise. The
    server re-validates the appointment exists and is writeable.
    """
    purpose: Literal["appointment_attachment", "rubber_stamp"]
    appointmentId: Optional[int] = None


class CaptureSessionOut(BaseModel):
    """Creation response. `token` is the raw secret — returned exactly once
    here so the desktop can build the QR; never re-fetchable afterwards."""
    id: int
    token: str
    purpose: str
    expiresAt: datetime = Field(validation_alias="expires_at")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class CaptureSessionStatusOut(BaseModel):
    """Desktop poll response — never carries the token. `relayReady` flags
    that a rubber_stamp photo is parked and waiting to be pulled."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    purpose: str
    expiresAt: datetime = Field(validation_alias="expires_at")
    closed: bool
    uploadCount: int = Field(validation_alias="upload_count")
    relayReady: bool


class CapturePeekOut(BaseModel):
    """Phone → server peek: just enough for the capture page to render the
    right UI. No appointment/patient detail — the scanner is unauthenticated
    beyond holding the token, so we leak nothing identifying."""
    purpose: str
    expiresAt: datetime
