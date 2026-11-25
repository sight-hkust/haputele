"""End-to-end smoke test of the dev Ory stack (Kratos + Hydra + Mailpit).

Exercises the design in docs/ory-auth-migration.md without any UI or app code:
  app -> Hydra /oauth2/auth -> /login?login_challenge -> Kratos login flow
  (email + password) -> Hydra consent -> code ->
  token endpoint -> ID token whose `sub` is the Kratos identity id,
  then RP-initiated logout through Hydra ending the Kratos session.
Also covers case-insensitive email login and uniqueness, disabled
verification, recovery by code via Mailpit, admin invite codes, and
admin-set passwords for staff with a placeholder address.

Run against the dev stack (safe to rerun; every run uses fresh addresses and
its own OAuth2 client, `haputele-smoke`):
    docker compose up -d kratos hydra
    python ory/smoke.py        # standard library only
"""

import base64
import hashlib
import http.cookiejar
import json
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

KRATOS_PUBLIC = "http://localhost:4433"
KRATOS_ADMIN = "http://localhost:4434"
HYDRA_PUBLIC = "http://localhost:4444"
HYDRA_ADMIN = "http://localhost:4445"
MAILPIT = "http://localhost:8025"
REDIRECT_URI = "http://localhost:3000/api/auth/callback"
RUN = secrets.token_hex(3)
CLIENT_ID = "haputele-smoke"
USERNAME, PASSWORD = "dr.smoke", "correct-horse-battery-staple"
EMAIL = f"Dr.Smoke+{RUN}@Example.org"
INVITEE = f"hw.invitee+{RUN}@example.org"
UNKNOWN = f"nobody+{RUN}@example.org"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


jar = http.cookiejar.CookieJar()
browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)
plain = urllib.request.build_opener(NoRedirect)


def call(opener, method, url, body=None, headers=None, form=False):
    headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        resp = opener.open(req)
    except urllib.error.HTTPError as err:
        resp = err
    raw = resp.read()
    try:
        payload = json.loads(raw) if raw else None
    except ValueError:
        payload = raw.decode(errors="replace")
    return resp.status, resp.headers, payload


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + (f"  ({detail})" if detail else ""))
    if not ok:
        raise SystemExit(1)


def csrf_of(flow):
    return next(n["attributes"]["value"] for n in flow["ui"]["nodes"]
                if n["attributes"].get("name") == "csrf_token")


# 1. Admin-create an identity with a password, as the app's account forms will.
status, _, ident = call(plain, "POST", f"{KRATOS_ADMIN}/admin/identities", {
    "schema_id": "staff",
    "traits": {"email": EMAIL},
    "credentials": {"password": {"config": {"password": PASSWORD}}},
})
check("admin creates an identity with a password", status == 201, f"status {status}")
identity_id = ident["id"]
print(f"      stored identifier: {ident['credentials']['password']['identifiers']}")
check("identity has no verifiable addresses (verification disabled)", not ident.get("verifiable_addresses"))
_, _, vflow = call(plain, "GET", f"{KRATOS_PUBLIC}/self-service/verification/api")
check("verification flow is disabled", (vflow or {}).get("error", {}).get("code") in (400, 404),
      f"{(vflow or {}).get('error', {}).get('reason', vflow)}"[:90])

# 1b. Email uniqueness is case-insensitive.
status, _, _ = call(plain, "POST", f"{KRATOS_ADMIN}/admin/identities", {
    "schema_id": "staff", "traits": {"email": EMAIL.upper()}})
check("second identity with the same email in another case is rejected", status == 409, f"status {status}")

