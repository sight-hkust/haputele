"""API-level tests for the credential policy on the operating-account paths.

`test_credentials_service.py` covers the validators in isolation. This file
proves the rules actually reach the wire — that they are enforced by the
endpoints themselves and not merely by the browser, since the API is
directly reachable. The four doctor write paths live in
`test_credential_policy_doctor_paths.py`; between them the two files cover
all seven places a credential can be set.

The two rules differ deliberately:

    username — no whitespace at all, internal or external
    password — no leading/trailing whitespace; internal whitespace allowed

And login is deliberately exempt from both: it *verifies* a credential, it
never *sets* policy. See services/credentials.py.

Every path is checked for the same four things:

    A1  edge whitespace refused, with a specific code
    A2  an internal-whitespace passphrase accepted AND usable at login,
        while its trimmed variant is refused
    A3  weak/short reported with the same codes and the same minimum
        everywhere
    A4  the stored value byte-identical to what was submitted

Coverage map for the three operating-account paths. Two cells predate this
file and are NOT duplicated here — a second copy of an existing assertion
just drifts from the original, and "write the rule down once" is the whole
point of this change:

    path 1  /setup/initialize
      A1  test_setup_initialize_rejects_whitespace_username
          test_setup_initialize_rejects_edge_whitespace_password
      A2  test_setup_initialize_stores_credentials_verbatim
      A3  test_setup_initialize_rejects_short_password (min == 10)
          test_setup_initialize_rejects_weak_password
      A4  test_setup_initialize_stores_credentials_verbatim

    paths 2 & 3  POST /sysadmin/accounts (admin | healthworker)
      A1  test_create_account_rejects_username_with_leading_space
          test_create_account_rejects_username_with_internal_space
          test_create_account_rejects_trailing_space_password
          test_create_account_rejects_whitespace_padded_short_password
          test_create_account_policy_is_role_independent (both roles)
      A2  test_internal_whitespace_password_is_accepted_and_usable
          test_create_account_policy_is_role_independent (both roles)
      A3  test_create_account_rejects_short_password (min == 10)
          test_create_account_rejects_weak_password
      A4  test_create_account_stores_username_verbatim
          test_login_does_not_trim_the_submitted_password

    path 4  POST /sysadmin/accounts/{username}/reset-password
      A1  test_reset_password_rejects_edge_whitespace (both edges)
      A2  test_reset_password_passphrase_round_trips
      A3  test_reset_password_rejects_short_password (min == 10)
          weak → test_sysadmin_account_management.py
                 ::test_reset_password_rejects_weak
      A4  test_reset_password_passphrase_round_trips
"""
import pytest

from app.database import SessionLocal
from app.models import Account

# A passphrase: internal whitespace, no edges. Must survive every path.
_PASSPHRASE = "correct horse battery"


def _error_code(resp) -> str:
    return resp.json()["detail"]["error"]


def _csrf(client) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token, "csrf_token cookie not set"
    return {"X-CSRF-Token": token}


def _init_body(username="ops", password="correct-horse-battery-staple") -> dict:
    return {
        "sysAdmin": {"username": username, "password": password},
        "instituteIdentity": {
            "name": "HapuTele Demo Clinic",
            "addressLines": ["12 Test Lane"],
            "contactPhone": "+94 11 555 0100",
            "contactEmail": "ops@example.com",
        },
        "appTimezone": "Asia/Colombo",
        "exportTimezone": "Asia/Colombo",
        "masterConsentVersion": "v1",
    }


