# API Contract Sync (OpenAPI → TypeScript) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the FastAPI backend's Pydantic models the single source of truth for the frontend wire types, by typing every JSON response in the OpenAPI spec, generating `frontend/src/types/generated.ts` from it, and enforcing a no-drift CI gate.

**Architecture:** Three phases. Phase A declares named Pydantic response models for the 20 endpoints that currently emit untyped `dict` responses in the spec (wire output is unchanged). Phase B generates TypeScript types from the spec with `openapi-typescript` and rewrites the hand-maintained `types/api.ts` as a thin alias layer over the generated file, so all 28 consumer files and `use-api.ts` keep compiling unchanged. Phase C adds a CI job that regenerates the types from the committed backend code and fails on any diff.

**Tech Stack:** FastAPI 0.141 + Pydantic v2 (spec: `POST /openapi.json`), pytest (backend contract tests), openapi-typescript v7 (types-only generation), Next.js 16 + tsc + Biome (frontend gates; the frontend has no unit-test runner), GitHub Actions.

---

## Context

### Current state

- Backend routers declare `response_model=dict` (or a bare `-> dict` return annotation) on 20 endpoints. In OpenAPI these come out as `{}` — the frontend sees `Record<string, unknown>` from any generator, worse than the current hand mirror.
- `frontend/src/types/api.ts` (617 lines) is a hand-maintained mirror of `backend/app/schemas.py` ("Mirror of backend/app/schemas.py output shapes" header). ~28 files import from `@/types/api`; `lib/use-api.ts` is the largest consumer.
- No sync process exists; drift surfaces at runtime. CI has a precedent for cross-repo parity checks: `tests/test_credential_policy_frontend_parity.py` + the `backend` paths-filter including `frontend/src/lib/credentials.ts` (see `.github/workflows/docker.yml`).

### The 20 untyped endpoints

| Endpoint | New response model |
|---|---|
| `POST /patients` | `PatientCreateResponse` |
| `GET /patients` | `PatientListResponse` |
| `GET /patients/{patient_id}` | `PatientDetailResponse` |
| `POST /patients/{patient_id}/consents` | `MasterConsentResponse` |
| `POST /patients/{patient_id}/consents/revoke` | `MasterConsentResponse` |
| `POST /appointments/{appt_id}/consent` | `SessionConsentResponse` |
| `GET /appointments/{appt_id}/preconsult` | `PreconsultGetResponse` |
| `PUT /appointments/{appt_id}/preconsult` | `PreconsultUpsertResponse` |
| `POST /appointments/{appt_id}/start-meeting` | `StartMeetingResponse` |
| `POST /appointments/{appt_id}/meeting-token` | `MeetingTokenResponse` |
| `POST /appointments/{appt_id}/consultation/draft` | `ConsultationDraftResponse` |
| `POST /consultations/{cid}/submit` | `SubmitConsultationResponse` |
| `POST /appointments/{appt_id}/cancel` | `AppointmentCancelResponse` |
| `POST /queue/{qid}/book` | `QueueBookResponse` |
| `POST /capture/{token}` | `CaptureUploadOut` |
| `POST /doctors/invites` | `DoctorInviteCreateOut` |
| `POST /doctors/{doctor_id}/reinvite-reapply` | `DoctorInviteCreateOut` |
| `GET /sysadmin/me` | `SysadminMeOut` |
| `GET /sysadmin/system-config` | `SystemConfigOut` |
| `PATCH /sysadmin/system-config` | `SystemConfigOut` |

### Decisions

1. **Types only, not generated hooks.** `use-api.ts` (44KB of session-gated fetchers, typed `ApiError`, cross-key invalidation) stays hand-written. Kubb/orval hook generation would replace or duplicate it. Only the *types* are generated.
2. **Alias layer, not consumer rewrite.** `types/api.ts` becomes a ~120-line alias module mapping legacy names (`Patient`) onto generated ones (`components["schemas"]["PatientOut"]`). All consumers unchanged; `tsc` proves parity.
3. **Wire-identical refactor.** The new `response_model`s only *declare* what the handlers already return. Existing endpoint tests assert exact response JSON — passing unchanged is the proof. Two endpoints conditionally omit keys (`submit_consultation`'s `followUp*`, `cancel_appointment`'s `queueEntry`), so those two decorators also set `response_model_exclude_none=True` — otherwise FastAPI emits explicit `null`s where the wire previously had absent keys. Guard: `tests/test_appointment_cancel_lifecycle.py:163` asserts `"queueEntry" not in r.json()`.
4. **Overlays stay hand-written.** `AppointmentStatus`, `LIVE_STATES`, `Role`, queue/code unions: the backend declares these as `str`/`Literal`s the UI needs narrower/differently. They live in the alias file, documented.
5. **Commit `generated.ts`, don't commit the spec.** CI regenerates from committed backend code, so a checked-in spec would be a second artifact to drift.
6. **Not in scope:** tightening `status: str` → `Literal` on backend models; typed error envelopes (`ApiError` stays custom); the raw-body `POST /doctor-onboarding/{token}/submit` endpoint (returns `Response` — no JSON content in the spec, frontend treats it opaquely).

