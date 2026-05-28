"""Integration tests for the first-run setup feature.

Three scenarios, matching the acceptance criteria in the feature brief:

  1. Uninitialized: a protected endpoint returns 409 setup_required.
  2. Full flow: verify-token → initialize (auto-login) → sys-admin endpoint.
  3. Idempotency: a second /setup/initialize returns 409 setup_already_completed.

Auth is cookie-based: POST /setup/verify-token mints a setup_session;
POST /setup/initialize swaps it for a real session cookie; POST /auth/login
(used by some tests) mints the same pair directly. The TestClient (httpx)
auto-persists cookies, so subsequent calls inherit them. For unsafe verbs
the client also has to echo the CSRF cookie back as `X-CSRF-Token` — that's
the `_csrf` helper below.

Error responses carry an additional `requestId` field (injected by
RequestIdMiddleware + the http_exception_handler in main.py). Assertions
use key lookups rather than full-dict equality to stay robust.
"""


def _error_code(resp) -> str:
    return resp.json()["detail"]["error"]


def _csrf(client) -> dict[str, str]:
    """Echo the current CSRF cookie as the matching header."""
    token = client.cookies.get("csrf_token")
    assert token, "csrf_token cookie not set — did the prior request mint a session?"
    return {"X-CSRF-Token": token}


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
    # verify-token — sets setup_session + csrf_token cookies.
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "expiresAt" in body
    assert "setupSessionToken" not in body, "JWT must never appear in the response body"
    assert client.cookies.get("setup_session"), "setup_session cookie missing"
    assert client.cookies.get("csrf_token"), "csrf_token cookie missing"

    # initialize — cookies auto-sent by the client; CSRF echo in header.
    r = client.post("/setup/initialize", json=_body(), headers=_csrf(client))
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["ok"] is True
    assert out["username"] == "ops"
    assert out["role"] == "sys-admin"
    # The setup cookie is consumed; a real sys-admin session takes its place.
    assert not client.cookies.get("setup_session"), "setup_session must be cleared"
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
    cookie is consumed atomically with the swap.
    """
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    assert client.cookies.get("setup_session")

    r = client.post("/setup/initialize", json=_body(), headers=_csrf(client))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["username"] == "ops"
    assert body["role"] == "sys-admin"
    assert "expiresAt" in body
    assert not client.cookies.get("setup_session")
    assert client.cookies.get("session")
    assert client.cookies.get("csrf_token")

    # Prove the session is valid: an authenticated read works.
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json() == {"username": "ops", "role": "sys-admin"}


# ── 3. Post-init rejections ────────────────────────────────────────

def test_initialize_twice_returns_already_completed(client, seeded_setup_token):
    # First init.
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    r = client.post("/setup/initialize", json=_body(), headers=_csrf(client))
    assert r.status_code == 201

    # Second init attempt — middleware should refuse before the handler runs.
    # The setup_session cookie was cleared at the end of the first init, so
    # we mint a fresh one. The middleware short-circuits regardless.
    r = client.post(
        "/setup/initialize",
        json=_body(),
        headers={"X-CSRF-Token": "any-value-mw-fires-first"},
    )
    assert r.status_code == 409
    assert _error_code(r) == "setup_already_completed"


def test_verify_token_with_invalid_token_returns_401(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": "nope-not-the-real-token"})
    assert r.status_code == 401
    assert _error_code(r) == "setup_token_invalid"


def test_initialize_without_session_token_returns_401(client):
    # No verify-token call → no setup_session cookie → reject.
    r = client.post(
        "/setup/initialize",
        json=_body(),
        headers={"X-CSRF-Token": "anything"},
    )
    assert r.status_code == 401
    assert _error_code(r) == "setup_session_invalid"


def test_initialize_without_csrf_returns_403(client, seeded_setup_token):
    """The setup cookie pair alone isn't enough — the CSRF echo is required."""
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    r = client.post("/setup/initialize", json=_body())  # no X-CSRF-Token
    assert r.status_code == 403
    assert _error_code(r) == "csrf_failed"


def test_initialize_with_weak_password_returns_422(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    body = _body()
    body["sysAdmin"]["password"] = "admin"  # short + weak
    r = client.post("/setup/initialize", json=body, headers=_csrf(client))
    assert r.status_code == 422
    assert _error_code(r) in {"setup_password_too_short", "setup_password_weak"}


def test_initialize_with_short_password_returns_422(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    body = _body()
    body["sysAdmin"]["password"] = "shortpw12"  # 9 chars, below the 10-char minimum
    r = client.post("/setup/initialize", json=body, headers=_csrf(client))
    assert r.status_code == 422
    assert _error_code(r) == "setup_password_too_short"


def test_initialize_with_reserved_username_returns_422(client, seeded_setup_token):
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    assert r.status_code == 200
    body = _body()
    body["sysAdmin"]["username"] = "admin"
    r = client.post("/setup/initialize", json=body, headers=_csrf(client))
    assert r.status_code == 422
    assert _error_code(r) == "setup_username_reserved"


# ── 4. CSRF on the user flow ──────────────────────────────────────

def test_logout_without_csrf_returns_403(client, seeded_setup_token):
    """The user flow's CSRF guard mirrors the setup flow's."""
    # Spin up a working session via the full setup path.
    r = client.post("/setup/verify-token", json={"token": seeded_setup_token})
    r = client.post("/setup/initialize", json=_body(), headers=_csrf(client))
    assert r.status_code == 201
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
