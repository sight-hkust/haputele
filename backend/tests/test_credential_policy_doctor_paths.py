"""Credential-policy coverage for the four doctor write paths.

`test_credential_policy_api.py` covers the operating-account endpoints.
These four were the untested ones, and that matters more than usual here:
services/credentials.py's own docstring records that the *previous* design
reached only 3 of the 7 credential-setting paths, and the four it missed were
exactly these. Every unit test still passed.

The new design attaches the rules to the field's type, which is a better fix
— but "cannot be forgotten" is a claim about wiring, and only a wire-level
test can check wiring. Delete `NewPassword` from a schema and nothing else in
the suite notices.

Four assertions per path:

  A1  edge whitespace is refused, with a specific code
  A2  an internal-whitespace passphrase is accepted AND can then log in,
      while its trimmed variant CANNOT
  A3  weak / too-short produce the same codes and the same minimum as
      everywhere else
  A4  what was submitted is what got stored, byte for byte

A2's second half is the original bug: writes trimmed, login didn't, and the
account could never authenticate. A round-trip that only checks the happy
value would have passed back then too.

Coverage map. Two cells on the rotation path predate this file and are NOT
duplicated here — a second copy of an existing assertion just drifts from
the original, and "write the rule down once" is the whole point:

    path 5  POST /doctors
      A1  test_create_doctor_rejects_whitespace_username (3 positions)
          test_create_doctor_rejects_edge_whitespace_password (both edges)
      A2  test_create_doctor_passphrase_round_trips
      A3  test_create_doctor_rejects_short_password (min == 10)
          test_create_doctor_rejects_weak_password
      A4  test_create_doctor_passphrase_round_trips (Account + Doctor)

    path 6  PATCH /doctors/{doctor_id}
      A1  test_update_doctor_rejects_edge_whitespace_password (both edges)
      A2  test_update_doctor_passphrase_round_trips
      A3  test_update_doctor_rejects_short_password (min == 10)
          test_update_doctor_rejects_weak_password
      A4  test_update_doctor_passphrase_round_trips
          test_update_doctor_omitting_password_leaves_it_unchanged
          test_update_doctor_explicit_null_password_is_a_no_op

    path 7  POST /doctor-onboarding/{token} — rotation
      A1  → test_doctor_onboarding_api.py
            ::test_onboarding_complete_rejects_edge_whitespace_password
      A2  test_rotation_passphrase_round_trips
      A3  short → test_doctor_onboarding_api.py
                  ::test_onboarding_complete_rejects_short_password
          test_rotation_rejects_weak_password
      A4  test_rotation_passphrase_round_trips

    path 8  POST /doctor-onboarding/{token} — new doctor
      A1  test_new_doctor_onboarding_rejects_whitespace_username
          test_new_doctor_onboarding_rejects_edge_whitespace_password
      A2  test_new_doctor_onboarding_stores_credentials_verbatim
      A3  test_new_doctor_onboarding_rejects_short_password (min == 10)
          test_new_doctor_onboarding_rejects_weak_password
      A4  test_new_doctor_onboarding_stores_credentials_verbatim

Paths 7 and 8 additionally carry the malformed-payload cases the review
asked for (number / object / array / null on both modes), which are about
the endpoint returning 422 rather than 500 — see _NON_STRINGS below.
"""
from __future__ import annotations

import base64

import pytest

from app.database import SessionLocal
from app.models import Account, Doctor


_PNG_1x1 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\x9a\x9c\xa9\x83\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")

# A passphrase: internal whitespace, no edges. Must survive every path.
_PASSPHRASE = "correct horse battery"

# Values that are neither missing nor strings. `payload.get("password") or ""`
# only replaced the falsy ones, so these used to reach str.strip() and 500.
_NON_STRINGS = [12345678901234, {"a": 1}, ["x"], None]


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token, "csrf_token cookie missing — not logged in?"
    return {"X-CSRF-Token": token}


