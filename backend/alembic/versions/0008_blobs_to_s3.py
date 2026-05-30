"""move blob columns (signatures, stamps, attachment bytes) to S3 object keys

Revision ID: 0008_blobs_to_s3
Revises: 0007_relax_role_singletons
Create Date: 2026-05-29

The four blobs we used to store as Postgres BYTEA — doctor rubber stamps,
consent signatures, consultation signatures, and appointment attachment bytes
— now live in S3. Each column holds an opaque object key (see
services/storage.object_key) instead of the bytes; reads proxy back through
the API so patient PII stays behind the existing cookie auth.

We RENAME the columns rather than drop/add so Postgres rewrites the CHECK
expressions in place — the "signed when agreed" (consents) and "signature
present unless draft" (consultations) rules keep pointing at the renamed
column without us having to find and recreate the unnamed constraints. The
TYPE change uses `USING NULL`: this is a no-data cutover (everything is still
in testing), so there are no bytes to carry across.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0008_blobs_to_s3"
down_revision: Union[str, None] = "0007_relax_role_singletons"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # doctor.rubber_stamp_image (NOT NULL, no CHECK) -> rubber_stamp_key
    op.execute("ALTER TABLE doctor RENAME COLUMN rubber_stamp_image TO rubber_stamp_key")
    op.execute("ALTER TABLE doctor ALTER COLUMN rubber_stamp_key DROP NOT NULL")
    op.execute("ALTER TABLE doctor ALTER COLUMN rubber_stamp_key TYPE VARCHAR(512) USING NULL")
    op.execute("ALTER TABLE doctor ALTER COLUMN rubber_stamp_key SET NOT NULL")

    # consents.signature_image (nullable) -> signature_key.
    # The consents_signed_when_agreed CHECK rewrites to reference signature_key.
    op.execute("ALTER TABLE consents RENAME COLUMN signature_image TO signature_key")
    op.execute("ALTER TABLE consents ALTER COLUMN signature_key TYPE VARCHAR(512) USING NULL")

    # consultations.signature (nullable) -> signature_key.
    # The inline "status = 'draft' OR signature IS NOT NULL ..." CHECK rewrites too.
    op.execute("ALTER TABLE consultations RENAME COLUMN signature TO signature_key")
    op.execute("ALTER TABLE consultations ALTER COLUMN signature_key TYPE VARCHAR(512) USING NULL")

    # appointment_attachments.bytes (NOT NULL) -> object_key. byte_size/mime_type stay.
    op.execute("ALTER TABLE appointment_attachments RENAME COLUMN bytes TO object_key")
    op.execute("ALTER TABLE appointment_attachments ALTER COLUMN object_key DROP NOT NULL")
    op.execute("ALTER TABLE appointment_attachments ALTER COLUMN object_key TYPE VARCHAR(512) USING NULL")
    op.execute("ALTER TABLE appointment_attachments ALTER COLUMN object_key SET NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE appointment_attachments ALTER COLUMN object_key DROP NOT NULL")
    op.execute("ALTER TABLE appointment_attachments ALTER COLUMN object_key TYPE BYTEA USING NULL")
    op.execute("ALTER TABLE appointment_attachments ALTER COLUMN object_key SET NOT NULL")
    op.execute("ALTER TABLE appointment_attachments RENAME COLUMN object_key TO bytes")

    op.execute("ALTER TABLE consultations ALTER COLUMN signature_key TYPE BYTEA USING NULL")
    op.execute("ALTER TABLE consultations RENAME COLUMN signature_key TO signature")

    op.execute("ALTER TABLE consents ALTER COLUMN signature_key TYPE BYTEA USING NULL")
    op.execute("ALTER TABLE consents RENAME COLUMN signature_key TO signature_image")

    op.execute("ALTER TABLE doctor ALTER COLUMN rubber_stamp_key DROP NOT NULL")
    op.execute("ALTER TABLE doctor ALTER COLUMN rubber_stamp_key TYPE BYTEA USING NULL")
    op.execute("ALTER TABLE doctor ALTER COLUMN rubber_stamp_key SET NOT NULL")
    op.execute("ALTER TABLE doctor RENAME COLUMN rubber_stamp_key TO rubber_stamp_image")
