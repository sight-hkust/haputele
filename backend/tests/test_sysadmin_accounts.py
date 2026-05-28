"""Integration tests for POST /sysadmin/accounts.

The setup wizard creates exactly one sys-admin. Operating accounts
(admins, healthworkers) are created post-init through this endpoint,
either from wizard stage 3 or from the future dev-dashboard.
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
    """Drive the wizard to a logged-in sys-admin session."""
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    r = client.post("/setup/initialize", json=_init_body(), headers=_csrf(client))
    assert r.status_code == 201
    assert client.cookies.get("session")


def test_create_admin_account(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.post(
        "/sysadmin/accounts",
        json={"username": "alice", "password": "correct-horse-battery-staple", "role": "admin"},
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text
    assert r.json() == {"username": "alice", "role": "admin"}


def test_create_healthworker_account(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.post(
        "/sysadmin/accounts",
        json={"username": "bob", "password": "correct-horse-battery-staple", "role": "healthworker"},
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text
    assert r.json() == {"username": "bob", "role": "healthworker"}


def test_multiple_admins_and_healthworkers_allowed(client, seeded_setup_token):
    """Migration 0007 dropped the per-role singleton indexes for admin and
    healthworker. The wizard's stage 3 lets the operator add several of
    each, so this test guards against the index being reintroduced.
    """
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    for name in ("alice", "bob"):
        r = client.post(
            "/sysadmin/accounts",
            json={"username": name, "password": "correct-horse-battery-staple", "role": "admin"},
            headers=_csrf(client),
        )
        assert r.status_code == 201, f"second admin failed: {r.text}"

    for name in ("carol", "dave"):
        r = client.post(
            "/sysadmin/accounts",
            json={"username": name, "password": "correct-horse-battery-staple", "role": "healthworker"},
            headers=_csrf(client),
        )
        assert r.status_code == 201, f"second healthworker failed: {r.text}"


def test_rejects_disallowed_role(client, seeded_setup_token):
    """Only admin and healthworker can be created via this endpoint.
    Doctors require a profile (use POST /doctors). Sys-admin is singleton.
    """
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    for bad_role in ("doctor", "sys-admin", "patient", ""):
        r = client.post(
            "/sysadmin/accounts",
            json={"username": "alice", "password": "correct-horse-battery-staple", "role": bad_role},
            headers=_csrf(client),
        )
        assert r.status_code == 422, f"role={bad_role!r}: {r.text}"


def test_rejects_short_password(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.post(
        "/sysadmin/accounts",
        json={"username": "alice", "password": "short", "role": "admin"},
        headers=_csrf(client),
    )
    assert r.status_code == 422
    assert _error_code(r) == "setup_password_too_short"


def test_rejects_weak_password(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.post(
        "/sysadmin/accounts",
        json={"username": "alice", "password": "password1", "role": "admin"},
        headers=_csrf(client),
    )
    assert r.status_code == 422
    assert _error_code(r) == "setup_password_weak"


def test_rejects_duplicate_username(client, seeded_setup_token):
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    r = client.post(
        "/sysadmin/accounts",
        json={"username": "alice", "password": "correct-horse-battery-staple", "role": "admin"},
        headers=_csrf(client),
    )
    assert r.status_code == 201

    r = client.post(
        "/sysadmin/accounts",
        json={"username": "alice", "password": "correct-horse-battery-staple", "role": "healthworker"},
        headers=_csrf(client),
    )
    assert r.status_code == 422
    assert _error_code(r) == "username_taken"


def test_requires_sys_admin_role(client, seeded_setup_token):
    """An authenticated `admin` user must NOT be able to call this — only
    sys-admin can mint operating accounts. (Future: relax to admin if the
    ops team wants admin to manage healthworkers; keep tight for now.)
    """
    _initialize_and_login_sysadmin(client, seeded_setup_token)

    # Create an admin via the endpoint, then log in as them and try again.
    r = client.post(
        "/sysadmin/accounts",
        json={"username": "alice", "password": "correct-horse-battery-staple", "role": "admin"},
        headers=_csrf(client),
    )
    assert r.status_code == 201

    r = client.post("/auth/logout", headers=_csrf(client))
    assert r.status_code == 204

    r = client.post(
        "/auth/login",
        json={"username": "alice", "password": "correct-horse-battery-staple"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "admin"

    r = client.post(
        "/sysadmin/accounts",
        json={"username": "carol", "password": "correct-horse-battery-staple", "role": "admin"},
        headers=_csrf(client),
    )
    assert r.status_code == 403


def test_requires_authentication(client):
    """No cookie at all → 401."""
    # We need to be initialized for the setup-gate to let us through to /sysadmin.
    # Without going through the full wizard, manually flip the row.
    from app.database import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        db.execute(text(
            "UPDATE system_config SET initialized_at = NOW(), "
            "  institute_name = 'X', institute_address_lines = '[\"a\"]'::jsonb, "
            "  institute_contact_phone = 'p', institute_contact_email = 'e@x.com', "
            "  app_timezone = 'UTC', export_timezone = 'UTC', "
            "  master_consent_version = 'v1' "
            "WHERE id = 1"
        ))
        db.commit()
    finally:
        db.close()

    # Re-import so the lifespan hook picks up the new system_config row.
    import importlib
    import app.main as app_main
    importlib.reload(app_main)
    from fastapi.testclient import TestClient

    with TestClient(app_main.app) as fresh_client:
        r = fresh_client.post(
            "/sysadmin/accounts",
            json={"username": "alice", "password": "correct-horse-battery-staple", "role": "admin"},
        )
        assert r.status_code == 401