def _error_code(resp) -> str:
    return resp.json()["detail"]["error"]


def _doctor_payload(**overrides) -> dict:
    base = {
        "username": "dr_policy",
        "password": "Doctor-Password-1234",
        "givenName": "Asha",
        "familyName": "Silva",
        "contact": "+94 11 555 0100",
        "email": "asha.policy@example.com",
        "slmcRegistrationNumber": "SLMC-123",
        "qualifications": "MBBS",
        "practitionerAddress": "1 Test St",
        "instituteName": "Test Clinic",
        "instituteContact": "+94 11 555 0101",
        "rubberStampImage": _PNG_1x1,
    }
    base.update(overrides)
    return base


def _submission(**overrides) -> dict:
    """Full new-doctor onboarding body (no email — the invite owns it)."""
    base = {
        "username": "drnewbie",
        "password": "MyNewSecure-Password-123",
        "givenName": "Asha",
        "familyName": "Silva",
        "contact": "+94 11 555 0100",
        "slmcRegistrationNumber": "SLMC-9999",
        "qualifications": "MBBS",
        "practitionerAddress": "1 Test St",
        "instituteName": "Test Clinic",
        "instituteContact": "+94 11 555 0101",
        "rubberStampImage": _PNG_1x1,
    }
    base.update(overrides)
    return base


def _create_doctor(admin_client, **overrides):
    return admin_client.post(
        "/doctors", json=_doctor_payload(**overrides), headers=_csrf(admin_client),
    )


def _rotation_token(doctor_id: int) -> str:
    from app.services import doctor_invites

    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue(db, doctor_id=doctor_id)
    finally:
        db.close()
    return raw


def _new_doctor_token(email: str, family_name: str | None = None) -> str:
    from app.services import doctor_invites

    db = SessionLocal()
    try:
        _, raw = doctor_invites.issue_new_doctor(
            db, email=email, family_name=family_name,
        )
    finally:
        db.close()
    return raw


def _stored_username(model, **filters) -> str:
    db = SessionLocal()
    try:
        return db.query(model).filter_by(**filters).one().username
    finally:
        db.close()


def _login(client, username: str, password: str):
    return client.post("/auth/login", json={"username": username, "password": password})


# ══ Path 5 — POST /doctors (admin creates a doctor with a password) ═══


@pytest.mark.parametrize("username", [" dr_policy", "dr policy", "dr_policy "])
def test_create_doctor_rejects_whitespace_username(admin_client, username):
    r = _create_doctor(admin_client, username=username)
    assert r.status_code == 422, r.text
    assert _error_code(r) == "username_whitespace"


@pytest.mark.parametrize("password", [" Doctor-Password-1234", "Doctor-Password-1234 "])
def test_create_doctor_rejects_edge_whitespace_password(admin_client, password):
    r = _create_doctor(admin_client, password=password)
    assert r.status_code == 422, r.text
    assert _error_code(r) == "password_whitespace"


def test_create_doctor_rejects_short_password(admin_client):
    r = _create_doctor(admin_client, password="short")
    assert r.status_code == 422, r.text
    body = r.json()["detail"]
    assert body["error"] == "setup_password_too_short"
    assert body.get("min") == 10


def test_create_doctor_rejects_weak_password(admin_client):
    r = _create_doctor(admin_client, password="Password1")
    assert r.status_code == 422, r.text
    assert _error_code(r) == "setup_password_weak"


def test_create_doctor_passphrase_round_trips(admin_client):
    """A2 + A4 for the manual-password create path."""
    r = _create_doctor(admin_client, username="dr_alice", password=_PASSPHRASE)
    assert r.status_code == 201, r.text

    # Stored verbatim on both rows — no normalising, no case-folding.
    assert _stored_username(Account, username="dr_alice") == "dr_alice"
    assert _stored_username(Doctor, username="dr_alice") == "dr_alice"

    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    ok = _login(admin_client, "dr_alice", _PASSPHRASE)
    assert ok.status_code == 200, ok.text
    assert ok.json()["role"] == "doctor"

    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    squashed = _login(admin_client, "dr_alice", _PASSPHRASE.replace(" ", ""))
    assert squashed.status_code == 401
    assert _error_code(squashed) == "invalid_credentials"


