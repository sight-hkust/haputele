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


# (path, method, status) of endpoints that return JSON-shaped spec entries
# but carry no JSON contract. /health declares no response_model, so the
# spec shows a bare {type: object}; the rest return raw bytes (image/pdf/
# xlsx/zip) or webhook acks — FastAPI still documents them with an empty
# application/json schema because their handlers are annotated -> Response.
_ALLOWLIST = {
    ("/health", "get", 200),
    # Binary streams — raw bytes, no JSON contract to encode.
    ("/doctors/me/signature", "get", 200),
    ("/doctors/me/stamp", "get", 200),
    ("/appointments/{appt_id}/attachments/{attachment_id}", "get", 200),
    ("/capture/sessions/{session_id}/relay", "get", 200),
    ("/appointments/{appt_id}/summary.pdf", "get", 200),
    ("/exports/medications.xlsx", "get", 200),
    ("/exports/prescriptions.zip", "get", 200),
    # Third-party webhook acks — callers read status codes, not bodies.
    ("/livekit/webhook", "post", 200),
    ("/resend/webhook", "post", 200),
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


def _is_typed(schema: object) -> bool:
    """True when openapi-typescript can derive a real TS type from this schema.

    Bare objects map to Record<string, unknown> and itemless arrays to
    unknown[] — both erase the contract, so both count as untyped.
    """
    if not isinstance(schema, dict) or not schema:
        return False
    if schema.get("$ref") or schema.get("anyOf") or schema.get("oneOf") or schema.get("allOf"):
        return True
    if schema.get("properties"):
        return True
    if "items" in schema:
        return _is_typed(schema["items"])
    t = schema.get("type")
    # OpenAPI 3.1 can render nullable scalars as a type LIST, e.g.
    # {"type": ["string", "null"]}. Typed only if every member is a scalar;
    # any object/array member means the contract is eroded.
    if isinstance(t, list):
        return bool(t) and all(x in ("string", "integer", "number", "boolean", "null") for x in t)
    if t == "array" or t == "object":
        return False
    return t in ("string", "integer", "number", "boolean", "null")


def test_no_untyped_json_responses(client):
    """Every JSON response in the spec has a named, typed schema."""
    spec = client.get("/openapi.json").json()
    untyped = []
    for path, method, status, schema in _json_schemas(spec):
        if (path, method, status) in _ALLOWLIST:
            continue
        if not _is_typed(schema):
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
