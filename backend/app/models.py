from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Account(Base):
    __tablename__ = "accounts"

    username: Mapped[str] = mapped_column(String(255), primary_key=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # Set by the sys-admin (ops super user) to soft-disable an operating
    # account. NULL = active; a non-NULL timestamp blocks /auth/login with
    # `account_disabled`. We soft-disable rather than delete because the
    # username is FK-referenced (RESTRICT) by records this account created.
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Optional ops-managed profile for operating accounts (admin /
    # healthworker): who the account belongs to and how to reach them.
    # Doctors carry their richer profile on the `doctor` table instead.
    full_name: Mapped[str | None] = mapped_column(Text)
    contact: Mapped[str | None] = mapped_column(Text)


class Doctor(Base):
    __tablename__ = "doctor"

    doctor_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(
        String(255), ForeignKey("accounts.username", ondelete="CASCADE"), unique=True, nullable=False
    )
    given_name: Mapped[str] = mapped_column(String(255), nullable=False)
    family_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    slmc_registration_number: Mapped[str] = mapped_column(String(50), nullable=False)
    qualifications: Mapped[str] = mapped_column(Text, nullable=False)
    practitioner_address: Mapped[str] = mapped_column(Text, nullable=False)
    institute_name: Mapped[str] = mapped_column(String(255), nullable=False)
    institute_contact: Mapped[str] = mapped_column(String(255), nullable=False)
    rubber_stamp_key: Mapped[str] = mapped_column(String(512), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Approval workflow. Doctors self-onboard via an invite-by-email flow
    # which creates the row but leaves approved_at NULL; an admin reviews
    # and either calls /approve (stamps NOW) or /reject (stamps rejected_at
    # + optional reason and deactivates). Backfilled to NOW() on the 0010
    # migration so existing doctors stay usable across the upgrade.
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_reason: Mapped[str | None] = mapped_column(Text)
    # When the row sprang into existence — submission time in the
    # new-doctor flow, create time in the legacy flow. Drives the
    # approval-queue ordering. server_default keeps existing fixtures and
    # any direct INSERTs valid without setting it explicitly.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    # Audit: which admin acted, and (on reapply) which rejected row this
    # submission supersedes. All nullable — an awaiting doctor has neither
    # approver nor rejecter yet; a first-time applicant has no predecessor.
    approved_by: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("accounts.username", ondelete="SET NULL")
    )
    rejected_by: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("accounts.username", ondelete="SET NULL")
    )
    previous_doctor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("doctor.doctor_id", ondelete="SET NULL")
    )


class Patient(Base):
    __tablename__ = "patients"

    patient_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    given_name: Mapped[str] = mapped_column(String(255), nullable=False)
    family_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    dob: Mapped[date | None] = mapped_column(Date)
    plang: Mapped[str | None] = mapped_column(String(2))
    screening_ref: Mapped[str | None] = mapped_column(String(255))
    n_id: Mapped[str | None] = mapped_column(String(12), unique=True)
    contact: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    master_consent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("consents.consent_id", use_alter=True, name="patients_master_consent_fk")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    profile: Mapped["Profile | None"] = relationship(back_populates="patient", uselist=False)


class Profile(Base):
    __tablename__ = "profile"

    profile_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("patients.patient_id", ondelete="CASCADE"), unique=True, nullable=False
    )
    diseases: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    surgeries: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    allergies: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    existing_medications: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    smoking: Mapped[str | None] = mapped_column(String(20))
    alcohol: Mapped[str | None] = mapped_column(String(20))
    occupation: Mapped[str | None] = mapped_column(String(255))
    physical_activity: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )

    patient: Mapped[Patient] = relationship(back_populates="profile")


class Consent(Base):
    __tablename__ = "consents"

    consent_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    scope: Mapped[str] = mapped_column(String(20), nullable=False)  # 'master' | 'session'
    version: Mapped[str | None] = mapped_column(String(50))
    agreed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    appointment_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("appointments.appointment_id", ondelete="CASCADE", use_alter=True, name="consents_appointment_fk"),
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str | None] = mapped_column(Text)
    signature_key: Mapped[str | None] = mapped_column(String(512))
    signature_method: Mapped[str | None] = mapped_column(String(20))


