"""Integration tests for the first-run setup feature.

Three scenarios, matching the acceptance criteria in the feature brief:

  1. Uninitialized: a protected endpoint returns 409 setup_required.
  2. Full flow: verify-token → initialize (auto-login) → sys-admin endpoint.
  3. Idempotency: a second /setup/initialize returns 409 setup_already_completed.

Auth for the setup flow is **bearer-token-only** — no cookies are set
during stages 1-2. POST /setup/verify-token returns the setup-session
JWT in the response body; the wizard echoes it back on /setup/initialize
as `Authorization: Bearer <jwt>`. /setup/initialize then sets the real
`session` + `csrf_token` cookies on success, identical to /auth/login.
After that point the rest of the app uses cookie-based session auth +
double-submit CSRF (the `_csrf` helper below).

Error responses carry an additional `requestId` field (injected by
RequestIdMiddleware + the http_exception_handler in main.py). Assertions
use key lookups rather than full-dict equality to stay robust.
"""


def _error_code(resp) -> str:
    return resp.json()["detail"]["error"]


def _csrf(client) -> dict[str, str]:
    """Echo the current CSRF cookie as the matching header.

    Used by post-init API calls — /auth/logout and any authenticated
    state-changing endpoint. The setup flow itself doesn't need this.
    """
    token = client.cookies.get("csrf_token")
    assert token, "csrf_token cookie not set — did the prior request mint a session?"
    return {"X-CSRF-Token": token}


def _bearer(token: str) -> dict[str, str]:
    """Authorization header for /setup/initialize."""
    return {"Authorization": f"Bearer {token}"}


# ── 1. Uninitialized gate ──────────────────────────────────────────