### Prerequisites

- Local: Docker Desktop running; `docker compose up -d db rustfs` for backend tests (conftest creates `haputele_test`, alembic-migrates, wipes per test).
- Repo rule (docs/DEVELOPMENT.md): every change needs a GitHub issue and a branch. Create the issue, branch `feature/issue-<n>-openapi-type-sync`.
- TDD is the repo convention: write the failing test first.

---

## Phase A — Backend: name every composite response

### Task 1: Write the failing OpenAPI contract test

**Files:**
- Create: `backend/tests/test_openapi_response_models.py`

**Step 1: Create the test file**

```python
"""OpenAPI contract tests — the spec feeds `npm run generate:api` (frontend
codegen). A JSON endpoint whose response schema is an untyped dict comes out
as Record<string, unknown> on the TS side, silently erasing the contract.
These tests fail on every such endpoint so new ones can't ship untyped;
intentional exceptions are allowlisted with a reason.
"""
from typing import Iterator


def _json_schemas(spec: dict) -> Iterator[tuple[str, str, int, dict]]:
    """Yield (path, method, status, schema) for every JSON response."""
    for path, item in spec["paths"].items():
        for method, op in item.items():
            if method not in ("get", "post", "put", "patch", "delete"):
                continue
            for status, resp in op.get("responses", {}).items():
                content = resp.get("content", {})
                if "application/json" in content:
                    yield path, method, int(status), content["application/json"].get("schema", {})


# (path, method, status) of endpoints that return JSON but are deliberately
# untyped. /health is an infra probe the frontend never consumes, and
# `?full=true` injects a variable `dependencies` block.
_ALLOWLIST = {
    ("/health", "get", 200),
}

# The endpoints this change types, so the test documents the contract surface
# even after everything passes. Path params use the routers' declared names.
_WRAPPED = {
    ("/patients", "post", 201): "PatientCreateResponse",
    ("/patients", "get", 200): "PatientListResponse",
    ("/patients/{patient_id}", "get", 200): "PatientDetailResponse",
    ("/patients/{patient_id}/consents", "post", 201): "MasterConsentResponse",
    ("/patients/{patient_id}/consents/revoke", "post", 200): "MasterConsentResponse",
    ("/appointments/{appt_id}/consent", "post", 201): "SessionConsentResponse",
    ("/appointments/{appt_id}/preconsult", "get", 200): "PreconsultGetResponse",
    ("/appointments/{appt_id}/preconsult", "put", 200): "PreconsultUpsertResponse",
    ("/appointments/{appt_id}/start-meeting", "post", 200): "StartMeetingResponse",
    ("/appointments/{appt_id}/meeting-token", "post", 200): "MeetingTokenResponse",
    ("/appointments/{appt_id}/consultation/draft", "post", 200): "ConsultationDraftResponse",
    ("/consultations/{cid}/submit", "post", 200): "SubmitConsultationResponse",
    ("/appointments/{appt_id}/cancel", "post", 200): "AppointmentCancelResponse",
    ("/queue/{qid}/book", "post", 200): "QueueBookResponse",
    ("/capture/{token}", "post", 201): "CaptureUploadOut",
    ("/doctors/invites", "post", 201): "DoctorInviteCreateOut",
    ("/doctors/{doctor_id}/reinvite-reapply", "post", 201): "DoctorInviteCreateOut",
    ("/sysadmin/me", "get", 200): "SysadminMeOut",
    ("/sysadmin/system-config", "get", 200): "SystemConfigOut",
    ("/sysadmin/system-config", "patch", 200): "SystemConfigOut",
}


def test_no_untyped_json_responses(client):
    """Every JSON response in the spec has a named, typed schema."""
    spec = client.get("/openapi.json").json()
    untyped = []
    for path, method, status, schema in _json_schemas(spec):
        if (path, method, status) in _ALLOWLIST:
            continue
        if not (
            schema.get("$ref")
            or schema.get("properties")
            or schema.get("anyOf")
            or schema.get("oneOf")
            or schema.get("allOf")
        ):
            untyped.append(f"{method.upper()} {path} [{status}] -> {schema!r}")
    assert not untyped, (
        "these endpoints return JSON with an untyped schema in /openapi.json "
        "(declare a response_model):\n  " + "\n  ".join(untyped)
    )


def test_composite_responses_have_named_models(client):
    """The 20 composite responses reference the declared wrapper models."""
    spec = client.get("/openapi.json").json()
    by_key = {(p, m, s): schema for p, m, s, schema in _json_schemas(spec)}
    for (path, method, status), name in _WRAPPED.items():
        schema = by_key.get((path, method, status))
        assert schema is not None, f"{method.upper()} {path} [{status}] has no JSON schema"
        assert schema.get("$ref") == f"#/components/schemas/{name}", (
            f"{method.upper()} {path} [{status}] expected $ref {name}, got {schema!r}"
        )
```

**Step 2: Run it — expect failure**

