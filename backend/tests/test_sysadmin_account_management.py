"""Integration tests for the sys-admin (ops super user) account-management
surface: roster, password reset, disable/enable, and guarded delete.

Companion to test_sysadmin_accounts.py, which covers account *creation*.
The ops super user is the singleton sys-admin minted by the setup wizard;
these endpoints let it manage operating accounts (admin, healthworker)
while leaving doctors (managed under /doctors) and itself read-only.
"""


def _error_code(resp) -> str:
    return resp.json()["detail"]["error"]


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token, "csrf_token cookie not set"
    return {"X-CSRF-Token": token}


def _init_body() -> dict:
    return {
        "sysAdmin": {"username": "ops", "password": "correct-horse-battery-staple"},
        "instituteIdentity": {
            "name": "HapuTele Demo Clinic",
            "addressLines": ["12 Test Lane", "Colombo 03"],
            "contactPhone": "+94 11 555 0100",
            "contactEmail": "ops@example.com",
        },
        "appTimezone": "Asia/Colombo",
        "exportTimezone": "Asia/Colombo",
        "masterConsentVersion": "v1",
    }


def _initialize_and_login_sysadmin(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    setup_token = r.json()["setupSessionToken"]
    r = client.post(
        "/setup/initialize",
        json=_init_body(),
        headers={"Authorization": f"Bearer {setup_token}"},
    )
    assert r.status_code == 201
    assert client.cookies.get("session")


def _create_account(client, username, role, password="correct-horse-battery-staple"):
    r = client.post(
        "/sysadmin/accounts",
        json={"username": username, "password": password, "role": role},
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text


def _login_ops(client):
    """Re-establish a sys-admin session (e.g. after a logout in a test)."""
    r = client.post(
        "/auth/login",
        json={"username": "ops", "password": "correct-horse-battery-staple"},
    )
    assert r.status_code == 200, r.text


def _seed_sysadmin_and_login(client):
    """Seed the singleton sys-admin directly and log in.

    Used by tests that pull in the `seeded_doctor` fixture: that fixture
    already flips system_config to initialized, so the setup wizard would
    409 (setup_already_completed). We bypass it and just insert the ops
    account the same way the wizard would have.
    """
    from app.database import SessionLocal
    from app.models import Account
    from app.security import hash_password

    db = SessionLocal()
    try:
        if db.get(Account, "ops") is None:
            db.add(Account(
                username="ops",
                password=hash_password("correct-horse-battery-staple"),
                role="sys-admin",
            ))
            db.commit()
    finally:
        db.close()
    _login_ops(client)


# ── roster ───────────────────────────────────────────────────────────


def test_roster_lists_all_roles_with_manageable_flags(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin")
    _create_account(client, "bob", "healthworker")

    r = client.get("/sysadmin/accounts")
    assert r.status_code == 200, r.text
    by_username = {row["username"]: row for row in r.json()}

    assert by_username["ops"]["role"] == "sys-admin"
    assert by_username["ops"]["manageable"] is False
    assert by_username["alice"]["role"] == "admin"
    assert by_username["alice"]["manageable"] is True
    assert by_username["alice"]["disabledAt"] is None
    assert by_username["bob"]["role"] == "healthworker"
    assert by_username["bob"]["manageable"] is True


def test_roster_shows_doctor_readonly(client, seeded_doctor):
    _seed_sysadmin_and_login(client)

    r = client.get("/sysadmin/accounts")
    assert r.status_code == 200, r.text
    by_username = {row["username"]: row for row in r.json()}

    doctor_row = by_username[seeded_doctor.username]
    assert doctor_row["role"] == "doctor"
    assert doctor_row["manageable"] is False
    assert doctor_row["doctorActive"] is True


def test_roster_requires_sys_admin(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin")

    r = client.post("/auth/logout", headers=_csrf(client))
    assert r.status_code == 204
    r = client.post("/auth/login", json={"username": "alice", "password": "correct-horse-battery-staple"})
    assert r.status_code == 200

    r = client.get("/sysadmin/accounts")
    assert r.status_code == 403


# ── reset password ─────────────────────────────────────────────────────


def test_reset_password_lets_user_login_with_new_secret(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin", password="old-correct-horse-staple")

    r = client.post(
        "/sysadmin/accounts/alice/reset-password",
        json={"password": "brand-new-horse-battery-staple"},
        headers=_csrf(client),
    )
    assert r.status_code == 204, r.text

    r = client.post("/auth/logout", headers=_csrf(client))
    assert r.status_code == 204

    # Old password no longer works.
    r = client.post("/auth/login", json={"username": "alice", "password": "old-correct-horse-staple"})
    assert r.status_code == 401
    # New password does.
    r = client.post("/auth/login", json={"username": "alice", "password": "brand-new-horse-battery-staple"})
    assert r.status_code == 200, r.text


def test_reset_password_rejects_weak(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin")

    r = client.post(
        "/sysadmin/accounts/alice/reset-password",
        json={"password": "password1"},
        headers=_csrf(client),
    )
    assert r.status_code == 422
    assert _error_code(r) == "setup_password_weak"


def test_reset_password_unknown_account_404(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.post(
        "/sysadmin/accounts/ghost/reset-password",
        json={"password": "correct-horse-battery-staple"},
        headers=_csrf(client),
    )
    assert r.status_code == 404
    assert _error_code(r) == "account_not_found"


def test_cannot_reset_doctor_password(client, seeded_doctor):
    """Doctors are managed under /doctors, not here."""
    _seed_sysadmin_and_login(client)

    r = client.post(
        f"/sysadmin/accounts/{seeded_doctor.username}/reset-password",
        json={"password": "correct-horse-battery-staple"},
        headers=_csrf(client),
    )
    assert r.status_code == 403
    assert _error_code(r) == "cannot_manage_role"


def test_sysadmin_can_reset_own_password(client, seeded_setup_token):
    """Self-service: the ops account may change its own password and then
    sign in with it. (It still can't disable/delete itself — see below.)"""
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.post(
        "/sysadmin/accounts/ops/reset-password",
        json={"password": "another-correct-horse-staple"},
        headers=_csrf(client),
    )
    assert r.status_code == 204, r.text

    r = client.post("/auth/logout", headers=_csrf(client))
    assert r.status_code == 204
    r = client.post("/auth/login", json={"username": "ops", "password": "another-correct-horse-staple"})
    assert r.status_code == 200, r.text


def test_sysadmin_can_edit_own_profile(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.patch(
        "/sysadmin/accounts/ops",
        json={"fullName": "Ops Lead", "contact": "+94 11 000 1111"},
        headers=_csrf(client),
    )
    assert r.status_code == 200, r.text
    assert r.json()["fullName"] == "Ops Lead"

    r = client.get("/sysadmin/accounts")
    ops = {row["username"]: row for row in r.json()}["ops"]
    assert ops["fullName"] == "Ops Lead"
    assert ops["contact"] == "+94 11 000 1111"


def test_sysadmin_cannot_disable_self(client, seeded_setup_token):
    """Lockout protection: disable/enable/delete never apply to the ops
    account, even though it can edit its own profile/password."""
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.post("/sysadmin/accounts/ops/disable", headers=_csrf(client))
    assert r.status_code == 403
    assert _error_code(r) == "cannot_manage_role"

    r = client.delete("/sysadmin/accounts/ops", headers=_csrf(client))
    assert r.status_code == 403
    assert _error_code(r) == "cannot_manage_role"


# ── disable / enable ───────────────────────────────────────────────────


def test_disable_blocks_login_enable_restores(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin")

    r = client.post("/sysadmin/accounts/alice/disable", headers=_csrf(client))
    assert r.status_code == 200, r.text
    assert r.json()["disabledAt"] is not None

    r = client.post("/auth/logout", headers=_csrf(client))
    assert r.status_code == 204
    r = client.post("/auth/login", json={"username": "alice", "password": "correct-horse-battery-staple"})
    assert r.status_code == 403
    assert _error_code(r) == "account_disabled"

    # Re-enable as the sys-admin, then alice can sign in again.
    _login_ops(client)
    r = client.post("/sysadmin/accounts/alice/enable", headers=_csrf(client))
    assert r.status_code == 200, r.text
    assert r.json()["disabledAt"] is None

    r = client.post("/auth/logout", headers=_csrf(client))
    assert r.status_code == 204
    r = client.post("/auth/login", json={"username": "alice", "password": "correct-horse-battery-staple"})
    assert r.status_code == 200, r.text


def test_disable_is_idempotent(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin")

    r1 = client.post("/sysadmin/accounts/alice/disable", headers=_csrf(client))
    assert r1.status_code == 200
    first_stamp = r1.json()["disabledAt"]
    r2 = client.post("/sysadmin/accounts/alice/disable", headers=_csrf(client))
    assert r2.status_code == 200
    # Re-disabling doesn't move the original timestamp.
    assert r2.json()["disabledAt"] == first_stamp


def test_cannot_disable_doctor(client, seeded_doctor):
    _seed_sysadmin_and_login(client)

    r = client.post(
        f"/sysadmin/accounts/{seeded_doctor.username}/disable",
        headers=_csrf(client),
    )
    assert r.status_code == 403
    assert _error_code(r) == "cannot_manage_role"


# ── delete (guarded) ───────────────────────────────────────────────────


def test_delete_unreferenced_account(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin")

    r = client.delete("/sysadmin/accounts/alice", headers=_csrf(client))
    assert r.status_code == 204, r.text

    r = client.get("/sysadmin/accounts")
    assert "alice" not in {row["username"] for row in r.json()}


def test_delete_refuses_referenced_account(client, seeded_setup_token):
    """An account that created a queue entry is FK-pinned; delete must
    refuse with account_in_use and steer the operator to disable."""
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "healthworker")

    # Seed a queue entry whose created_by is alice — the RESTRICT FK that
    # blocks a hard delete.
    from app.database import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        patient_id = db.execute(text(
            "INSERT INTO patients (given_name, family_name, gender) "
            "VALUES ('Pat', 'Ient', 'other') RETURNING patient_id"
        )).scalar()
        db.execute(text(
            "INSERT INTO queue_entries (patient_id, source, status, priority, created_by) "
            "VALUES (:pid, 'walk_in', 'pending', 'routine', 'alice')"
        ), {"pid": patient_id})
        db.commit()
    finally:
        db.close()

    r = client.delete("/sysadmin/accounts/alice", headers=_csrf(client))
    assert r.status_code == 409
    assert _error_code(r) == "account_in_use"

    # Still listed — the refusal didn't partially delete anything.
    r = client.get("/sysadmin/accounts")
    assert "alice" in {row["username"] for row in r.json()}


def test_cannot_delete_doctor(client, seeded_doctor):
    _seed_sysadmin_and_login(client)

    r = client.delete(
        f"/sysadmin/accounts/{seeded_doctor.username}",
        headers=_csrf(client),
    )
    assert r.status_code == 403
    assert _error_code(r) == "cannot_manage_role"


# ── profile fields (full name / contact) ────────────────────────────────


def test_create_with_profile_fields(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    r = client.post(
        "/sysadmin/accounts",
        json={
            "username": "alice",
            "password": "correct-horse-battery-staple",
            "role": "admin",
            "fullName": "Alice Adams",
            "contact": "+94 11 222 3333",
        },
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text

    r = client.get("/sysadmin/accounts")
    alice = {row["username"]: row for row in r.json()}["alice"]
    assert alice["fullName"] == "Alice Adams"
    assert alice["contact"] == "+94 11 222 3333"


def test_patch_updates_profile_fields(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin")

    r = client.patch(
        "/sysadmin/accounts/alice",
        json={"fullName": "Alice A. Adams", "contact": "+94 77 000 0000"},
        headers=_csrf(client),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fullName"] == "Alice A. Adams"
    assert body["contact"] == "+94 77 000 0000"


def test_patch_is_partial_and_can_clear(client, seeded_setup_token):
    """Omitted fields are untouched; an explicit empty string clears to null."""
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create_account(client, "alice", "admin")
    client.patch(
        "/sysadmin/accounts/alice",
        json={"fullName": "Alice Adams", "contact": "+94 77 000 0000"},
        headers=_csrf(client),
    )

    # Patch only contact — fullName must survive untouched.
    r = client.patch(
        "/sysadmin/accounts/alice",
        json={"contact": "+94 77 999 9999"},
        headers=_csrf(client),
    )
    assert r.status_code == 200
    assert r.json()["fullName"] == "Alice Adams"
    assert r.json()["contact"] == "+94 77 999 9999"

    # Explicit empty string clears the field to null.
    r = client.patch(
        "/sysadmin/accounts/alice",
        json={"fullName": "   "},
        headers=_csrf(client),
    )
    assert r.status_code == 200
    assert r.json()["fullName"] is None


def test_cannot_patch_doctor(client, seeded_doctor):
    _seed_sysadmin_and_login(client)
    r = client.patch(
        f"/sysadmin/accounts/{seeded_doctor.username}",
        json={"fullName": "Hax"},
        headers=_csrf(client),
    )
    assert r.status_code == 403
    assert _error_code(r) == "cannot_manage_role"


def test_roster_exposes_doctor_id(client, seeded_doctor):
    _seed_sysadmin_and_login(client)
    r = client.get("/sysadmin/accounts")
    doc = {row["username"]: row for row in r.json()}[seeded_doctor.username]
    assert doc["doctorId"] == seeded_doctor.doctor_id


# ── sys-admin can fully manage doctors (widened /doctors auth) ───────────


def test_sysadmin_can_patch_doctor(client, seeded_doctor):
    """The /doctors PATCH was admin-only; it now also accepts sys-admin so
    the ops account can edit a doctor's profile from its drawer."""
    _seed_sysadmin_and_login(client)
    r = client.patch(
        f"/doctors/{seeded_doctor.doctor_id}",
        json={"contact": "+94 11 555 0000"},
        headers=_csrf(client),
    )
    assert r.status_code == 200, r.text
    assert r.json()["contact"] == "+94 11 555 0000"


def test_sysadmin_can_view_doctor_detail(client, seeded_doctor):
    _seed_sysadmin_and_login(client)
    # The detail endpoint streams the rubber stamp from object storage; the
    # seeded doctor's key points at nothing, so put a stub object there
    # first (otherwise the handler 404s on the missing blob, not on auth).
    from app.services.storage import put_bytes

    put_bytes(seeded_doctor.rubber_stamp_key, b"\x89PNG\r\n\x1a\n", "image/png")
    r = client.get(f"/doctors/{seeded_doctor.doctor_id}")
    assert r.status_code == 200, r.text
    assert r.json()["username"] == seeded_doctor.username


def test_sysadmin_can_deactivate_doctor(client, seeded_doctor):
    _seed_sysadmin_and_login(client)
    r = client.delete(f"/doctors/{seeded_doctor.doctor_id}", headers=_csrf(client))
    assert r.status_code == 204, r.text
    # Reflected in the roster's read-only doctor row.
    r = client.get("/sysadmin/accounts")
    doc = {row["username"]: row for row in r.json()}[seeded_doctor.username]
    assert doc["doctorActive"] is False