class Appointment(Base):
    __tablename__ = "appointments"

    appointment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(Integer, ForeignKey("patients.patient_id"), nullable=False)
    doctor_id: Mapped[int] = mapped_column(Integer, ForeignKey("doctor.doctor_id"), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="scheduled")
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class DoctorAvailability(Base):
    __tablename__ = "doctor_availability"

    availability_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("doctor.doctor_id", ondelete="CASCADE"), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(
        String(255), ForeignKey("accounts.username"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class Preconsultation(Base):
    __tablename__ = "preconsultation"

    pr_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    appointment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("appointments.appointment_id", ondelete="CASCADE"), unique=True, nullable=False
    )
    height: Mapped[int | None] = mapped_column(Integer)
    weight: Mapped[int | None] = mapped_column(Integer)
    systolic: Mapped[int | None] = mapped_column(Integer)
    diastolic: Mapped[int | None] = mapped_column(Integer)
    pulse: Mapped[int | None] = mapped_column(Integer)
    temperature: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    primary_complaint: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class Consultation(Base):
    __tablename__ = "consultations"

    consultation_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    appointment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("appointments.appointment_id", ondelete="CASCADE"), unique=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    notes_complaint: Mapped[str | None] = mapped_column(Text)
    notes_onset: Mapped[str | None] = mapped_column(Text)
    notes_symptoms: Mapped[str | None] = mapped_column(Text)
    notes_observations: Mapped[str | None] = mapped_column(Text)
    diagnoses: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    medications: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    labs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    referrals: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    follow_up_date: Mapped[date | None] = mapped_column(Date)
    follow_up_weeks: Mapped[int | None] = mapped_column(Integer)
    follow_up_appointment_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("appointments.appointment_id")
    )
    signature_key: Mapped[str | None] = mapped_column(String(512))
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AppointmentAttachment(Base):
    __tablename__ = "appointment_attachments"

    attachment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    appointment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("appointments.appointment_id", ondelete="CASCADE"), nullable=False
    )
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    caption: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str] = mapped_column(
        String(255), ForeignKey("accounts.username"), nullable=False
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class SystemConfig(Base):
    __tablename__ = "system_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    initialized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    institute_name: Mapped[str | None] = mapped_column(Text)
    institute_address_lines: Mapped[list | None] = mapped_column(JSONB)
    institute_contact_phone: Mapped[str | None] = mapped_column(Text)
    institute_contact_email: Mapped[str | None] = mapped_column(Text)
    app_timezone: Mapped[str | None] = mapped_column(Text)
    export_timezone: Mapped[str | None] = mapped_column(Text)
    master_consent_version: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class SetupToken(Base):
    __tablename__ = "setup_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class QueueEntry(Base):
    __tablename__ = "queue_entries"

    queue_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="routine")
    preferred_doctor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("doctor.doctor_id")
    )
    target_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    source_meta: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    appointment_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("appointments.appointment_id")
    )
    created_by: Mapped[str] = mapped_column(
        String(255), ForeignKey("accounts.username"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    booked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)


class EmailSuppression(Base):
    """Addresses we must not send transactional email to.

    Populated by the Resend webhook handler when an `email.bounced`
    (hard bounce only) or `email.complained` event arrives. `reason`
    is the raw webhook event type so an operator can tell at a glance
    why an address was suppressed. Lookups by lowercased address are
    O(1) via the primary key, so send_email() can cheaply gate every
    outbound message on this table.
    """
    __tablename__ = "email_suppressions"

    email: Mapped[str] = mapped_column(String(320), primary_key=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )


class DoctorInvite(Base):
    """One-shot onboarding token for a newly-created doctor account.

    Issued by `POST /doctors` (or the re-issue endpoint) when the
    admin chooses "invite by email" instead of typing a password. The
    Account row exists with a random password; the doctor receives a
    link containing the raw token (NOT the hash), follows it, sets
    their real password, and we mark the row consumed.

    Liveness predicate: `consumed_at IS NULL AND expires_at > NOW()`.
    Multiple historical rows per doctor are allowed (re-issue flow);
    the onboarding endpoint picks the most recent live row.
    """
    __tablename__ = "doctor_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # NULL for "new-doctor" invites issued by email before any Doctor row
    # exists. The onboarding-complete path fills this in atomically with
    # the new Doctor row's id.
    doctor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("doctor.doctor_id", ondelete="CASCADE")
    )
    # Captured at invite time. The onboarding page surfaces this so the
    # doctor sees "you're setting up the account that invite went to".
    # Also used to reject double-invites for the same address.
    email: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional admin-provided name hint, used purely to personalise the
    # invite email's greeting. Doctor's actual family name is captured
    # in the onboarding form.
    family_name: Mapped[str | None] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NotificationLog(Base):
    """Idempotency record for every outbound notification.

    `dedup_key` is the unique identity of a "thing we should send once",
    constructed by the caller — e.g. `"reminder.t-24h:appt-123"` or
    `"doctor.invite:doctor-45"`. The UNIQUE constraint means a cron
    scanner can rely on `INSERT … ON CONFLICT DO NOTHING RETURNING id`
    to atomically claim a send slot: if the insert returned a row the
    caller is responsible for sending; if it didn't, someone else (or
    a previous run) already sent it.

    `kind` is the category (used for filtering / reporting);
    `recipient` is the email address we sent to; `resend_msg_id` is the
    Resend message id (populated after the API call, so a row in the
    table with NULL resend_msg_id means "claimed to send but the API
    call hasn't completed yet" — see send_reminders.py for the
    claim → send → update sequence).
    """
    __tablename__ = "notification_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dedup_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    recipient: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    resend_msg_id: Mapped[str | None] = mapped_column(Text)


