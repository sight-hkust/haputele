"""API-level tests for the credential policy.

`test_credentials_service.py` covers the validators in isolation. This file
proves the rules actually reach the wire — that they are enforced by the
endpoints themselves and not merely by the browser, since the API is
directly reachable.

The two rules differ deliberately:

    username — no whitespace at all, internal or external
    password — no leading/trailing whitespace; internal whitespace allowed

And login is deliberately exempt from both: it *verifies* a credential, it
never *sets* policy. See services/credentials.py.
"""


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