def _init_and_login(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    setup_token = r.json()["setupSessionToken"]
    r = client.post(
        "/setup/initialize",
        json=_init_body(),
        headers={"Authorization": f"Bearer {setup_token}"},
    )
    assert r.status_code == 201, r.text


def _create_account(client, **overrides):
    body = {
        "username": "alice",
        "password": "correct-horse-battery-staple",
        "role": "admin",
    }
    body.update(overrides)
    return client.post("/sysadmin/accounts", json=body, headers=_csrf(client))


# ── username: no whitespace anywhere ──────────────────────────────────


def test_create_account_rejects_username_with_leading_space(client, seeded_setup_token):
    _init_and_login(client, seeded_setup_token)
    r = _create_account(client, username=" alice")
    assert r.status_code == 422
    assert _error_code(r) == "username_whitespace"


def test_create_account_rejects_username_with_internal_space(client, seeded_setup_token):
    """Unlike password, a username may not contain whitespace anywhere.

    Login is an exact primary-key lookup and sends what was typed verbatim,
    so a username nobody can reproduce is a username nobody can sign in as.
    """
    _init_and_login(client, seeded_setup_token)
    r = _create_account(client, username="al ice")
    assert r.status_code == 422
    assert _error_code(r) == "username_whitespace"


def test_setup_initialize_rejects_whitespace_username(client, seeded_setup_token):
    """The very first account the system ever creates is covered too."""
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    setup_token = r.json()["setupSessionToken"]
    r = client.post(
        "/setup/initialize",
        json=_init_body(username="op s"),
        headers={"Authorization": f"Bearer {setup_token}"},
    )
    assert r.status_code == 422
    assert _error_code(r) == "username_whitespace"


# ── path 1: POST /setup/initialize ────────────────────────────────────


def _initialize(client, seeded_setup_token, **overrides):
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    setup_token = r.json()["setupSessionToken"]
    return client.post(
        "/setup/initialize",
        json=_init_body(**overrides),
        headers={"Authorization": f"Bearer {setup_token}"},
    )


def test_setup_initialize_rejects_edge_whitespace_password(client, seeded_setup_token):
    r = _initialize(client, seeded_setup_token, password="correct-horse-battery ")
    assert r.status_code == 422, r.text
    assert _error_code(r) == "password_whitespace"


def test_setup_initialize_rejects_short_password(client, seeded_setup_token):
    r = _initialize(client, seeded_setup_token, password="short")
    assert r.status_code == 422, r.text
    body = r.json()["detail"]
    assert body["error"] == "setup_password_too_short"
    assert body.get("min") == 10


def test_setup_initialize_rejects_weak_password(client, seeded_setup_token):
    """Weak runs before length, so a known-bad base reports as weak even
    when it would also pass the minimum."""
    r = _initialize(client, seeded_setup_token, password="Administrator")
    assert r.status_code == 422, r.text
    assert _error_code(r) == "setup_password_weak"


def test_setup_initialize_stores_credentials_verbatim(client, seeded_setup_token):
    """The sys-admin is the one account that cannot be recreated if it is
    unreachable — there is no other operator to reset it."""
    r = _initialize(client, seeded_setup_token, username="ops", password=_PASSPHRASE)
    assert r.status_code == 201, r.text

    db = SessionLocal()
    try:
        assert db.get(Account, "ops") is not None  # byte-identical key lookup
    finally:
        db.close()

    client.post("/auth/logout", headers=_csrf(client))
    assert client.post(
        "/auth/login", json={"username": "ops", "password": _PASSPHRASE},
    ).status_code == 200

    client.post("/auth/logout", headers=_csrf(client))
    squashed = client.post(
        "/auth/login",
        json={"username": "ops", "password": _PASSPHRASE.replace(" ", "")},
    )
    assert squashed.status_code == 401


# ── password: edges rejected, middle allowed ──────────────────────────


def test_create_account_rejects_trailing_space_password(client, seeded_setup_token):
    _init_and_login(client, seeded_setup_token)
    r = _create_account(client, password="correct-horse-battery ")
    assert r.status_code == 422
    assert _error_code(r) == "password_whitespace"


def test_create_account_rejects_whitespace_padded_short_password(client, seeded_setup_token):
    """"1234 5678 " is ten characters and only eight are real.

    Regression guard: if the length gate ever runs before the whitespace
    gate, this silently becomes a valid password again.
    """
    _init_and_login(client, seeded_setup_token)
    r = _create_account(client, password="1234 5678 ")
    assert r.status_code == 422
    assert _error_code(r) == "password_whitespace"


def test_internal_whitespace_password_is_accepted_and_usable(client, seeded_setup_token):
    """Passphrases must survive end to end — set, stored, and logged in with."""
    _init_and_login(client, seeded_setup_token)
    r = _create_account(client, username="bob", password="correct horse battery")
    assert r.status_code == 201, r.text

    client.post("/auth/logout", headers=_csrf(client))
    r = client.post(
        "/auth/login", json={"username": "bob", "password": "correct horse battery"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"


# ── paths 2 & 3: POST /sysadmin/accounts, both roles ──────────────────


@pytest.mark.parametrize("role", ["admin", "healthworker"])
def test_create_account_policy_is_role_independent(client, seeded_setup_token, role):
    """One endpoint mints both operating roles off one request model, so
    the policy cannot differ between them — but only a test says so. The
    healthworker branch had no credential coverage at all before this.
    """
    _init_and_login(client, seeded_setup_token)

    bad_name = _create_account(client, username="al ice", role=role)
    assert bad_name.status_code == 422
    assert _error_code(bad_name) == "username_whitespace"

    bad_pw = _create_account(client, username="alice", password="secret ", role=role)
    assert bad_pw.status_code == 422
    assert _error_code(bad_pw) == "password_whitespace"

    ok = _create_account(client, username="alice", password=_PASSPHRASE, role=role)
    assert ok.status_code == 201, ok.text

    client.post("/auth/logout", headers=_csrf(client))
    signed_in = client.post(
        "/auth/login", json={"username": "alice", "password": _PASSPHRASE},
    )
    assert signed_in.status_code == 200, signed_in.text
    assert signed_in.json()["role"] == role


def test_create_account_rejects_short_password(client, seeded_setup_token):
    _init_and_login(client, seeded_setup_token)
    r = _create_account(client, password="short")
    assert r.status_code == 422
    body = r.json()["detail"]
    assert body["error"] == "setup_password_too_short"
    assert body.get("min") == 10


def test_create_account_rejects_weak_password(client, seeded_setup_token):
    _init_and_login(client, seeded_setup_token)
    r = _create_account(client, password="change-me-to-a-long-random-string")
    assert r.status_code == 422
    assert _error_code(r) == "setup_password_weak"


def test_create_account_stores_username_verbatim(client, seeded_setup_token):
    """No case-folding, no normalising. Login is an exact primary-key
    lookup, so any transformation here is a lockout there.
    """
    _init_and_login(client, seeded_setup_token)
    assert _create_account(client, username="Bob.Smith_1").status_code == 201

    db = SessionLocal()
    try:
        assert db.get(Account, "Bob.Smith_1") is not None
        assert db.get(Account, "bob.smith_1") is None
    finally:
        db.close()


# ── path 4: POST /sysadmin/accounts/{username}/reset-password ─────────


def _reset_password(client, username, password):
    return client.post(
        f"/sysadmin/accounts/{username}/reset-password",
        json={"password": password},
        headers=_csrf(client),
    )


@pytest.mark.parametrize("password", [" new-password-1234", "new-password-1234 "])
def test_reset_password_rejects_edge_whitespace(client, seeded_setup_token, password):
    _init_and_login(client, seeded_setup_token)
    assert _create_account(client, username="bob").status_code == 201

    r = _reset_password(client, "bob", password)
    assert r.status_code == 422, r.text
    assert _error_code(r) == "password_whitespace"


def test_reset_password_rejects_short_password(client, seeded_setup_token):
    _init_and_login(client, seeded_setup_token)
    assert _create_account(client, username="bob").status_code == 201

    r = _reset_password(client, "bob", "short")
    assert r.status_code == 422, r.text
    body = r.json()["detail"]
    assert body["error"] == "setup_password_too_short"
    assert body.get("min") == 10


def test_reset_password_passphrase_round_trips(client, seeded_setup_token):
    """An operator resetting someone else's password must not quietly
    reshape it — the user is told the value out-of-band and types it
    verbatim at the login prompt.
    """
    _init_and_login(client, seeded_setup_token)
    assert _create_account(client, username="bob").status_code == 201
    assert _reset_password(client, "bob", _PASSPHRASE).status_code == 204

    client.post("/auth/logout", headers=_csrf(client))
    assert client.post(
        "/auth/login", json={"username": "bob", "password": _PASSPHRASE},
    ).status_code == 200

    client.post("/auth/logout", headers=_csrf(client))
    assert client.post(
        "/auth/login", json={"username": "bob", "password": _PASSPHRASE + " "},
    ).status_code == 401


# ── login performs NO transformation ──────────────────────────────────


def test_login_does_not_trim_the_submitted_password(client, seeded_setup_token):
    """Login must send what was typed, verbatim.

    If login trimmed, the second request below would succeed — and that
    asymmetry (write untrimmed, login trimmed) is exactly what made a
    first-run account unable to authenticate at all.
    """
    _init_and_login(client, seeded_setup_token)
    assert _create_account(client, username="carol", password="pass word here").status_code == 201
    client.post("/auth/logout", headers=_csrf(client))

    exact = client.post(
        "/auth/login", json={"username": "carol", "password": "pass word here"}
    )
    assert exact.status_code == 200

    padded = client.post(
        "/auth/login", json={"username": "carol", "password": " pass word here"}
    )
    assert padded.status_code == 401
    assert _error_code(padded) == "invalid_credentials"


def test_login_does_not_validate_password_policy(client, seeded_setup_token):
    """A password that would be *rejected* at creation must still be
    *accepted for checking* at login — otherwise a rule change locks out
    every account that predates it. The response is a plain credential
    mismatch, never a policy complaint.
    """
    _init_and_login(client, seeded_setup_token)
    client.post("/auth/logout", headers=_csrf(client))

    r = client.post("/auth/login", json={"username": "ops", "password": " short "})
    assert r.status_code == 401
    assert _error_code(r) == "invalid_credentials"


# ── scope guard: non-credential fields keep their old behaviour ───────


def test_non_credential_fields_still_trim(client, seeded_setup_token):
    """fullName / contact are NOT credentials and must keep being trimmed
    by `_clean()`. Guards the boundary of the credential-policy change.
    """
    _init_and_login(client, seeded_setup_token)
    r = _create_account(client, username="dave", fullName="  Dave Smith  ", contact="  +94 77  ")
    assert r.status_code == 201, r.text

    roster = client.get("/sysadmin/accounts").json()
    dave = next(row for row in roster if row["username"] == "dave")
    assert dave["fullName"] == "Dave Smith"
    assert dave["contact"] == "+94 77"