def test_create_doctor_explicit_empty_password_is_rejected_not_invite(
    admin_client, email_env, captured_emails,
):
    """`invite_mode = not payload.password` keys off falsiness.

    Omitting the key means "invite them"; sending "" is a typo, and it must
    not silently become an invite. Optional[NewPassword] runs the policy on
    any value that IS present.
    """
    r = _create_doctor(admin_client, password="")
    assert r.status_code == 422, r.text
    assert _error_code(r) == "setup_password_too_short"
    assert [c for c in captured_emails if c[0] == "send_templated"] == []


# ══ Path 6 — PATCH /doctors/{id} (admin rotates a doctor's password) ══


@pytest.fixture
def doctor_with_password(admin_client):
    """A doctor created with a known password. Returns (doctor_id, password)."""
    password = "Original-Password-123"
    r = _create_doctor(admin_client, username="dr_patch", password=password)
    assert r.status_code == 201, r.text
    return r.json()["id"], password


def _patch(admin_client, doctor_id: int, body: dict):
    return admin_client.patch(
        f"/doctors/{doctor_id}", json=body, headers=_csrf(admin_client),
    )


@pytest.mark.parametrize("password", [" New-Password-1234", "New-Password-1234 "])
def test_update_doctor_rejects_edge_whitespace_password(
    admin_client, doctor_with_password, password,
):
    doctor_id, _ = doctor_with_password
    r = _patch(admin_client, doctor_id, {"password": password})
    assert r.status_code == 422, r.text
    assert _error_code(r) == "password_whitespace"


def test_update_doctor_rejects_short_password(admin_client, doctor_with_password):
    doctor_id, _ = doctor_with_password
    r = _patch(admin_client, doctor_id, {"password": "short"})
    assert r.status_code == 422, r.text
    body = r.json()["detail"]
    assert body["error"] == "setup_password_too_short"
    assert body.get("min") == 10


def test_update_doctor_rejects_weak_password(admin_client, doctor_with_password):
    doctor_id, _ = doctor_with_password
    r = _patch(admin_client, doctor_id, {"password": "letmein"})
    assert r.status_code == 422, r.text
    assert _error_code(r) == "setup_password_weak"


def test_update_doctor_passphrase_round_trips(admin_client, doctor_with_password):
    doctor_id, old = doctor_with_password
    assert _patch(admin_client, doctor_id, {"password": _PASSPHRASE}).status_code == 200

    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    assert _login(admin_client, "dr_patch", _PASSPHRASE).status_code == 200

    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    assert _login(admin_client, "dr_patch", old).status_code == 401


def test_update_doctor_omitting_password_leaves_it_unchanged(
    admin_client, doctor_with_password,
):
    """The policy must not fire on a PATCH that isn't setting a password."""
    doctor_id, original = doctor_with_password
    assert _patch(admin_client, doctor_id, {"givenName": "Renamed"}).status_code == 200

    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    assert _login(admin_client, "dr_patch", original).status_code == 200


def test_update_doctor_explicit_null_password_is_a_no_op(
    admin_client, doctor_with_password,
):
    """Pins the `Optional` + `if data["password"]` branch in update_doctor:
    an explicit null clears nothing and rotates nothing."""
    doctor_id, original = doctor_with_password
    assert _patch(admin_client, doctor_id, {"password": None}).status_code == 200

    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    assert _login(admin_client, "dr_patch", original).status_code == 200


# ══ Path 7 — POST /doctor-onboarding/{token}, rotation mode ══════════