```bash
cd backend
DATABASE_URL=postgresql+psycopg2://hapu:hapu@localhost:5432/haputele_test \
S3_ENDPOINT_URL=http://localhost:9000 S3_ACCESS_KEY_ID=rustfsadmin \
S3_SECRET_ACCESS_KEY=rustfsadmin S3_REGION=us-east-1 S3_BUCKET=haputele \
S3_FORCE_PATH_STYLE=true pytest tests/test_openapi_response_models.py -v
```

Expected: `test_no_untyped_json_responses` FAILS listing the 20 endpoints (schemas render as `{}` or `{'title': ..., 'type': 'object'}`); `test_composite_responses_have_named_models` FAILS with "has no JSON schema"/"expected $ref".

**Step 3: Commit the failing test**

```bash
git add backend/tests/test_openapi_response_models.py
git commit -m "test(api): fail on untyped JSON responses in the OpenAPI spec"
```

### Task 2: Add the 18 wrapper response models to schemas.py

**Files:**
- Modify: `backend/app/schemas.py` (append at end of file, after `CapturePeekOut`)

**Step 1: Append the models**

```python
# ── Composite endpoint responses ─────────────────────────────────────
# Named response models for endpoints that previously declared
# `response_model=dict` (or a bare `-> dict` return). The OpenAPI spec —
# and the frontend codegen it feeds — needs declared shapes; a bare dict
# comes out as an untyped object on the TS side. Wire output is unchanged:
# these only declare what the handlers already return.


class PatientCreateResponse(BaseModel):
    """POST /patients — the new patient plus its signed master consent."""

    patient: PatientOut
    masterConsent: ConsentOut


class PatientListResponse(BaseModel):
    """GET /patients — one search page."""

    patients: list[PatientOut]
    page: int


class PatientDetailResponse(BaseModel):
    """GET /patients/{id} — profile is null until the first intake save."""

    patient: PatientOut
    profile: ProfileOut | None


class MasterConsentResponse(BaseModel):
    """POST /patients/{id}/consents (and .../revoke)."""

    masterConsent: ConsentOut


class SessionConsentResponse(BaseModel):
    """POST /appointments/{id}/consent."""

    consent: ConsentOut
    appointment: AppointmentOut


class PreconsultGetResponse(BaseModel):
    """GET /appointments/{id}/preconsult — `editable` mirrors the backend
    state gate (consent_pending / data_collection)."""

    preconsult: PreconsultOut | None
    appointment: AppointmentOut
    editable: bool


class PreconsultUpsertResponse(BaseModel):
    """PUT /appointments/{id}/preconsult."""

    preconsult: PreconsultOut
    appointment: AppointmentOut


class MeetingTokenResponse(BaseModel):
    """LiveKit join credentials, minted per role."""

    room: str
    token: str
    serverUrl: str


class StartMeetingResponse(MeetingTokenResponse):
    """POST /appointments/{id}/start-meeting — token payload plus the
    appointment flipped to in_progress."""

    appointment: AppointmentOut


class ConsultationDraftResponse(BaseModel):
    """POST /appointments/{id}/consultation/draft."""

    consultationId: int
    draft: ConsultationOut


class SubmitConsultationResponse(BaseModel):
    """POST /consultations/{id}/submit — the follow-up keys appear only when
    the doctor opted into an exact appointment / N-weeks follow-up."""

    consultation: ConsultationOut
    appointment: AppointmentOut
    followUpAppointment: AppointmentOut | None = None
    followUpQueueEntry: QueueEntryOut | None = None


class AppointmentCancelResponse(BaseModel):
    """POST /appointments/{id}/cancel — queueEntry appears only when the
    healthworker opted into re-queueing."""

    appointment: AppointmentOut
    queueEntry: QueueEntryOut | None = None


class QueueBookResponse(BaseModel):
    """POST /queue/{id}/book."""

    queueEntry: QueueEntryOut
    appointment: AppointmentOut


class CaptureUploadOut(BaseModel):
    """POST /capture/{token} — upload ack from the phone relay. `purpose`
    stays `str`: the value is validated when the session is minted."""

    ok: bool
    purpose: str


class DoctorInviteCreateOut(BaseModel):
    """POST /doctors/invites and POST /doctors/{id}/reinvite-reapply."""

    inviteId: int
    email: str


class SysadminMeOut(BaseModel):
    """GET /sysadmin/me."""

    username: str
    role: str
    fullName: str | None = None
    contact: str | None = None


class SystemConfigOut(BaseModel):
    """GET/PATCH /sysadmin/system-config."""

    initializedAt: datetime | None
    instituteName: str | None
    instituteAddressLines: list[str] | None
    instituteContactPhone: str | None
    instituteContactEmail: str | None
    appTimezone: str | None
    exportTimezone: str | None
    masterConsentVersion: str | None
```

`BaseModel`, `datetime` and all referenced `*Out` models are already imported in schemas.py — no import changes needed.

**Step 2: Sanity check the models import**

```bash
cd backend && python -c "from app.schemas import PatientCreateResponse, SystemConfigOut; print('ok')"
```

Expected: `ok`.

