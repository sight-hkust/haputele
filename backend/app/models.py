from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
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
    rubber_stamp_image: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


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
    signature_image: Mapped[bytes | None] = mapped_column(LargeBinary)
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
    signature: Mapped[bytes | None] = mapped_column(LargeBinary)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AppointmentAttachment(Base):
    __tablename__ = "appointment_attachments"

    attachment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    appointment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("appointments.appointment_id", ondelete="CASCADE"), nullable=False
    )
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
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