def test_rotation_rejects_weak_password(client, seeded_doctor):
    raw = _rotation_token(seeded_doctor.doctor_id)
    r = client.post(f"/doctor-onboarding/{raw}", json={"password": "changeme"})
    assert r.status_code == 422, r.text
    assert _error_code(r) == "setup_password_weak"


def test_rotation_passphrase_round_trips(client, seeded_doctor):
    raw = _rotation_token(seeded_doctor.doctor_id)
    assert client.post(
        f"/doctor-onboarding/{raw}", json={"password": _PASSPHRASE},
    ).status_code == 204

    assert _login(client, "dr_test_seeded", _PASSPHRASE).status_code == 200
    client.post("/auth/logout", headers=_csrf(client))
    assert _login(client, "dr_test_seeded", _PASSPHRASE.strip() + " ").status_code == 401


@pytest.mark.parametrize("bad", _NON_STRINGS)
def test_rotation_rejects_non_string_password(client, seeded_doctor, bad):
    """Regression guard for a 500 on a PUBLIC, unauthenticated endpoint.

    This branch used to run `validate_new_password(payload.get("password")
    or "")`. `or ""` only replaces falsy values, so a JSON number/object/array
    reached str.strip() and raised AttributeError — which is not an
    HTTPException, so it fell through to the catch-all as a 500 with no
    usable information, on input any caller controls.

    Both modes now parse into a typed model, so this is an ordinary 422.
    """
    raw = _rotation_token(seeded_doctor.doctor_id)
    r = client.post(f"/doctor-onboarding/{raw}", json={"password": bad})
    assert r.status_code == 422, f"got {r.status_code}: {r.text}"
    assert _error_code(r) == "validation_failed"


def test_rotation_rejects_missing_password(client, seeded_doctor):
    raw = _rotation_token(seeded_doctor.doctor_id)
    r = client.post(f"/doctor-onboarding/{raw}", json={})
    assert r.status_code == 422, r.text
    assert _error_code(r) == "validation_failed"


def test_rotation_422_does_not_echo_the_submitted_password(client, seeded_doctor):
    """Pydantic reports the rejected value under `input`. For a credential
    that puts the secret in the response body, and from there into devtools,
    proxy logs and error sinks. See _redact_secret_inputs in main.py.
    """
    raw = _rotation_token(seeded_doctor.doctor_id)
    r = client.post(f"/doctor-onboarding/{raw}", json={"password": 99999999999999})
    assert r.status_code == 422
    assert "99999999999999" not in r.text
    assert "<redacted>" in r.text


# ══ Path 8 — POST /doctor-onboarding/{token}, new-doctor mode ════════


@pytest.fixture
def new_doctor_token(initialized_system):
    return _new_doctor_token("newdoc@example.com", "Silva")


@pytest.mark.parametrize("username", [" drnewbie", "dr newbie"])
def test_new_doctor_onboarding_rejects_whitespace_username(
    client, new_doctor_token, username,
):
    r = client.post(
        f"/doctor-onboarding/{new_doctor_token}", json=_submission(username=username),
    )
    assert r.status_code == 422, r.text
    assert _error_code(r) == "username_whitespace"


def test_new_doctor_onboarding_rejects_edge_whitespace_password(
    client, new_doctor_token,
):
    r = client.post(
        f"/doctor-onboarding/{new_doctor_token}",
        json=_submission(password="MyNewSecure-Password-123 "),
    )
    assert r.status_code == 422, r.text
    assert _error_code(r) == "password_whitespace"


def test_new_doctor_onboarding_rejects_short_password(client, new_doctor_token):
    r = client.post(
        f"/doctor-onboarding/{new_doctor_token}", json=_submission(password="short"),
    )
    assert r.status_code == 422, r.text
    body = r.json()["detail"]
    assert body["error"] == "setup_password_too_short"
    assert body.get("min") == 10