# 2. Register a first-party-style OAuth2 client, asking for a static client_id.
call(plain, "DELETE", f"{HYDRA_ADMIN}/admin/clients/{CLIENT_ID}")  # from a previous run
status, _, client = call(plain, "POST", f"{HYDRA_ADMIN}/admin/clients", {
    "client_id": CLIENT_ID,
    "client_name": "HapuTele",
    "grant_types": ["authorization_code"],
    "response_types": ["code"],
    "scope": "openid",
    "redirect_uris": [REDIRECT_URI],
    "post_logout_redirect_uris": ["http://localhost:3000/login"],
    "token_endpoint_auth_method": "client_secret_basic",
    "skip_consent": True,
    "skip_logout_consent": True,
})
check("create OAuth2 client", status == 201, f"status {status}")
client_id, client_secret = client["client_id"], client["client_secret"]
check("static client_id honoured", client_id == CLIENT_ID, client_id)

# 3. App starts an authorization-code + PKCE request at Hydra.
verifier = secrets.token_urlsafe(48)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
state, nonce = secrets.token_urlsafe(16), secrets.token_urlsafe(16)
auth_url = f"{HYDRA_PUBLIC}/oauth2/auth?" + urllib.parse.urlencode({
    "client_id": client_id, "response_type": "code", "scope": "openid",
    "redirect_uri": REDIRECT_URI, "state": state, "nonce": nonce,
    "code_challenge": challenge, "code_challenge_method": "S256",
})
status, headers, _ = call(browser, "GET", auth_url)
location = headers.get("Location", "")
check("Hydra redirects to the frontend login page", location.startswith("http://localhost:3000/login?login_challenge="), location[:60])
login_challenge = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)["login_challenge"][0]

# 4. The login page starts a Kratos browser login flow bound to the challenge.
status, _, flow = call(browser, "GET", f"{KRATOS_PUBLIC}/self-service/login/browser?login_challenge={login_challenge}")
check("Kratos login flow created with login_challenge", status == 200 and flow.get("oauth2_login_challenge") == login_challenge, f"status {status}")

# 5. Submit the email (different case) + password.
status, _, result = call(browser, "POST", f"{KRATOS_PUBLIC}/self-service/login?flow={flow['id']}", {
    "method": "password", "identifier": EMAIL.upper(), "password": PASSWORD, "csrf_token": csrf_of(flow),
})
redirect = (result or {}).get("redirect_browser_to") or ""
check("Kratos accepts the password + uppercase email, hands back to Hydra",
      redirect.startswith(f"{HYDRA_PUBLIC}/oauth2/auth") and "login_verifier=" in redirect, f"status {status}")

# 6. Follow Hydra's redirects until it reaches the app callback (consent skipped).
url = redirect
for _ in range(5):
    status, headers, body = call(browser, "GET", url)
    url = headers.get("Location", "")
    print(f"      hop: {status} -> {url[:110]}")
    if not url.startswith(HYDRA_PUBLIC):
        break

# 6b. Hydra still calls the consent endpoint; the consent app auto-accepts
#     for skip_consent clients and can inject custom ID-token claims.
if url.startswith("http://localhost:3000/consent"):
    consent_challenge = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["consent_challenge"][0]
    q = urllib.parse.urlencode({"consent_challenge": consent_challenge})
    status, _, creq = call(plain, "GET", f"{HYDRA_ADMIN}/admin/oauth2/auth/requests/consent?{q}")
    print(f"      consent request: skip={creq['skip']} client.skip_consent={creq['client'].get('skip_consent')} "
          f"subject_is_identity={creq['subject'] == identity_id}")
    status, _, accepted = call(plain, "PUT", f"{HYDRA_ADMIN}/admin/oauth2/auth/requests/consent/accept?{q}", {
        "grant_scope": creq["requested_scope"],
        "grant_access_token_audience": creq["requested_access_token_audience"],
        "session": {"id_token": {"preferred_username": USERNAME}},
    })
    check("consent auto-accepted via admin API", status == 200, f"status {status}")
    url = accepted["redirect_to"]
    for _ in range(5):
        status, headers, _ = call(browser, "GET", url)
        url = headers.get("Location", "")
        print(f"      hop: {status} -> {url[:110]}")
        if not url.startswith(HYDRA_PUBLIC):
            break
