"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-27

Mirrors the original backend/init.sql verbatim — same tables, CHECK
constraints, partial indexes, FK alter dance, trigram GIN index, and
reject_completed_update triggers.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            username  VARCHAR(255) PRIMARY KEY,
            password  VARCHAR(255) NOT NULL,
            role      VARCHAR(20)  NOT NULL CHECK (role IN ('admin','doctor','healthworker'))
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_admin_idx "
        "ON accounts ((role)) WHERE role = 'admin'"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_healthworker_idx "
        "ON accounts ((role)) WHERE role = 'healthworker'"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS doctor (
            doctor_id                  SERIAL PRIMARY KEY,
            username                   VARCHAR(255) NOT NULL UNIQUE
                                           REFERENCES accounts(username) ON DELETE CASCADE,
            given_name                 VARCHAR(255) NOT NULL,
            family_name                VARCHAR(255) NOT NULL,
            contact                    VARCHAR(255) NOT NULL,
            email                      VARCHAR(255) NOT NULL,
            consultlink                VARCHAR(500),
            slmc_registration_number   VARCHAR(50)  NOT NULL,
            qualifications             TEXT         NOT NULL,
            practitioner_address       TEXT         NOT NULL,
            institute_name             VARCHAR(255) NOT NULL,
            institute_contact          VARCHAR(255) NOT NULL,
            rubber_stamp_image         BYTEA        NOT NULL,
            active                     BOOLEAN      NOT NULL DEFAULT TRUE
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS patients (
            patient_id          SERIAL PRIMARY KEY,
            given_name          VARCHAR(255) NOT NULL,
            family_name         VARCHAR(255) NOT NULL,
            gender              VARCHAR(20)  NOT NULL,
            dob                 DATE,
            plang               VARCHAR(2)   CHECK (plang IN ('en','ta','si')),
            screening_ref       VARCHAR(255),
            n_id                VARCHAR(12)  UNIQUE
                                    CHECK (n_id IS NULL OR CHAR_LENGTH(n_id) IN (10, 12)),
            contact             VARCHAR(255),
            address             TEXT,
            master_consent_id   INTEGER,
            created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            deleted_at          TIMESTAMPTZ
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS profile (
            profile_id            SERIAL PRIMARY KEY,
            patient_id            INTEGER NOT NULL UNIQUE
                                      REFERENCES patients(patient_id) ON DELETE CASCADE,
            diseases              JSONB NOT NULL DEFAULT '[]'::jsonb,
            surgeries             JSONB NOT NULL DEFAULT '[]'::jsonb,
            allergies             JSONB NOT NULL DEFAULT '[]'::jsonb,
            existing_medications  JSONB NOT NULL DEFAULT '[]'::jsonb,
            smoking               VARCHAR(20) CHECK (smoking IN ('never','current','prior')),
            alcohol               VARCHAR(20) CHECK (alcohol IN ('none','occasional','regular')),
            occupation            VARCHAR(255),
            physical_activity     VARCHAR(255),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS consents (
            consent_id      SERIAL PRIMARY KEY,
            patient_id      INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
            scope           VARCHAR(20) NOT NULL CHECK (scope IN ('master','session')),
            version         VARCHAR(50),
            agreed          BOOLEAN NOT NULL,
            appointment_id  INTEGER,
            captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            revoked_at      TIMESTAMPTZ,
            reason          TEXT,
            CHECK (
                (scope = 'master'  AND appointment_id IS NULL AND version IS NOT NULL) OR
                (scope = 'session' AND appointment_id IS NOT NULL AND revoked_at IS NULL)
            )
        )
        """
    )

    op.execute("ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_master_consent_fk")
    op.execute(
        "ALTER TABLE patients "
        "ADD CONSTRAINT patients_master_consent_fk "
        "FOREIGN KEY (master_consent_id) REFERENCES consents(consent_id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS appointments (
            appointment_id        SERIAL PRIMARY KEY,
            patient_id            INTEGER NOT NULL REFERENCES patients(patient_id),
            doctor_id             INTEGER NOT NULL REFERENCES doctor(doctor_id),
            scheduled_at          TIMESTAMPTZ NOT NULL,
            status                VARCHAR(30) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                                      'scheduled','consent_pending','data_collection',
                                      'in_progress','awaiting_notes','completed','cancelled'
                                  )),
            cancellation_reason   TEXT,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_unique "
        "ON appointments (doctor_id, scheduled_at) WHERE status <> 'cancelled'"
    )

    op.execute("ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_appointment_fk")
    op.execute(
        "ALTER TABLE consents "
        "ADD CONSTRAINT consents_appointment_fk "
        "FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id) ON DELETE CASCADE"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS preconsultation (
            pr_id           SERIAL PRIMARY KEY,
            appointment_id  INTEGER NOT NULL UNIQUE
                                REFERENCES appointments(appointment_id) ON DELETE CASCADE,
            height          INTEGER CHECK (height BETWEEN 30 AND 250),
            weight          INTEGER CHECK (weight BETWEEN 1 AND 400),
            systolic        INTEGER CHECK (systolic BETWEEN 40 AND 260),
            diastolic       INTEGER CHECK (diastolic BETWEEN 20 AND 200),
            pulse           INTEGER CHECK (pulse BETWEEN 20 AND 250),
            temperature     NUMERIC(4,2) CHECK (temperature BETWEEN 25 AND 45),
            submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS consultations (
            consultation_id     SERIAL PRIMARY KEY,
            appointment_id      INTEGER NOT NULL UNIQUE
                                    REFERENCES appointments(appointment_id) ON DELETE CASCADE,
            status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft','completed')),
            notes_complaint     TEXT,
            notes_onset         TEXT,
            notes_symptoms      TEXT,
            notes_observations  TEXT,
            diagnoses           JSONB NOT NULL DEFAULT '[]'::jsonb,
            medications         JSONB NOT NULL DEFAULT '[]'::jsonb,
            labs                JSONB NOT NULL DEFAULT '[]'::jsonb,
            referrals           JSONB NOT NULL DEFAULT '[]'::jsonb,
            follow_up_date      DATE,
            signature           BYTEA,
            signed_at           TIMESTAMPTZ,
            CHECK (status = 'draft' OR (signature IS NOT NULL AND signed_at IS NOT NULL))
        )
        """
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS patients_name_trgm "
        "ON patients USING gin ((given_name || ' ' || family_name) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS appointments_doctor_time "
        "ON appointments (doctor_id, scheduled_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS appointments_patient_time "
        "ON appointments (patient_id, scheduled_at)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS appointments_status ON appointments (status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS consents_patient_scope "
        "ON consents (patient_id, scope, captured_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS consents_appointment "
        "ON consents (appointment_id) WHERE appointment_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS consultations_signed "
        "ON consultations (signed_at DESC) WHERE status = 'completed'"
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION reject_completed_update() RETURNS trigger AS $$
        BEGIN
            IF OLD.status = 'completed' THEN
                RAISE EXCEPTION 'record is locked' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )

    op.execute("DROP TRIGGER IF EXISTS consultations_locked_guard ON consultations")
    op.execute(
        "CREATE TRIGGER consultations_locked_guard "
        "BEFORE UPDATE OR DELETE ON consultations "
        "FOR EACH ROW EXECUTE FUNCTION reject_completed_update()"
    )

    op.execute("DROP TRIGGER IF EXISTS appointments_locked_guard ON appointments")
    op.execute(
        "CREATE TRIGGER appointments_locked_guard "
        "BEFORE UPDATE OR DELETE ON appointments "
        "FOR EACH ROW EXECUTE FUNCTION reject_completed_update()"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS appointments_locked_guard ON appointments")
    op.execute("DROP TRIGGER IF EXISTS consultations_locked_guard ON consultations")
    op.execute("DROP FUNCTION IF EXISTS reject_completed_update()")

    op.execute("DROP INDEX IF EXISTS consultations_signed")
    op.execute("DROP INDEX IF EXISTS consents_appointment")
    op.execute("DROP INDEX IF EXISTS consents_patient_scope")
    op.execute("DROP INDEX IF EXISTS appointments_status")
    op.execute("DROP INDEX IF EXISTS appointments_patient_time")
    op.execute("DROP INDEX IF EXISTS appointments_doctor_time")
    op.execute("DROP INDEX IF EXISTS patients_name_trgm")

    op.execute("DROP TABLE IF EXISTS consultations")
    op.execute("DROP TABLE IF EXISTS preconsultation")

    op.execute("ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_appointment_fk")
    op.execute("DROP INDEX IF EXISTS appointments_doctor_slot_unique")
    op.execute("DROP TABLE IF EXISTS appointments")

    op.execute("ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_master_consent_fk")
    op.execute("DROP TABLE IF EXISTS consents")
    op.execute("DROP TABLE IF EXISTS profile")
    op.execute("DROP TABLE IF EXISTS patients")
    op.execute("DROP TABLE IF EXISTS doctor")

    op.execute("DROP INDEX IF EXISTS accounts_one_healthworker_idx")
    op.execute("DROP INDEX IF EXISTS accounts_one_admin_idx")
    op.execute("DROP TABLE IF EXISTS accounts")