def test_new_doctor_onboarding_rejects_weak_password(client, new_doctor_token):
    r = client.post(
        f"/doctor-onboarding/{new_doctor_token}", json=_submission(password="sysadmin"),
    )
    assert r.status_code == 422, r.text
    assert _error_code(r) == "setup_password_weak"


@pytest.mark.parametrize("bad", _NON_STRINGS)
def test_new_doctor_onboarding_rejects_non_string_password(
    client, new_doctor_token, bad,
):
    r = client.post(
        f"/doctor-onboarding/{new_doctor_token}", json=_submission(password=bad),
    )
    assert r.status_code == 422, f"got {r.status_code}: {r.text}"
    assert _error_code(r) == "validation_failed"


def test_new_doctor_onboarding_rejects_non_string_username(client, new_doctor_token):
    r = client.post(
        f"/doctor-onboarding/{new_doctor_token}", json=_submission(username=5),
    )
    assert r.status_code == 422, f"got {r.status_code}: {r.text}"
    assert _error_code(r) == "validation_failed"


def test_new_doctor_onboarding_stores_credentials_verbatim(
    admin_client, new_doctor_token, email_env, captured_emails,
):
    """A2 + A4 end to end: submit → admin approves → the doctor logs in."""
    r = admin_client.post(
        f"/doctor-onboarding/{new_doctor_token}",
        json=_submission(username="dr.new_1", password=_PASSPHRASE),
    )
    assert r.status_code == 204, r.text

    assert _stored_username(Account, username="dr.new_1") == "dr.new_1"

    db = SessionLocal()
    try:
        doctor_id = db.query(Doctor).filter_by(username="dr.new_1").one().doctor_id
    finally:
        db.close()
    assert admin_client.post(
        f"/doctors/{doctor_id}/approve", headers=_csrf(admin_client),
    ).status_code == 200

    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    assert _login(admin_client, "dr.new_1", _PASSPHRASE).status_code == 200

    admin_client.post("/auth/logout", headers=_csrf(admin_client))
    assert _login(admin_client, "dr.new_1", _PASSPHRASE + " ").status_code == 401


# ══ Dispatch invariant ═══════════════════════════════════════════════
#
# The endpoint chooses its schema from the invite's mode, never from the
# payload's shape (doctor_onboarding.py's docstring says so explicitly).
# Now that each branch parses into its own model, these are the two ways
# that wiring could be got backwards.


def test_new_doctor_payload_against_a_rotation_invite_is_treated_as_rotation(
    client, seeded_doctor,
):
    raw = _rotation_token(seeded_doctor.doctor_id)
    body = _submission(username="hijacked", password=_PASSPHRASE)

    r = client.post(f"/doctor-onboarding/{raw}", json=body)
    assert r.status_code == 204, r.text

    db = SessionLocal()
    try:
        # The extra fields were ignored: no second Doctor, no "hijacked"
        # account, and the existing doctor kept its own username.
        assert db.query(Doctor).filter_by(username="hijacked").count() == 0
        assert db.get(Account, "hijacked") is None
        assert db.query(Doctor).count() == 1
    finally:
        db.close()

    # It really was a rotation — the seeded doctor's password is now ours.
    assert _login(client, "dr_test_seeded", _PASSPHRASE).status_code == 200


def test_password_only_payload_against_a_new_doctor_invite_is_rejected(
    client, new_doctor_token,
):
    """Must 422 on the missing profile fields, NOT quietly succeed as a
    rotation — there is no Account to rotate."""
    r = client.post(
        f"/doctor-onboarding/{new_doctor_token}", json={"password": _PASSPHRASE},
    )
    assert r.status_code == 422, r.text
    assert _error_code(r) == "validation_failed"

    fields = {tuple(e["loc"])[-1] for e in r.json()["detail"]["errors"]}
    assert "username" in fields
    assert "rubberStampImage" in fields