check("Hydra redirects to the app callback with a code", url.startswith(REDIRECT_URI), url[:70])
params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
check("state round-trips", params.get("state") == [state])

# 7. Back-channel code exchange.
basic = base64.b64encode(f"{urllib.parse.quote(client_id)}:{urllib.parse.quote(client_secret)}".encode()).decode()
status, _, tokens = call(plain, "POST", f"{HYDRA_PUBLIC}/oauth2/token", {
    "grant_type": "authorization_code", "code": params["code"][0],
    "redirect_uri": REDIRECT_URI, "code_verifier": verifier,
}, headers={"Authorization": f"Basic {basic}"}, form=True)
check("token exchange returns id_token and no refresh_token (openid only)", status == 200 and "id_token" in tokens and "refresh_token" not in tokens, f"status {status}")
claims = json.loads(base64.urlsafe_b64decode(tokens["id_token"].split(".")[1] + "=="))
check("ID token sub is the Kratos identity id", claims["sub"] == identity_id)
check("ID token iss/aud/nonce", claims["iss"] == f"{HYDRA_PUBLIC}/" and client_id in claims["aud"] and claims["nonce"] == nonce)
print(f"      id_token claims: {sorted(claims)}; preferred_username={claims.get('preferred_username')!r}")

# 8. Recovery code mail: sent for the known address, not for an unknown one.
def mail_for(address):
    _, _, inbox = call(plain, "GET", f"{MAILPIT}/api/v1/messages")
    return [m for m in inbox["messages"] if any(t["Address"].lower() == address.lower() for t in m["To"])]


def code_in(message):
    _, _, full = call(plain, "GET", f"{MAILPIT}/api/v1/message/{message['ID']}")
    return re.search(r"\b(\d{6})\b", full["Text"]).group(1)


flows = {}
for address in (EMAIL.upper(), UNKNOWN):
    _, _, rflow = call(plain, "GET", f"{KRATOS_PUBLIC}/self-service/recovery/api")
    status, _, _ = call(plain, "POST", f"{KRATOS_PUBLIC}/self-service/recovery?flow={rflow['id']}",
                        {"method": "code", "email": address})
    check(f"recovery request accepted for {address}", status == 200, f"status {status}")
    flows[address] = rflow["id"]
time.sleep(6)  # courier polls the queue
check("recovery code mailed to the known address (requested in upper case)", len(mail_for(EMAIL)) == 1)
check("nothing mailed to the unknown address", not mail_for(UNKNOWN))

# 9. RP-initiated logout through Hydra also ends the Kratos session.
def active_kratos_sessions():
    _, _, sessions = call(plain, "GET", f"{KRATOS_ADMIN}/admin/identities/{identity_id}/sessions?active=true")
    return len(sessions or [])

check("Kratos session active before logout", active_kratos_sessions() >= 1)
url = f"{HYDRA_PUBLIC}/oauth2/sessions/logout?" + urllib.parse.urlencode({
    "id_token_hint": tokens["id_token"], "post_logout_redirect_uri": "http://localhost:3000/login", "state": "bye"})
for _ in range(6):
    status, headers, _ = call(browser, "GET", url)
    url = headers.get("Location", "")
    print(f"      logout hop: {status} -> {url[:100]}")
    if url.startswith("http://localhost:3000/logout"):
        challenge = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["logout_challenge"][0]
        q = urllib.parse.urlencode({"logout_challenge": challenge})
        _, _, lreq = call(plain, "GET", f"{HYDRA_ADMIN}/admin/oauth2/auth/requests/logout?{q}")
        print(f"      logout request: rp_initiated={lreq.get('rp_initiated')} client={(lreq.get('client') or {}).get('client_id')}")
        status, _, accepted = call(plain, "PUT", f"{HYDRA_ADMIN}/admin/oauth2/auth/requests/logout/accept?{q}")
        check("logout accepted via admin API", status == 200, f"status {status}")
        url = accepted["redirect_to"]
        continue
    if not url.startswith(HYDRA_PUBLIC):
        break