**Step 3: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat(api): add named response models for composite endpoints"
```

### Task 3: Wire response_model into patients.py and preconsult.py

**Files:**
- Modify: `backend/app/routers/patients.py` (5 endpoints)
- Modify: `backend/app/routers/preconsult.py` (5 endpoints)

**Step 1: patients.py — extend the schemas import**

Add to the existing `from ..schemas import (...)` block: `PatientCreateResponse`, `PatientListResponse`, `PatientDetailResponse`, `MasterConsentResponse`.

**Step 2: patients.py — swap the five decorators**

- `create_patient` (~line 46): `response_model=dict` → `response_model=PatientCreateResponse`
- `list_patients` (~line 104): `response_model=dict` → `response_model=PatientListResponse`
- `get_patient` (~line 129): `response_model=dict` → `response_model=PatientDetailResponse`
- `re_consent` (~line 244): `response_model=dict` → `response_model=MasterConsentResponse`
- `revoke_consent` (~line 270): `response_model=dict` → `response_model=MasterConsentResponse`

Return statements stay untouched — FastAPI validates the existing dicts against the models.

**Step 3: preconsult.py — extend the schemas import**

Add: `SessionConsentResponse`, `PreconsultGetResponse`, `PreconsultUpsertResponse`, `StartMeetingResponse`, `MeetingTokenResponse`.

**Step 4: preconsult.py — swap the five decorators**

- `record_session_consent` (~line 63): → `response_model=SessionConsentResponse`
- `get_preconsult` (~line 116): → `response_model=PreconsultGetResponse`
- `upsert_preconsult` (~line 127): → `response_model=PreconsultUpsertResponse`
- `start_meeting` (~line 207): → `response_model=StartMeetingResponse`
- `meeting_token` (~line 230): → `response_model=MeetingTokenResponse`

Note: `start_meeting` returns `{"appointment": ..., **token_payload}` — the merged dict satisfies `StartMeetingResponse`.

**Step 5: Run the contract test**

```bash
cd backend && pytest tests/test_openapi_response_models.py -v
```

Expected: failures drop from 20 to 10 (all remaining are Phase-A endpoints not yet wired). This confirms the partial red state.

**Step 6: Commit**

```bash
git add backend/app/routers/patients.py backend/app/routers/preconsult.py
git commit -m "feat(api): type patients and preconsult composite responses"
```

### Task 4: Wire response_model into consultations, appointments, queue

**Files:**
- Modify: `backend/app/routers/consultations.py` (2 endpoints)
- Modify: `backend/app/routers/appointments.py` (1 endpoint)
- Modify: `backend/app/routers/queue.py` (1 endpoint)

**Step 1: consultations.py**

Add `ConsultationDraftResponse`, `SubmitConsultationResponse` to the `from ..schemas import (...)` block (lines 12-19). Swap:

- `create_or_get_draft` (~line 49): → `response_model=ConsultationDraftResponse`
- `submit_consultation` (~line 122): → `response_model=SubmitConsultationResponse`, **`response_model_exclude_none=True`** — `followUpAppointment`/`followUpQueueEntry` are conditionally absent; without this the wire gains explicit `null`s. The `= None` model defaults absorb the missing keys on validation.

Note: `submit_consultation` adds `followUpAppointment`/`followUpQueueEntry` keys conditionally — the `= None` defaults in the model absorb the missing keys on validation. Leave the local `from ..schemas import QueueEntryOut` inside the function (line 215) as-is.

**Step 2: appointments.py**

Add `AppointmentCancelResponse` to the schemas import block. Swap `cancel_appointment` (~line 247): → `response_model=AppointmentCancelResponse`, **`response_model_exclude_none=True`** — `queueEntry` is present only on opt-in requeue; `test_appointment_cancel_lifecycle.py:163` asserts `"queueEntry" not in r.json()`, so a stray `null` key goes red here.

**Step 3: queue.py**

Add `QueueBookResponse` to the schemas import block. Swap `book_queue_entry` (~line 162): → `response_model=QueueBookResponse`.

**Step 4: Run the contract test**

```bash
cd backend && pytest tests/test_openapi_response_models.py -v
```

Expected: failures drop to 6 (capture, doctors×2, sysadmin×3).

**Step 5: Commit**

```bash
git add backend/app/routers/consultations.py backend/app/routers/appointments.py backend/app/routers/queue.py
git commit -m "feat(api): type consultation, cancel and queue-book responses"
```

### Task 5: Wire response_model into capture, doctors, sysadmin

**Files:**
- Modify: `backend/app/routers/capture.py` (1 endpoint)
- Modify: `backend/app/routers/doctors.py` (2 endpoints)
- Modify: `backend/app/routers/sysadmin.py` (3 endpoints)

**Step 1: capture.py**

Add `CaptureUploadOut` to the schemas import block. On `upload_capture` (~line 186), the decorator currently has only `status_code` — add `response_model=CaptureUploadOut`:

```python
@router.post("/{token}", status_code=status.HTTP_201_CREATED, response_model=CaptureUploadOut)
```

**Step 2: doctors.py**

Add `DoctorInviteCreateOut` to the schemas import block. Swap:

- `invite_new_doctor` (~line 227): add `response_model=DoctorInviteCreateOut` to the decorator
- `reinvite_reapply` (~line 457): add `response_model=DoctorInviteCreateOut` to the decorator

Both return `{"inviteId": invite.id, "email": invite.email}` — the shared model covers both.

**Step 3: sysadmin.py**

sysadmin.py has **no** `from ..schemas import` (it defines `SystemConfigUpdateIn` locally). Add one after the `..models` import (line 24):

```python
from ..schemas import SysadminMeOut, SystemConfigOut
```

Then add `response_model=` to the three bare decorators:

- `me` (~line 40): `@router.get("/me", response_model=SysadminMeOut)`
- `system_config` (~line 57): `@router.get("/system-config", response_model=SystemConfigOut)`
- `update_system_config` (~line 94): `@router.patch("/system-config", response_model=SystemConfigOut)`

**Step 4: Run the contract test — expect pass**

```bash
cd backend && pytest tests/test_openapi_response_models.py -v
```

Expected: both tests PASS (2 passed).

**Step 5: Run the full backend suite — the wire-identity proof**

```bash
cd backend
DATABASE_URL=postgresql+psycopg2://hapu:hapu@localhost:5432/haputele_test \
S3_ENDPOINT_URL=http://localhost:9000 S3_ACCESS_KEY_ID=rustfsadmin \
S3_SECRET_ACCESS_KEY=rustfsadmin S3_REGION=us-east-1 S3_BUCKET=haputele \
S3_FORCE_PATH_STYLE=true pytest tests/ -v
```

Expected: everything passes unchanged (exit 0). The existing endpoint tests assert exact response JSON — if any wrapper model declared a field wrong, `ResponseValidationError` would surface here. Passing = wire output is byte-identical.

**Step 6: Commit**

```bash
git add backend/app/routers/capture.py backend/app/routers/doctors.py backend/app/routers/sysadmin.py
git commit -m "feat(api): type capture, invite and sysadmin responses"
```

### Task 6: Add the spec-export script

**Files:**
- Create: `backend/app/scripts/export_openapi.py`

**Step 1: Create the script**

```python
"""Dump the OpenAPI schema for the frontend type generator.

Usage:
    python backend/app/scripts/export_openapi.py frontend/openapi.json

No DB/S3 needed: importing the app does not run the lifespan hook (that
only fires on server startup), and `app.openapi()` builds the schema
entirely from the declared routes and Pydantic models.

The script writes to a file argument instead of stdout because
observability.configure_logging() installs a `sys.stdout` handler at app
construction — any future import-time log line would silently corrupt a
shell-redirected file.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.main import app  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python backend/app/scripts/export_openapi.py <output-path>")
    out = Path(sys.argv[1])
    out.write_text(json.dumps(app.openapi(), indent=2) + "\n")
    print(f"wrote {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
```

**Step 2: Run it and spot-check the new $refs**

```bash
python backend/app/scripts/export_openapi.py /tmp/spec-check.json
python - <<'PY'
import json
spec = json.load(open("/tmp/spec-check.json"))
schemas = spec["components"]["schemas"]
for name in ("PatientCreateResponse", "SubmitConsultationResponse",
             "QueueBookResponse", "SystemConfigOut", "CaptureUploadOut",
             "DoctorInviteCreateOut"):
    assert name in schemas, f"missing {name}"
print(f"ok — {len(schemas)} schema components")
PY
```

Expected: `ok — <count>` with no assertion error.

**Step 3: Commit**

```bash
git add backend/app/scripts/export_openapi.py
git commit -m "feat(api): add OpenAPI export script for frontend codegen"
```

---

## Phase B — Frontend: generated types + alias cutover

### Task 7: Install openapi-typescript and wire the generate script

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/.gitignore`
- Modify: `frontend/biome.json`

**Step 1: Install the dev dependency**

```bash
cd frontend && npm install -D openapi-typescript --legacy-peer-deps
```

(`--legacy-peer-deps` matches the repo convention from the Dockerfile/CI — @fullcalendar's intra-package peer conflict breaks strict resolution.)

**Step 2: Add the generate script to package.json**

In `scripts`:

```json
"generate:api": "openapi-typescript openapi.json -o src/types/generated.ts"
```

**Step 3: Gitignore the intermediate spec**

Append to `frontend/.gitignore`:

```
openapi.json
```

**Step 4: Exclude the generated file from Biome**

In `frontend/biome.json`, `files` becomes:

```json
"files": {
  "ignoreUnknown": true,
  "includes": ["**", "!src/types/generated.ts"]
}
```

Biome skips the generated file entirely (its formatting is the generator's); `tsc` still type-checks it via tsconfig.

**Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.gitignore frontend/biome.json
git commit -m "chore(frontend): add openapi-typescript generation script"
```

### Task 8: Generate the types for the first time

**Step 1: Dump the spec and generate**

```bash
python backend/app/scripts/export_openapi.py frontend/openapi.json
cd frontend && npm run generate:api
```

Expected: `wrote frontend/openapi.json` on stderr, exit 0; `src/types/generated.ts` created (~2-4k lines: 90+ schema components and all `paths`/`operations`).

**Step 2: Inspect the output**

```bash
cd frontend
wc -l src/types/generated.ts
grep -c "PatientOut" src/types/generated.ts
```

Expected: a plausible line count and ≥1 match for `PatientOut`. Sanity-read the top of the file — it exports `components`, `paths`, `operations`.

**Step 3: Commit the generated baseline**

```bash
git add frontend/src/types/generated.ts
git commit -m "feat(frontend): generate API types from the OpenAPI spec"
```

### Task 9: Rewrite types/api.ts as the alias layer

**Files:**
- Modify: `frontend/src/types/api.ts` (full rewrite — save a backup first)

**Step 1: Back up the current mirror**

```bash
cp frontend/src/types/api.ts /tmp/api.ts.mirror-bak
```

The overlay blocks (unions + `LIVE_STATES` values) must be copied **verbatim** from this backup — do not re-type them.

**Step 2: Replace the file**

New `frontend/src/types/api.ts`:

```ts
// Wire-contract types for the FastAPI backend.
//
// Everything here is either:
//   1. an alias onto OpenAPI-generated types (src/types/generated.ts,
//      regenerated via `npm run generate:api`; CI fails when it drifts), or
//   2. a hand-written overlay the spec can't express: several enums are
//      declared as plain `str` on the backend, so the UI unions live here.
//
// Backend class names are the source of truth; the aliases preserve the
// historical frontend names so call sites stay stable. If a backend model
// is renamed, update only the alias below.

import type { components } from "./generated";

type Schemas = components["schemas"];

// ── Overlays: backend declares these as plain `str` ──────────────────
// Copy the value lists VERBATIM from the pre-rewrite file (/tmp/api.ts.mirror-bak).

export type Role = "admin" | "doctor" | "healthworker" | "sys-admin";
export type Lang = "en" | "ta" | "si";

// §11 appointment state machine (values verbatim from the old file).
export type AppointmentStatus = /* verbatim union */;
export const LIVE_STATES: AppointmentStatus[] = /* verbatim array */;

export type CapturePurpose = "appointment_attachment" | "rubber_stamp";
export type OperatingAccountRole = "admin" | "healthworker";
export type AccountRole = "sys-admin" | "admin" | "healthworker" | "doctor";
export type QueueSource = /* verbatim union */;
export type QueueStatus = /* verbatim union */;
export type QueuePriority = /* verbatim union */;
export type DiseaseCode = /* verbatim union */;
export type DiagnosisCode = /* verbatim union */;

// ── Entities ─────────────────────────────────────────────────────────
export type Patient = Schemas["PatientOut"];
export type Doctor = Schemas["DoctorOut"];
export type DoctorSummary = Schemas["DoctorSummaryOut"];
export type DoctorInvite = Schemas["DoctorInviteOut"];
export type Consent = Schemas["ConsentOut"];
export type Appointment = Schemas["AppointmentOut"];
export type CalendarAppointment = Schemas["CalendarAppointmentOut"];
export type Preconsult = Schemas["PreconsultOut"];
export type Profile = Schemas["ProfileOut"];
export type Consultation = Schemas["ConsultationOut"];
export type Notes = Schemas["NotesPatch"];
export type AttachmentMeta = Schemas["AttachmentMetaOut"];
export type AppointmentDetail = Schemas["AppointmentDetailOut"];
export type HistoryConsultationItem = Schemas["HistoryConsultationItem"];
export type PatientHistory = Schemas["PatientHistoryOut"];
export type Availability = Schemas["AvailabilityOut"];
export type QueueEntry = Schemas["QueueEntryOut"];
export type CaptureSession = Schemas["CaptureSessionOut"];
export type CaptureSessionStatus = Schemas["CaptureSessionStatusOut"];
export type AccountRosterEntry = Schemas["AccountRow"];
export type SysadminMe = Schemas["SysadminMeOut"];
export type SystemConfig = Schemas["SystemConfigOut"];
export type SetupStatusResponse = Schemas["SetupStatusOut"];
export type VerifySetupTokenResponse = Schemas["VerifyTokenOut"];
export type InitializeSystemResponse = Schemas["InitializeOut"];

// JSONB entry shapes — backend names match 1:1.
export type DiseaseEntry = Schemas["DiseaseEntry"];
export type SurgeryEntry = Schemas["SurgeryEntry"];
export type AllergyEntry = Schemas["AllergyEntry"];
export type ExistingMedicationEntry = Schemas["ExistingMedicationEntry"];
export type Lifestyle = Schemas["Lifestyle"];
export type DiagnosisEntry = Schemas["DiagnosisEntry"];
export type MedicationEntry = Schemas["MedicationEntry"];
export type LabEntry = Schemas["LabEntry"];
export type ReferralEntry = Schemas["ReferralEntry"];

// ── Requests ─────────────────────────────────────────────────────────
export type PatientCreateRequest = Schemas["PatientCreate"];
export type PatientUpdateRequest = Schemas["PatientUpdate"];
export type ProfileRequest = Schemas["ProfileIn"];
export type PreconsultRequest = Schemas["PreconsultIn"];
export type SessionConsentRequest = Schemas["SessionConsentIn"];
export type ReConsentRequest = Schemas["ReConsentIn"];
export type SubmitConsultationRequest = Schemas["ConsultationSubmitIn"];
export type FollowUpInput =
  | Schemas["FollowUpAppointment"]
  | Schemas["FollowUpWeeks"];
export type QueueEntryCreateRequest = Schemas["QueueEntryCreate"];
export type QueueEntryUpdateRequest = Schemas["QueueEntryUpdate"];
export type QueueBookRequest = Schemas["QueueBookIn"];
export type QueueCancelRequest = Schemas["QueueCancelIn"];
export type AppointmentCancelRequest = Schemas["AppointmentCancelIn"];
export type RequeueOnCancelInput = Schemas["RequeueOnCancel"];
export type ResetAccountPasswordRequest = Schemas["PasswordResetIn"];
export type CreateOperatingAccountRequest = Schemas["AccountCreateIn"];
export type CreateOperatingAccountResponse = Schemas["AccountOut"];
export type AccountUpdateRequest = Schemas["AccountUpdateIn"];
export type SystemConfigUpdateRequest = Schemas["SystemConfigUpdateIn"];
export type VerifySetupTokenRequest = Schemas["VerifyTokenIn"];
export type InitializeSystemRequest = Schemas["InitializeIn"];
export type AvailabilityCreateRequest = Schemas["AvailabilityCreate"];
export type AvailabilityUpdateRequest = Schemas["AvailabilityUpdate"];
export type AvailabilityBulkCreateRequest = Schemas["AvailabilityBulkCreate"];

// ── Composite responses (backend models from Phase A) ────────────────
export type PatientListResponse = Schemas["PatientListResponse"];
export type PatientCreateResponse = Schemas["PatientCreateResponse"];
export type PatientDetailResponse = Schemas["PatientDetailResponse"];
export type MasterConsentResponse = Schemas["MasterConsentResponse"];
export type SessionConsentResponse = Schemas["SessionConsentResponse"];
export type ReConsentResponse = Schemas["MasterConsentResponse"];
export type MeetingTokenResponse = Schemas["MeetingTokenResponse"];
export type StartMeetingResponse = Schemas["StartMeetingResponse"];
export type QueueBookResponse = Schemas["QueueBookResponse"];
export type AppointmentCancelResponse = Schemas["AppointmentCancelResponse"];
export type SubmitConsultationResponse = Schemas["SubmitConsultationResponse"];
export type ConsultationDraftResponse = Schemas["ConsultationDraftResponse"];
```

Replace every `/* verbatim */` placeholder with the exact text from the backup file — these are the only values that must not be guessed.

**Step 3: Delete the now-duplicated local type**

`ConsultationDraftResponse` currently lives in `frontend/src/lib/use-api.ts` (line 531: `export type ConsultationDraftResponse = { consultationId: number; draft: Consultation };`). The alias file now owns it: delete that line from use-api.ts and add `ConsultationDraftResponse` to the `import type { ... } from "@/types/api"` block at the top of the file.

**Step 4: Type-check and fix mapping gaps**

```bash
cd frontend && npm run typecheck
```

Expected on first run: possibly a handful of errors if any generated schema name differs from this table. For each error, open `src/types/generated.ts` (search the class name), confirm the real schema key, and fix the alias. Do **not** edit consumer files — the alias is the single correction point. Expected result when done: exit 0, zero output.

**Step 5: Lint and format**

```bash
cd frontend && npm run lint
```

Expected: pass (generated.ts is excluded; the alias file follows Biome's existing style — fix any formatting complaints with `npx biome format --write src/types/api.ts`).

**Step 6: Full build — the end-to-end gate**

```bash
cd frontend && npm run build
```

Expected: `next build` completes. This is the frontend's real contract gate: every consumer (28 importers + `use-api.ts`) compiles against the aliases.

**Step 7: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/lib/use-api.ts
git commit -m "refactor(frontend): derive types/api from generated OpenAPI types"
```

---

## Phase C — CI drift gate + docs

### Task 10: Add the api-types-drift CI job

**Files:**
- Modify: `.github/workflows/docker.yml`

**Step 1: Add a paths-filter output to the `changes` job**

In the `outputs:` block of `changes` (next to `backend`, `frontend`):

```yaml
      api-types: ${{ steps.filter.outputs.api-types }}
```

In the `filters:` block:

```yaml
            api-types:
              - 'backend/**'
              - 'frontend/src/types/**'
```

(The filter deliberately includes `frontend/src/types/**` so a frontend-only PR that hand-edits the types also runs the gate — the same trick as the existing `backend` filter including `frontend/src/lib/credentials.ts`.)

**Step 2: Add the job between `backend-test` and `frontend-checks`**

```yaml
  # OpenAPI drift gate: regenerates frontend/src/types/generated.ts from the
  # backend spec and fails on any diff. A backend PR that changes a schema
  # without regenerating the frontend types is red here instead of shipping
  # a runtime type mismatch. Mirrors the existing credential-parity test.
  api-types-drift:
    needs: changes
    if: >-
      github.ref_type == 'tag' ||
      github.event_name == 'workflow_dispatch' ||
      needs.changes.outputs.api-types == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: backend/requirements-dev.txt
      - name: Install backend dependencies
        run: pip install -r backend/requirements-dev.txt
      - name: Export OpenAPI spec
        run: python backend/app/scripts/export_openapi.py openapi.json
      - uses: actions/setup-node@v5
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install frontend dependencies
        run: npm ci --legacy-peer-deps
        working-directory: frontend
      - name: Regenerate API types
        run: npx openapi-typescript ../openapi.json -o src/types/generated.ts
        working-directory: frontend
      - name: Fail on drift
        run: git diff --exit-code -- frontend/src/types/generated.ts
```

Note: no DB/S3 services needed — the export script builds the schema without connecting to anything (Task 6 comment explains why).

**Step 3: Verify the drift logic locally (once)**

Clean state first:

```bash
cd frontend && npm run generate:api
git diff --exit-code -- src/types/generated.ts && echo "clean (exit 0)"
```

Then simulate drift in the direction CI actually guards against — backend schema changed, committed types stale. Add a temporary field to `SystemConfigOut` in `backend/app/schemas.py` (e.g. `driftProbe: str | None = None`), then from the repo root:

```bash
python backend/app/scripts/export_openapi.py frontend/openapi.json
cd frontend && npm run generate:api
git diff --exit-code -- src/types/generated.ts || echo "drift detected (exit 1) — correct"
```

Expected: exit 1, diff shows `driftProbe`. Revert the schemas.py edit, re-export, regenerate, confirm exit 0 again. (The naive variant — appending a marker line to generated.ts and regenerating — is a no-op: regeneration removes the marker before the diff runs, so it can't demonstrate anything. Drift only exists when the backend changes and the committed types don't follow.)

**Step 4: Commit**

```bash
git add .github/workflows/docker.yml
git commit -m "ci: fail when generated API types drift from the backend spec"
```

### Task 11: Document the sync workflow

**Files:**
- Modify: `docs/DEVELOPMENT.md` (append section 5 after the PR & Review Process section)

**Step 1: Append the section**

```markdown
---

## 5. API Contract Sync (OpenAPI → TypeScript)

Backend Pydantic models are the single source of truth for the wire contract.
`frontend/src/types/generated.ts` is generated from the backend's OpenAPI
spec; `frontend/src/types/api.ts` is a thin alias layer over it (plus a few
hand-written unions the spec can't express).

**When a backend PR adds or changes an endpoint schema:**

1. Declare every JSON response as a Pydantic model (`response_model=`), never
   a bare `dict` — `backend/tests/test_openapi_response_models.py` fails CI
   on any untyped JSON response.
2. Regenerate the frontend types:
   ```bash
   python backend/app/scripts/export_openapi.py frontend/openapi.json
   cd frontend && npm run generate:api
   ```
3. If a schema was renamed, update the alias in `frontend/src/types/api.ts`.
   The old name must keep pointing at the new schema — call sites stay stable.
4. Commit `frontend/src/types/generated.ts` in the same PR as the backend
   change. CI (`api-types-drift` job) regenerates from the committed backend
   code and fails on any diff.
```

**Step 2: Commit**

```bash
git add docs/DEVELOPMENT.md
git commit -m "docs: document the OpenAPI to TypeScript sync workflow"
```

### Task 12: Final verification

**Step 1: Backend suite**

```bash
cd backend
DATABASE_URL=postgresql+psycopg2://hapu:hapu@localhost:5432/haputele_test \
S3_ENDPOINT_URL=http://localhost:9000 S3_ACCESS_KEY_ID=rustfsadmin \
S3_SECRET_ACCESS_KEY=rustfsadmin S3_REGION=us-east-1 S3_BUCKET=haputele \
S3_FORCE_PATH_STYLE=true pytest tests/ -v
```

Expected: all pass, including `test_openapi_response_models.py::test_no_untyped_json_responses` and `...::test_composite_responses_have_named_models`.

**Step 2: Frontend gates**

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

Expected: all three exit 0.

**Step 3: Regeneration is a no-op**

```bash
python backend/app/scripts/export_openapi.py frontend/openapi.json
cd frontend && npm run generate:api
git status --porcelain frontend/src/types/generated.ts
```

Expected: empty output (regeneration is byte-stable).

**Step 4: Repo rule compliance + push**

```bash
git status
git push -u origin feature/issue-<n>-openapi-type-sync
```

Open the PR per docs/DEVELOPMENT.md §4 (link the issue with `Closes #<n>`, describe How to Test: run the backend contract test + `npm run generate:api` + `npm run typecheck`). CI runs: `api-types-drift` (green), `backend-test`, `frontend-checks`, `build`.

---

## Rollback notes

- Phase A alone is safe to ship: wire-identical, protected by the full backend suite.
- Phase B changes only the type *source*; the alias layer guarantees the same names, so rollback is `git revert` of the two commits.
- If a generated schema name in Task 9's table turns out wrong, the fix is one alias line — no consumer edits.