def test_health_open_when_uninitialized(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_status_open_when_uninitialized(client):
    r = client.get("/setup/status")
    assert r.status_code == 200
    assert r.json() == {"initialized": False}


def test_protected_route_blocked_when_uninitialized(client):
    # /patients requires HW auth, but the gate fires before the auth dep.
    r = client.get("/patients")
    assert r.status_code == 409
    assert _error_code(r) == "setup_required"


def test_openapi_open_when_uninitialized(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert r.json()["info"]["title"] == "HapuTele API"


# ── 2. Full setup flow ─────────────────────────────────────────────

def _body() -> dict:
    return {
        "sysAdmin": {"username": "ops", "password": "correct-horse-battery-staple"},
        "instituteIdentity": {
            "name": "HapuTele Demo Clinic",
            "addressLines": ["12 Test Lane", "Colombo 03"],
            "contactPhone": "+94 11 555 0100",
            # email-validator rejects .test/.localhost as reserved TLDs.
            "contactEmail": "ops@example.com",
        },
        "appTimezone": "Asia/Colombo",
        "exportTimezone": "Asia/Colombo",
        "masterConsentVersion": "v1",
    }


def test_full_setup_flow(client, seeded_setup_token):
    # verify-token — returns the JWT in the body; sets NO cookies.
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "expiresAt" in body
    assert body["setupSessionToken"], "verify-token must return the JWT in body"
    assert not client.cookies.get("setup_session"), "no setup cookies in the new flow"
    assert not client.cookies.get("csrf_token"), "no csrf_token cookie pre-init"

    setup_token = body["setupSessionToken"]

    # initialize — bearer in Authorization header; no CSRF check.
    r = client.post("/setup/initialize", json=_body(), headers=_bearer(setup_token))
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["ok"] is True
    assert out["username"] == "ops"
    assert out["role"] == "sys-admin"
    # Initialize mints the real session pair, just like /auth/login.
    assert client.cookies.get("session"), "session cookie missing after initialize"
    assert client.cookies.get("csrf_token"), "csrf_token cookie missing after initialize"

    # status flips to true after init
    r = client.get("/setup/status")
    assert r.status_code == 200
    assert r.json() == {"initialized": True}

    # sys-admin endpoints reachable via the cookie. GETs don't need CSRF.
    r = client.get("/sysadmin/me")
    assert r.status_code == 200, r.text
    assert r.json() == {"username": "ops", "role": "sys-admin"}

    r = client.get("/sysadmin/system-config")
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert cfg["instituteName"] == "HapuTele Demo Clinic"
    assert cfg["appTimezone"] == "Asia/Colombo"
    assert cfg["masterConsentVersion"] == "v1"
    assert cfg["initializedAt"] is not None

    # /auth/me mirrors the session state for client-side rehydration.
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json() == {"username": "ops", "role": "sys-admin"}

    # Logout clears both cookies (the unsafe verb takes the CSRF header).
    r = client.post("/auth/logout", headers=_csrf(client))
    assert r.status_code == 204
    assert not client.cookies.get("session"), "session cookie should be cleared"
    # A protected route now refuses us.
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_initialize_auto_logs_in_sysadmin(client, seeded_setup_token):
    """The wizard hands off into an authenticated sys-admin session, so
    the operator never types the password they just chose. The setup
    JWT lives only in the response body / Authorization header — no
    cookie is involved during stages 1-2.
    """
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    setup_token = r.json()["setupSessionToken"]
    assert not client.cookies.get("setup_session"), "verify-token must not set cookies"

    r = client.post("/setup/initialize", json=_body(), headers=_bearer(setup_token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["username"] == "ops"
    assert body["role"] == "sys-admin"
    assert "expiresAt" in body
    assert client.cookies.get("session")
    assert client.cookies.get("csrf_token")

    # Prove the session is valid: an authenticated read works.
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json() == {"username": "ops", "role": "sys-admin"}


def test_verify_token_sets_no_cookies(client, seeded_setup_token):
    """Regression guard against accidentally re-introducing cookie writes
    in /setup/verify-token. The whole point of the bearer-token redesign
    is that no cookie exists during the wizard flow.
    """
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    assert client.cookies.get("setup_session") is None
    assert client.cookies.get("csrf_token") is None
    assert client.cookies.get("session") is None


# ── 3. Post-init rejections ────────────────────────────────────────

def test_initialize_twice_returns_already_completed(client, seeded_setup_token):
    # First init.
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    setup_token = r.json()["setupSessionToken"]
    r = client.post("/setup/initialize", json=_body(), headers=_bearer(setup_token))
    assert r.status_code == 201

    # Second init attempt — middleware should refuse before the handler runs.
    # The bearer header doesn't matter; the setup gate short-circuits.
    r = client.post(
        "/setup/initialize",
        json=_body(),
        headers=_bearer("any-value-mw-fires-first"),
    )
    assert r.status_code == 409
    assert _error_code(r) == "setup_already_completed"


def test_verify_token_with_invalid_token_returns_401(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": "nope-not-the-real-token"})
    assert r.status_code == 401
    assert _error_code(r) == "setup_token_invalid"


def test_initialize_without_bearer_returns_401(client):
    """No Authorization header → setup_session_invalid."""
    r = client.post("/setup/initialize", json=_body())
    assert r.status_code == 401
    assert _error_code(r) == "setup_session_invalid"


def test_initialize_with_malformed_bearer_returns_401(client):
    """Authorization header present but not 'Bearer <jwt>' → 401."""
    for bad in ("not-bearer-at-all", "Bearer ", "Bearer  ", "Basic abc"):
        r = client.post(
            "/setup/initialize",
            json=_body(),
            headers={"Authorization": bad},
        )
        assert r.status_code == 401, f"header={bad!r}: {r.text}"
        assert _error_code(r) == "setup_session_invalid"


def test_initialize_with_garbage_bearer_returns_401(client):
    """Bearer header has a string, but it isn't a valid JWT."""
    r = client.post(
        "/setup/initialize",
        json=_body(),
        headers=_bearer("this.isnt.a.real.jwt"),
    )
    assert r.status_code == 401
    assert _error_code(r) == "setup_session_invalid"


def test_initialize_with_weak_password_returns_422(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    setup_token = r.json()["setupSessionToken"]
    body = _body()
    body["sysAdmin"]["password"] = "admin"  # short + weak
    r = client.post("/setup/initialize", json=body, headers=_bearer(setup_token))
    assert r.status_code == 422
    assert _error_code(r) in {"setup_password_too_short", "setup_password_weak"}


def test_initialize_with_short_password_returns_422(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    setup_token = r.json()["setupSessionToken"]
    body = _body()
    body["sysAdmin"]["password"] = "shortpw12"  # 9 chars, below the 10-char minimum
    r = client.post("/setup/initialize", json=body, headers=_bearer(setup_token))
    assert r.status_code == 422
    assert _error_code(r) == "setup_password_too_short"


# ── 4. CSRF on the user (post-init) flow ──────────────────────────

def test_logout_without_csrf_returns_403(client, seeded_setup_token):
    """The user flow keeps cookie-based double-submit CSRF — that pattern
    works fine for the long-lived authenticated session and wasn't part
    of the desync window the setup-flow redesign addressed.
    """
    # Spin up a working session via the full setup path.
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    setup_token = r.json()["setupSessionToken"]
    r = client.post("/setup/initialize", json=_body(), headers=_bearer(setup_token))
    assert r.status_code == 201
    # Re-login to prove /auth/login still mints the same cookie pair.
    r = client.post(
        "/auth/login",
        json={"username": "ops", "password": "correct-horse-battery-staple"},
    )
    assert r.status_code == 200

    # POST /auth/logout without the X-CSRF-Token header → 403.
    r = client.post("/auth/logout")
    assert r.status_code == 403
    assert _error_code(r) == "csrf_failed"
    # The session cookie is still intact.
    assert client.cookies.get("session")
