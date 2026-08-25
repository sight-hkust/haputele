"""OpenAPI contract tests for the Kubb-generated frontend API layer.

Every JSON response must expose a typed schema, binary routes must advertise
their real media types, and authentication/error metadata must remain available
to generated clients.
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
    ("/consultations/{cid}/submit", "post", 200): (
        "SubmitConsultationResponse",
        "SubmitConsultationWithAppointmentResponse",
        "SubmitConsultationWithQueueResponse",
    ),
    ("/appointments/{appt_id}/cancel", "post", 200): (
        "AppointmentCancelResponse",
        "AppointmentCancelRequeueResponse",
    ),
    ("/queue/{qid}/book", "post", 200): "QueueBookResponse",
    ("/capture/{token}", "post", 201): "CaptureUploadOut",
    ("/doctors/invites", "post", 201): "DoctorInviteCreateOut",
    ("/doctors/{doctor_id}/reinvite-reapply", "post", 201): "DoctorInviteCreateOut",
    ("/sysadmin/me", "get", 200): "SysadminMeOut",
    ("/sysadmin/system-config", "get", 200): "SystemConfigOut",
    ("/sysadmin/system-config", "patch", 200): "SystemConfigOut",
}


def _is_typed(schema: object) -> bool:
    """True when Kubb can derive a meaningful type from this schema."""
    if not isinstance(schema, dict) or not schema:
        return False
    if schema.get("$ref"):
        return True
    for key in ("anyOf", "oneOf", "allOf"):
        branches = schema.get(key)
        if branches is not None:
            return bool(branches) and all(_is_typed(branch) for branch in branches)
    if schema.get("properties"):
        return True
    if "items" in schema:
        return _is_typed(schema["items"])
    t = schema.get("type")
    if isinstance(t, list):
        return bool(t) and all(x in ("string", "integer", "number", "boolean", "null") for x in t)
    if t in ("array", "object"):
        return False
    return t in ("string", "integer", "number", "boolean", "null")


def test_no_untyped_json_responses(client):
    """Every JSON response in the spec has a named, typed schema."""
    spec = client.get("/openapi.json").json()
    untyped = []
    for path, method, status, schema in _json_schemas(spec):
        if not _is_typed(schema):
            untyped.append(f"{method.upper()} {path} [{status}] -> {schema!r}")
    assert not untyped, (
        "these endpoints return JSON with an untyped schema in /openapi.json "
        "(declare a response_model):\n  " + "\n  ".join(untyped)
    )


def _refs(schema: dict) -> set[str]:
    if "$ref" in schema:
        return {schema["$ref"].rsplit("/", 1)[-1]}
    refs: set[str] = set()
    for key in ("anyOf", "oneOf", "allOf"):
        for branch in schema.get(key, []):
            refs.update(_refs(branch))
    return refs


def test_composite_responses_have_named_models(client):
    """Composite responses reference their declared wrapper model variants."""
    spec = client.get("/openapi.json").json()
    by_key = {(p, m, s): schema for p, m, s, schema in _json_schemas(spec)}
    for (path, method, status), expected in _WRAPPED.items():
        schema = by_key.get((path, method, status))
        assert schema is not None, f"{method.upper()} {path} [{status}] has no JSON schema"
        expected_refs = {expected} if isinstance(expected, str) else set(expected)
        assert _refs(schema) == expected_refs, (
            f"{method.upper()} {path} [{status}] expected {expected_refs}, got {schema!r}"
        )


def test_binary_and_empty_responses_use_real_media_types(client):
    spec = client.get("/openapi.json").json()
    expected = {
        ("/doctors/me/signature", "get"): {"image/png"},
        ("/doctors/me/stamp", "get"): {"image/png", "image/jpeg"},
        ("/appointments/{appt_id}/attachments/{attachment_id}", "get"): {
            "image/jpeg", "image/png", "image/webp",
        },
        ("/capture/sessions/{session_id}/relay", "get"): {
            "image/jpeg", "image/png", "image/webp",
        },
        ("/appointments/{appt_id}/summary.pdf", "get"): {"application/pdf"},
        ("/exports/medications.xlsx", "get"): {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        ("/exports/prescriptions.zip", "get"): {"application/zip"},
    }
    for (path, method), media_types in expected.items():
        content = spec["paths"][path][method]["responses"]["200"]["content"]
        assert set(content) == media_types
        assert all(schema["schema"].get("format") == "binary" for schema in content.values())

    for path in ("/livekit/webhook", "/resend/webhook"):
        response = spec["paths"][path]["post"]["responses"]["204"]
        assert "content" not in response


def test_security_and_error_contracts_are_generated(client):
    spec = client.get("/openapi.json").json()
    schemes = spec["components"]["securitySchemes"]
    assert schemes["SessionCookie"]["type"] == "apiKey"
    assert schemes["SessionCookie"]["in"] == "cookie"
    assert schemes["SessionCookie"]["name"] == "session"
    assert schemes["SetupBearer"]["type"] == "http"
    assert schemes["SetupBearer"]["scheme"] == "bearer"
    assert {"SessionCookie": []} in spec["paths"]["/patients"]["get"]["security"]
    assert {"SetupBearer": []} in spec["paths"]["/setup/initialize"]["post"]["security"]

    responses = spec["paths"]["/patients"]["get"]["responses"]
    for status in ("401", "403", "404", "409", "422", "500"):
        schema = responses[status]["content"]["application/json"]["schema"]
        assert schema["$ref"] == "#/components/schemas/ApiErrorResponse"


def test_generated_input_defaults_and_domain_literals(client):
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    queue_create = schemas["QueueEntryCreate"]
    assert set(queue_create["properties"]["source"]["enum"]) == {"screening", "walk_in"}
    assert "priority" not in queue_create["required"]
    assert "force" not in queue_create["required"]
    assert set(schemas["DoctorOut"]["properties"]["onboardingStatus"]["enum"]) == {
        "awaiting_setup", "awaiting_approval", "rejected", "active",
    }
    assert set(schemas["ConsentOut"]["properties"]["scope"]["enum"]) == {"master", "session"}
    assert set(schemas["CaptureSessionOut"]["properties"]["purpose"]["enum"]) == {
        "appointment_attachment", "rubber_stamp",
    }
