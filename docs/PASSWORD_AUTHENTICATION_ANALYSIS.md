# Password Authentication Analysis

Status: code-based review of `main` at `3001293` (2026-08-03). Documentation was treated as non-authoritative; every statement about current behavior below comes from executable code, schemas, migrations, configuration, or tests.

## TL;DR

HapuTele has four account roles—`sys-admin`, `admin`, `healthworker`, and `doctor`—stored in one `accounts` table. Passwords are salted bcrypt hashes, login returns an HttpOnly JWT cookie, and unsafe authenticated requests require a double-submit CSRF token. Setup and doctor invites use high-entropy, hashed, single-use tokens. These are good foundations.

The implementation is not yet safe enough for a healthcare application:

1. A deactivated doctor can still obtain a new session because login checks approval/rejection but not `Doctor.active`.
2. Existing JWTs remain usable after account disable/delete, doctor deactivation, password reset, and logout from another device. Request authentication validates only JWT claims and never reloads account status.
3. Password policy differs by entry point: 10 characters for setup/operator accounts, 8 for doctor onboarding, and no server-side policy for manual doctor creation or doctor password editing.
4. There is no login or token-verification rate limiting, MFA, self-service recovery for operator accounts, or server-side session revocation.
5. Client code trims passwords. That silently changes a user-selected secret and, on at least one setup path, can create a password that the login page can never submit unchanged.
6. bcrypt is used without guarding its 72-byte input limit. There is no maximum request/password size, Unicode normalization, or breached-password blocklist.

Recommended direction: centralize all credential validation, stop trimming passwords, require at least 15 characters while password-only authentication remains, accept long Unicode passphrases, block known-compromised passwords, migrate new hashes to Argon2id while rehashing bcrypt on successful login, provision all users through expiring invites, require MFA for privileged roles, and replace stateless long-lived JWT authorization with revocable server-side sessions.

## Scope and terminology

- “Registration” includes first-run setup, privileged creation of accounts, doctor invitation/onboarding, and legacy manual doctor creation.
- “Password change” includes authenticated change, administrator reset, and invite-based rotation. The project currently has no general authenticated self-service password-change endpoint.
- “Current session” means the JWT in the `session` cookie, not React identity state.
- Findings distinguish code that exists from proposed behavior. Recommendations do not claim to be implemented.

## Current account model

