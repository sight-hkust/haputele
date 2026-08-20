"""The caller × target × action grid for /accounts.

`routers/accounts.py` states one rule — sys-admin may touch admin and
healthworker, admin may touch healthworker only — and every endpoint
derives its gate from it. These tests check the rule holds at each of the
seven endpoints rather than at the handful someone thought to test, so an
endpoint added later that forgets `manageable_roles()` fails here.

The cases that matter most are the refusals. An admin able to create an
`admin`, or to reset an existing admin's password, has promoted itself to
sys-admin — the role boundary stops meaning anything if anyone below it
can reach across.

Companions: test_sysadmin_accounts.py (creation detail, sys-admin caller)
and test_sysadmin_account_management.py (lifecycle detail).
"""
import pytest


PASSWORD = "correct-horse-battery-staple"


def _error_code(resp) -> str:
    return resp.json()["detail"]["error"]


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token, "csrf_token cookie not set"
    return {"X-CSRF-Token": token}


def _init_body() -> dict:
    return {
        "sysAdmin": {"username": "ops", "password": PASSWORD},
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
    r = client.post(
        "/setup/initialize",
        json=_init_body(),
        headers={"Authorization": f"Bearer {r.json()['setupSessionToken']}"},
    )
    assert r.status_code == 201


def _create(client, username, role):
    r = client.post(
        "/accounts",
        json={"username": username, "password": PASSWORD, "role": role},
        headers=_csrf(client),
    )
    assert r.status_code == 201, r.text


def _login(client, username):
    r = client.post("/auth/login", json={"username": username, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["role"]


def _logout(client):
    assert client.post("/auth/logout", headers=_csrf(client)).status_code == 204


@pytest.fixture
def world(client, seeded_setup_token):
    """A populated instance: the ops sys-admin plus one account of each
    manageable role, with the caller left signed in as sys-admin."""
    _initialize_and_login_sysadmin(client, seeded_setup_token)
    _create(client, "some_admin", "admin")
    _create(client, "some_hw", "healthworker")
    return client


def _become(client, username):
    """Switch the session to another account, keeping CSRF coherent."""
    _logout(client)
    return _login(client, username)


# Every mutating endpoint, as (label, callable taking (client, username)).
# Kept as one list so a new endpoint is added in exactly one place and is
# immediately exercised against every caller/target pair below.
MUTATIONS = [
    ("patch", lambda c, u: c.patch(f"/accounts/{u}", json={"fullName": "X"}, headers=_csrf(c))),
    ("reset-password", lambda c, u: c.post(
        f"/accounts/{u}/reset-password", json={"password": "another-long-passphrase"}, headers=_csrf(c)
    )),
    ("disable", lambda c, u: c.post(f"/accounts/{u}/disable", headers=_csrf(c))),
    ("enable", lambda c, u: c.post(f"/accounts/{u}/enable", headers=_csrf(c))),
    ("delete", lambda c, u: c.delete(f"/accounts/{u}", headers=_csrf(c))),
]


# ── admin caller: refused against privileged targets ─────────────────


@pytest.mark.parametrize("label,call", MUTATIONS, ids=[m[0] for m in MUTATIONS])
@pytest.mark.parametrize("target", ["some_admin", "ops"])
def test_admin_cannot_mutate_privileged_accounts(world, label, call, target):
    """Admin gets 403 on every mutating endpoint against another admin and
    against the sys-admin singleton."""
    _become(world, "some_admin")
    r = call(world, target)
    assert r.status_code == 403, f"{label} on {target}: {r.status_code} {r.text}"
    assert _error_code(r) == "cannot_manage_role"


@pytest.mark.parametrize("role", ["admin", "sys-admin"])
def test_admin_cannot_create_privileged_accounts(world, role):
    _become(world, "some_admin")
    r = world.post(
        "/accounts",
        json={"username": "escalated", "password": PASSWORD, "role": role},
        headers=_csrf(world),
    )
    if role == "admin":
        # A real role the caller may not create → 403.
        assert r.status_code == 403
        assert _error_code(r) == "cannot_manage_role"
    else:
        # sys-admin is not creatable by anyone through this surface; the
        # Literal rejects it before the handler runs → 422.
        assert r.status_code == 422

    # Nothing was written either way.
    _become(world, "ops")
    usernames = {row["username"] for row in world.get("/accounts").json()}
    assert "escalated" not in usernames


def test_admin_cannot_mutate_self(world):
    """An admin's own row is an `admin` row, so it's out of reach here too.
    Self-service isn't part of this surface — only the sys-admin has it,
    because it is excluded from its own roster and would otherwise have no
    way to change its password."""
    _become(world, "some_admin")
    r = world.patch("/accounts/some_admin", json={"fullName": "X"}, headers=_csrf(world))
    assert r.status_code == 403
    assert _error_code(r) == "cannot_manage_role"


# ── admin caller: full healthworker lifecycle allowed ────────────────


def test_admin_runs_full_healthworker_lifecycle(world):
    """Create → edit → reset password → disable → enable → delete, all as
    an admin. This is the feature: parity with what admin already has over
    doctors, minus the invite/approval half that healthworkers don't have.
    """
    _become(world, "some_admin")

    r = world.post(
        "/accounts",
        json={
            "username": "nurse_joy",
            "password": PASSWORD,
            "role": "healthworker",
            "fullName": "Joy Perera",
            "contact": "+94 77 000 0000",
        },
        headers=_csrf(world),
    )
    assert r.status_code == 201, r.text

    r = world.patch("/accounts/nurse_joy", json={"fullName": "Joy P."}, headers=_csrf(world))
    assert r.status_code == 200, r.text
    assert r.json()["fullName"] == "Joy P."

    r = world.post(
        "/accounts/nurse_joy/reset-password",
        json={"password": "brand-new-long-passphrase"},
        headers=_csrf(world),
    )
    assert r.status_code == 204, r.text

    r = world.post("/accounts/nurse_joy/disable", headers=_csrf(world))
    assert r.status_code == 200, r.text
    assert r.json()["disabledAt"] is not None

    # Disabled really does block sign-in, with the new password.
    _logout(world)
    r = world.post(
        "/auth/login", json={"username": "nurse_joy", "password": "brand-new-long-passphrase"}
    )
    assert r.status_code == 403

    _login(world, "some_admin")
    r = world.post("/accounts/nurse_joy/enable", headers=_csrf(world))
    assert r.status_code == 200, r.text
    assert r.json()["disabledAt"] is None

    r = world.delete("/accounts/nurse_joy", headers=_csrf(world))
    assert r.status_code == 204, r.text

    assert "nurse_joy" not in {row["username"] for row in world.get("/accounts").json()}


def test_admin_roster_shows_only_healthworkers(world):
    _become(world, "some_admin")
    rows = world.get("/accounts").json()
    assert {row["role"] for row in rows} == {"healthworker"}
    assert all(row["manageable"] for row in rows)


# ── sys-admin caller: unchanged ──────────────────────────────────────


@pytest.mark.parametrize("target", ["some_admin", "some_hw"])
def test_sysadmin_still_manages_both_operating_roles(world, target):
    r = world.patch(f"/accounts/{target}", json={"fullName": "Renamed"}, headers=_csrf(world))
    assert r.status_code == 200, r.text
    assert r.json()["fullName"] == "Renamed"
    assert r.json()["manageable"] is True


def test_sysadmin_roster_still_lists_admins(world):
    rows = {row["username"]: row for row in world.get("/accounts").json()}
    assert {"some_admin", "some_hw"} <= set(rows)
    assert "ops" not in rows, "the sys-admin manages itself from the System page"


# ── neither role reaches this surface for doctors ────────────────────


@pytest.fixture
def doctor_world(client, seeded_doctor):
    """Like `world`, but for tests that need a doctor.

    `seeded_doctor` pulls in `initialized_system`, which already flips
    system_config to initialized — so the setup wizard would 409 here. We
    insert the ops and admin accounts directly, exactly as the wizard and
    then POST /accounts would have.
    """
    from app.database import SessionLocal
    from app.models import Account
    from app.security import hash_password

    db = SessionLocal()
    try:
        db.add(Account(username="ops", password=hash_password(PASSWORD), role="sys-admin"))
        db.add(Account(username="some_admin", password=hash_password(PASSWORD), role="admin"))
        db.commit()
    finally:
        db.close()
    return client


@pytest.mark.parametrize("caller", ["ops", "some_admin"])
@pytest.mark.parametrize("label,call", MUTATIONS, ids=[m[0] for m in MUTATIONS])
def test_doctors_are_never_mutated_here(doctor_world, seeded_doctor, caller, label, call):
    """A doctor is an accounts row PLUS a doctors row. These endpoints know
    only the first, so deleting here would orphan the profile and disabling
    here would write `accounts.disabled_at` while booking reads
    `doctors.active`. Both callers are refused; /doctors is the way in."""
    _login(doctor_world, caller)
    r = call(doctor_world, seeded_doctor.username)
    assert r.status_code == 403, f"{label} as {caller}: {r.status_code} {r.text}"
    assert _error_code(r) == "cannot_manage_role"


# ── unauthenticated / other roles ────────────────────────────────────


def test_healthworker_cannot_reach_the_surface(world):
    """Only the two administrative roles get through require_role at all."""
    _become(world, "some_hw")
    assert world.get("/accounts").status_code == 403
    r = world.post(
        "/accounts",
        json={"username": "x", "password": PASSWORD, "role": "healthworker"},
        headers=_csrf(world),
    )
    assert r.status_code == 403