check("logout ends at post_logout_redirect_uri", url.startswith("http://localhost:3000/login"), url[:80])
time.sleep(1)
check("Kratos session revoked by Hydra logout", active_kratos_sessions() == 0)
# 9b. Complete the recovery requested in step 8 (after logout, so its
#     revoke_active_sessions hook doesn't interfere with step 9).
status, _, done = call(plain, "POST", f"{KRATOS_PUBLIC}/self-service/recovery?flow={flows[EMAIL.upper()]}",
                       {"method": "code", "code": code_in(mail_for(EMAIL)[0])})
target = (done or {}).get("redirect_browser_to") or ""
print(f"      recovery submit: status {status}, redirect_browser_to={target[:70]}")
check("recovery code is accepted and leads to the settings flow", target.startswith("http://localhost:3000/settings?flow="))

# 10. Admin-created account with no password: an admin recovery code (the
#     invite) lets the user set one. Nothing checks verification.
status, _, inv = call(plain, "POST", f"{KRATOS_ADMIN}/admin/identities", {
    "schema_id": "staff", "traits": {"email": INVITEE}})
check("create password-less identity for an invitee", status == 201, f"status {status}")
status, _, rc = call(plain, "POST", f"{KRATOS_ADMIN}/admin/recovery/code", {"identity_id": inv["id"], "expires_in": "72h"})
check("admin recovery code issued", status == 201 and rc.get("recovery_code"), f"status {status}")
check("invite link opens the frontend recovery page", rc["recovery_link"].startswith("http://localhost:3000/recovery?flow="), rc["recovery_link"][:60])
flow_id = urllib.parse.parse_qs(urllib.parse.urlparse(rc["recovery_link"]).query)["flow"][0]
ijar = http.cookiejar.CookieJar()
invitee = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(ijar), NoRedirect)
_, _, rflow = call(invitee, "GET", f"{KRATOS_PUBLIC}/self-service/recovery/flows?id={flow_id}")
status, _, done = call(invitee, "POST", f"{KRATOS_PUBLIC}/self-service/recovery?flow={flow_id}",
                       {"method": "code", "code": rc["recovery_code"]})
check("invite code leads to the settings flow",
      ((done or {}).get("redirect_browser_to") or "").startswith("http://localhost:3000/settings"), f"status {status}")

# 11. An admin-set password works for a staff member with no real mailbox,
#     and an admin can reset it (no email involved).
NOMAIL = f"nimal.hw+{RUN}@haputele.local"
status, _, nm = call(plain, "POST", f"{KRATOS_ADMIN}/admin/identities", {
    "schema_id": "staff", "traits": {"email": NOMAIL},
    "credentials": {"password": {"config": {"password": "first-password-123"}}}})
check("admin creates an account with a placeholder email and a password", status == 201, f"status {status}")
status, _, full = call(plain, "GET", f"{KRATOS_ADMIN}/admin/identities/{nm['id']}")
status, _, _ = call(plain, "PUT", f"{KRATOS_ADMIN}/admin/identities/{nm['id']}", {
    "schema_id": "staff", "traits": full["traits"], "state": "active",
    "credentials": {"password": {"config": {"password": "second-password-456"}}}})
check("admin resets the password via the admin API", status == 200, f"status {status}")
njar = http.cookiejar.CookieJar()
nb = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(njar), NoRedirect)
for pw, expect in (("first-password-123", False), ("second-password-456", True)):
    _, _, lf = call(nb, "GET", f"{KRATOS_PUBLIC}/self-service/login/browser")
    status, _, res = call(nb, "POST", f"{KRATOS_PUBLIC}/self-service/login?flow={lf['id']}", {
        "method": "password", "identifier": NOMAIL, "password": pw, "csrf_token": csrf_of(lf)})
    check(f"login with the {'new' if expect else 'old'} password {'succeeds' if expect else 'fails'}",
          (status == 200) == expect, f"status {status}")

print("ALL CHECKS PASSED")