All four roles use [`Account`](../backend/app/models.py#L21): username is the primary key, `password` is a 255-character hash field, `role` is a string, and operating accounts may have `disabled_at`. Doctors have a second [`Doctor`](../backend/app/models.py#L39) row with `active`, approval, and rejection state.

| Role | Who initially selects the password? | Current creation path | Server password rule | Recovery/change path |
|---|---|---|---|---|
| `sys-admin` | Initial operator | `POST /setup/initialize` after setup-token verification | Shared validator: minimum 10 plus 12 exact weak values | Sys-admin calls its own `POST /sysadmin/accounts/{username}/reset-password`; no current-password check |
| `admin` | Sys-admin | `POST /sysadmin/accounts`; setup wizard can also create operating accounts | Same shared 10-character rule | Sys-admin directly sets a replacement and shares it out of band |
| `healthworker` | Sys-admin | Same as admin | Same shared 10-character rule | Same as admin |
| `doctor` | Preferably doctor through invite; alternatively admin through legacy form | Email invite + `POST /doctor-onboarding/{token}`, or legacy `POST /doctors` | Invite flow: minimum 8. Manual legacy create/update: no server policy beyond a non-empty value | Email rotation invite: minimum 8; admin edit can directly set any non-empty value |

## Registration and password-setting flows

### 1. First `sys-admin`

1. The bootstrap script creates a 32-byte URL-safe token, stores only its SHA-256 hash, writes the raw token to `/data/setup-token`, and prints it to process output. The file is chmod `0600` where supported ([bootstrap script](../backend/app/scripts/bootstrap_setup_token.py#L33)).
2. `POST /setup/verify-token` hashes the submitted token, checks for an unconsumed row, then returns a 15-minute setup JWT in the response body. The frontend keeps it in React state and sends it as a bearer token; it is not placed in a cookie ([setup router](../backend/app/routers/setup.py#L40)).
3. The setup form trims the username, password, and confirmation. It checks non-empty and minimum length 10 before sending [`POST /setup/initialize`](../frontend/src/app/setup/page.tsx#L284).
4. The server applies the shared password validator, checks exact username uniqueness, bcrypt-hashes the password, creates the `sys-admin`, consumes all setup tokens, marks the system initialized, and issues the normal session/CSRF cookies ([initialize](../backend/app/routers/setup.py#L160)).

Security properties: high-entropy one-time bootstrap credential; hash stored in the database; short-lived bearer setup session; setup endpoints are closed after initialization. Operational caveat: the raw setup credential intentionally appears in container output and a persistent volume until setup succeeds, so access to both must be tightly controlled. `POST /setup/verify-token` explicitly has an unresolved rate-limit TODO ([setup router](../backend/app/routers/setup.py#L9)).

### 2. `admin` and `healthworker`

The sys-admin account endpoint accepts only these two manageable roles, checks exact username uniqueness, applies `validate_new_password`, and bcrypt-hashes the password ([sys-admin account creation](../backend/app/routers/sysadmin.py#L230)).

There are two client entry points with different transformations:

- The account-management modal trims username, password, and confirmation before submitting ([account modal](../frontend/src/app/%28app%29/sysadmin/accounts/page.tsx#L409)).
- The setup wizard trims usernames but sends each operating-account password exactly as typed; it validates raw character length and raw confirmation equality ([setup operating accounts](../frontend/src/app/setup/page.tsx#L558)). Because the login page later trims the password, leading/trailing spaces accepted here can make the stored secret impossible to reproduce through the UI.

The sys-admin can later set an operator password through `POST /sysadmin/accounts/{username}/reset-password`. The endpoint also permits the sys-admin to change its own password. It applies the shared rule but does not require the old password or recent reauthentication and does not revoke existing sessions ([reset endpoint](../backend/app/routers/sysadmin.py#L353)).

### 3. `doctor`

There are three materially different paths.

#### Recommended existing path: email invite for a new doctor

An admin submits an email address. The service lowercases and trims it, prevents reuse by a live doctor, creates a 32-byte URL-safe token, stores SHA-256 only, and gives it a configured expiry (72 hours by default). Issuing a replacement marks prior live invites consumed ([invite service](../backend/app/services/doctor_invites.py#L87)).

The public onboarding URL validates the token and binds the email server-side. The doctor submits profile fields, username, and password. The server requires only eight password characters, creates the account and doctor, marks the token consumed, and leaves the doctor pending approval ([onboarding route](../backend/app/routers/doctor_onboarding.py#L84)). Login is blocked until approval.

The raw invite token is placed in the URL path. Request middleware logs `request.url.path`, so the token is currently copied to access/error logs ([request middleware](../backend/app/middleware/request_id.py#L45)). It may also appear in browser history and upstream proxy logs.

#### Legacy admin-created doctor

`POST /doctors` has two modes ([doctor creation](../backend/app/routers/doctors.py#L112)):

- No password: the server creates an unguessable temporary password with `secrets.token_urlsafe(48)`, emails a rotation invite, and never reveals the temporary value.
- Password supplied: an administrator selects and later shares the password. The doctor is immediately approved.

The manual mode has no server-side length, breached-password, or maximum-size check. The client requires only a nonblank matching confirmation and trims the password ([doctor form](../frontend/src/components/admin/doctor-form.tsx#L152)).

#### Existing doctor rotation/edit

- A rotation invite uses the same one-time token table and public onboarding endpoint. Both client and server require eight characters.
- `PATCH /doctors/{doctor_id}` directly hashes any non-empty `password`; it does not call either password validator ([doctor update](../backend/app/routers/doctors.py#L748)).
- There is no doctor-authenticated “change my password” endpoint.

## Password storage

[`hash_password`](../backend/app/security.py#L23) calls `bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())`; verification calls `bcrypt.checkpw` and maps malformed hashes or input errors to failure. bcrypt is pinned to 4.2.1 ([requirements](../backend/requirements.txt#L12)).

Good properties:

- Passwords are not stored or returned in plaintext.
- Each bcrypt hash includes a random salt and work factor.
- Password request bodies are not intentionally logged.

Gaps:

- bcrypt has a 72-byte input limit. No endpoint checks UTF-8 byte length or defines safe over-limit behavior; depending on library version, excess input can be ignored or rejected. Multi-byte Unicode can reach the byte limit before 72 characters.
- No maximum string or request-body size is defined for login or most password schemas.
- Hash parameters are not centrally configured or benchmarked in this application.
- There is no algorithm/version abstraction, opportunistic rehash, breached-password check, or optional separately stored pepper.

## Login and session behavior

### Client

The login form uses `autocomplete="username"` and `autocomplete="current-password"`, but trims both fields before sending `POST /auth/login` ([login page](../frontend/src/app/login/page.tsx#L68)). The response contains only username, role, and expiry. The JWT remains in an HttpOnly cookie and is not copied into JavaScript storage. `GET /auth/me` rehydrates client identity after refresh.

### Server

[`POST /auth/login`](../backend/app/routers/auth.py#L28):

1. Performs an exact primary-key username lookup.
2. Verifies bcrypt when an account exists. A missing account skips bcrypt entirely.
3. Returns the same `invalid_credentials` response for unknown username, wrong password, or optional role mismatch.
4. After valid credentials, blocks `Account.disabled_at`.
5. For doctors, blocks rejected and unapproved records. It does **not** check `Doctor.active`; it also permits login if the doctor row is unexpectedly absent.
6. Creates an HS256 JWT containing `sub`, `role`, and `exp` only. Default expiry is 480 minutes.

The optional `LoginIn.role` schema accepts admin, doctor, or healthworker—but not sys-admin—although the current client does not send it ([login schema](../backend/app/schemas.py#L10)). This is unused legacy ambiguity, not a current sys-admin login blocker.

### Cookies and CSRF

[`set_session_cookies`](../backend/app/security.py#L55) writes:

- `session`: HttpOnly, Secure by default, SameSite=Lax by default, path `/`, host-only by default.
- `csrf_token`: same lifetime and cookie scope, intentionally JavaScript-readable.

Unsafe authenticated requests must echo the CSRF value in `X-CSRF-Token`; safe methods skip the check ([dependency](../backend/app/deps.py#L30)). Production must retain TLS, a strong JWT secret, host-only cookies, and restricted origins.

### Authorization and revocation defect

[`current_user`](../backend/app/deps.py#L47) validates JWT signature, expiry, `sub`, `role`, and CSRF only. It does not query `Account` or `Doctor`.

Consequences until the eight-hour token expires:

- Disabling or deleting an operating account does not invalidate its existing sessions.
- Deactivating, rejecting, deleting, or purging a doctor does not reliably invalidate an already issued session.
- Password reset/change does not terminate sessions on other devices.
- Logout clears only the cookies in the current browser; the server cannot revoke a copied JWT.
- Role authorization trusts the role frozen into the token.

## Findings and priority

| Priority | Finding | Impact |
|---|---|---|
| P0 | Doctor login does not check `Doctor.active` | A deliberately deactivated clinician can start a new authenticated session |
| P0 | No server-side session/account-state validation | Disabled/deleted/rejected users and sessions predating password reset may retain access |
| P0 | Password policy can be bypassed through doctor create/update | Administrators can create extremely weak doctor credentials |
| P1 | No login/setup/onboarding throttling | Online guessing, credential stuffing, and token probing are unrestricted at application level |
| P1 | Passwords are trimmed by clients | Secrets are silently changed; cross-flow trimming mismatch can lock users out |
| P1 | No MFA | Password compromise alone grants privileged or clinical access |
| P1 | bcrypt 72-byte limit is unhandled | Long/Unicode passwords can be rejected or become indistinguishable beyond the algorithm limit |
| P1 | No safe recovery/self-change for operator accounts | Sys-admin must know and distribute replacement passwords; no verified recovery channel |
| P2 | Missing-account login skips password hashing | Despite generic text, response timing can help username enumeration |
| P2 | Invite token appears in URL path logs | Anyone with log access may use a still-live onboarding/reset credential |
| P2 | Invite lookup and consumption are not an atomic conditional claim | Concurrent requests may race to use a nominally one-use token |
| P2 | No Unicode normalization, long-password support contract, or breached-password blocklist | Legitimate users can get inconsistent behavior and weak common secrets remain accepted |
| P2 | No idle timeout or step-up/recent-auth state | Unattended sessions and sensitive account changes rely on the original eight-hour login |

## Recommended target architecture

### One credential policy, enforced server-side

Every password-setting route must call one service before hashing: setup, operator creation, doctor onboarding, legacy routes while they exist, authenticated change, and recovery. Clients may mirror rules for immediate feedback but cannot be authoritative. The exact validation contract is specified in [`PASSWORD_INPUT_VALIDATION_ANALYSIS.md`](PASSWORD_INPUT_VALIDATION_ANALYSIS.md).

While accounts authenticate with password alone:

- Minimum 15 Unicode code points; accept at least 64 and choose a documented practical maximum such as 128.
- Accept spaces and Unicode; apply NFC consistently before hashing and verification.
- Never trim, truncate, case-fold, or otherwise silently alter passwords.
- Reject commonly used, expected, context-specific, and known-compromised passwords.
- Do not require arbitrary uppercase/lowercase/digit/symbol mixtures or periodic rotation.
- Allow paste, password managers, and a show-password control.

### Move password ownership to the user

- Use email invitations for admins, healthworkers, and doctors so administrators never select or transmit another user’s permanent password.
- Retain first-run sys-admin self-selection, then require enrollment of MFA and recovery methods.
- Remove `password` from general doctor create/update schemas. A privileged “reset” should issue an expiring token, not accept a replacement password.
- Add authenticated password change requiring the current password plus recent MFA/reauthentication. A recovery-token reset does not require the old password.
- Notify the account through a verified channel after password, MFA, email, or recovery changes. Do not auto-login after a recovery reset.

### Argon2id with bcrypt migration

Use a version-aware password service:

1. Hash new passwords with Argon2id, initially at least OWASP’s current floor of 19 MiB memory, 2 iterations, parallelism 1, then benchmark production hardware and tune to an acceptable verification latency.
2. Continue recognizing existing bcrypt hashes.
3. After a successful bcrypt login, rehash the submitted password with Argon2id in the same transaction.
4. Store algorithm and parameters in the encoded hash. If a pepper is adopted, keep it in a secrets manager, not the database; pepper rotation requires a deliberate reset/migration strategy.
5. Until Argon2id is deployed, reject bcrypt inputs over 72 UTF-8 bytes with a clear registration/change error—never silently truncate.

### Revocable sessions

For this same-origin monolith, prefer an opaque session cookie backed by a database session table over long-lived self-contained authorization JWTs.

Store a hash of a random session ID, account ID, issued/last-seen times, idle and absolute expiry, authentication/MFA level, and revocation time. On every authenticated request, load the session and current account/doctor state. Revoke all sessions after password recovery/reset, account disable/delete, doctor deactivation/rejection/purge, and high-risk credential changes. Rotate the session ID after login and privilege changes.

Suggested policy for this clinical application: 15–30 minute inactivity timeout, eight-hour absolute work-session maximum, and recent reauthentication for credential/identity changes. Confirm those values through a formal risk assessment rather than copying them blindly.

If JWTs must remain temporarily, add a database-checked session identifier or account `session_version`/`credentials_changed_at` claim and reject stale tokens. Merely shortening JWT lifetime does not provide immediate revocation.

Use a `__Host-` cookie name when deployment guarantees HTTPS: Secure, HttpOnly, Path `/`, and no Domain. Keep CSRF protection for unsafe cookie-authenticated requests.

### Login abuse defenses

- Always perform a constant-shape password verification by checking a fixed dummy hash when the username does not exist.
- Apply layered rate limits by normalized account identifier and IP/network, progressive backoff, and monitored abuse thresholds. Avoid a permanent hard lockout that an attacker can use for denial of service.
- Keep generic pre-authentication responses. Detailed disabled/pending/rejected messages may be shown only after the correct password, as current code does, but should be reviewed for privacy requirements.
- Require phishing-resistant MFA/passkeys for sys-admin and admin; strongly prefer it for clinical users. Provide secure recovery codes and audited recovery.
- Audit login success/failure, throttling, reset issuance/consumption, password changes, session revocation, and status changes without logging passwords, raw tokens, cookies, or full onboarding URLs.

### Token hardening

- Keep high-entropy random tokens, store hashes only, bind them to one purpose and account, expire them, and return the same error for unknown/expired/consumed values.
- Claim a token atomically with a conditional update or row lock before changing credentials.
- Redact onboarding token path segments from application/proxy logs and set `Referrer-Policy: no-referrer` on token pages. Prefer exchanging the URL token for a short-lived server-side flow session, then remove it from the visible URL.
- Rate-limit issue, resend, peek, and consume endpoints. Reissuing must invalidate previous live tokens.

## Implementation sequence

### P0 — close active access-control gaps

1. Check `Doctor.active` and require a valid doctor row during login.
2. Make every authenticated request check current account/doctor status.
3. Add server-side revocation and revoke on password/status/delete events.
4. Route every password set through one validator; remove direct hashing from doctor create/update.
5. Add focused regression tests for deactivated doctors and pre-existing sessions after every revocation event.

### P1 — improve credential lifecycle

1. Implement the shared input contract, breached-password screening, request limits, and Argon2id migration.
2. Add login and token-endpoint throttling plus dummy-hash verification.
3. Add invite-based provisioning and verified recovery for all non-bootstrap users.
4. Add current-password/recent-auth change, notifications, MFA, recovery codes, and session management UI.
5. Redact invite paths and make token consumption atomic.

### P2 — operational hardening

1. Add security telemetry and alerts without credential leakage.
2. Establish tested key/pepper/token-secret rotation and recovery procedures.
3. Periodically benchmark password hashing and review authentication/session policy.
4. Add CSP, HSTS, `Referrer-Policy`, and deployment tests for cookie/TLS settings.

## Verification and test gaps found

Existing tests cover setup password validation, shared sys-admin account rules, doctor onboarding’s short-password rejection, disabled-account blocking at **new login**, and doctor pending/rejected login behavior. They do not establish:

- revocation of an already issued session after reset/disable/delete/deactivate/reject;
- rejection of a newly logging-in inactive doctor;
- policy enforcement on manual doctor create/update;
- whitespace preservation, Unicode normalization, maximum size, or bcrypt’s 72-byte boundary;
- missing-user timing equalization, rate limiting, MFA, or recovery behavior;
- atomic single-use invite consumption.

The earlier environment did not have a global `pytest` command, so this review does not claim that the test suite passes. No runtime behavior was inferred from stale documentation.

## Standards used for recommendations

- [NIST SP 800-63B, Passwords and authenticator/session requirements](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
