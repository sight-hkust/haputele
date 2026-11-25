# Moving HapuTele auth to Ory Kratos and Hydra

**Status:** proposed design, ready for review. The dev Ory stack (`ory/`, `docker-compose.yml`) runs and passes `ory/smoke.py`. No app code uses Ory yet.

**Evidence labels**
- **[code]**: checked in this repo.
- **[src]**: checked in Ory source or its OpenAPI spec at tag `v26.2.0`.
- **[docs]**: checked in official docs; URL given.
- **[verified-live]**: confirmed on the dev stack by `ory/smoke.py` (Appendix A).
- **[inferred]**: reasoning or estimate, not verified. The Phase 0 spikes should settle these.

---

## 1. Summary

**Goal:** stop maintaining our own credential, recovery and session-revocation code, and make room for institutional SSO.

**Architecture:** self-hosted Kratos v26.2.0 and Hydra v26.2.0.
- **Kratos** owns identities, passwords and the login, recovery and settings flows. It is also where institutional SSO plugs in, and it acts as Hydra's login provider.
- **Hydra** is the OIDC provider.
- **FastAPI** becomes a confidential OIDC client of Hydra (a backend-for-frontend, BFF). It runs the authorization-code flow with PKCE and validates the ID token once, in the callback. It then maps the token's `sub` to an account and mints the **existing** app JWT and CSRF cookies.

**What stays the same:**
- `require_role` and every role check;
- the double-submit CSRF pattern and the frontend API clients;
- `username` as the key of `accounts` and of every foreign key that references it.

**What's new for users:**
- Staff sign in with their **email**. Every account must have one, but it is **never verified**, because many rural staff have no working mailbox.
- Admins can still set passwords. Anyone with a working mailbox can reset their own password by email.
- Disabling an account or changing a password ends that user's sessions immediately.

**Effort:** core migration **32–49 person-days**; OIDC SSO **+5–8** (§9).

**Preconditions:**
- **Fix production secrets delivery and backups first** (§8.3, issue #121). Adding a secret today replaces the VM, and the database lives on that VM's disk with no backups.
- **Accept Ory's OSS patch cadence or buy a licence** (D1). From 2027 OSS ships twice a year, and security fixes wait for the next release unless you pay ([docs](https://www.ory.com/docs/oss/commitment)).

---

## 2. Architecture

### 2.1 Who does what

- **Kratos:** identities (`traits.email`), bcrypt password hashes, self-service login, recovery and settings flows, the recovery-code courier, and later inbound SSO through its OIDC method.
- **Hydra:** an OAuth2/OIDC provider with no user store. It sends login to Kratos through `urls.login` and a `login_challenge` ([docs](https://www.ory.com/docs/hydra/concepts/login)).
  - **It doesn't federate inbound.** Institutional IdPs connect to Kratos. Hydra only sees the result: Kratos accepts Hydra's login request with `subject` set to the identity ID and `amr` set to the Kratos methods [src `hydra/hydra.go`].
- **The app:** roles, the account roster, doctor profiles and approval, ownership checks, transactional mail through Resend, the first-run setup wizard, and its own session cookie.
  - **Roles never become Kratos traits,** and Kratos makes no authorization decisions.
- **Out of scope, but possible later:** partner OAuth2 clients (opaque tokens plus introspection), machine-to-machine `client_credentials`, and "Sign in with HapuTele". Keto isn't adopted.

### 2.2 Login flow (dev URLs)

| Step | What happens | Evidence |
|---|---|---|
| 1 | `/login` without a challenge navigates to `/api/auth/login?next=…`. FastAPI creates `state`, `nonce` and a PKCE verifier, stores them in a signed `oidc_tx` cookie, and 302s to `http://localhost:4444/oauth2/auth` (`response_type=code`, `scope=openid`, S256). | flow [verified-live]; cookie [inferred] |
| 2 | Hydra 302s to `http://localhost:3000/login?login_challenge=…`. The page opens Kratos `/self-service/login/browser?login_challenge=…`, which returns a flow carrying `oauth2_login_challenge`. | [verified-live] |
| 3 | The user submits email and password, or picks an institution. A fetch-based submit gets a 422 whose `redirect_browser_to` points at Hydra, and the page navigates there. | [verified-live] |
| 4 | Hydra 302s to `urls.consent`. It does this **even with `skip_consent: true`**: the request arrives with `skip=false` and `client.skip_consent=true`. | [verified-live] |
| 5 | The consent handler reads `GET /admin/oauth2/auth/requests/consent`. For the first-party client it calls `PUT …/consent/accept` with `grant_scope=["openid"]` and `session.id_token.preferred_username`, then 302s to `redirect_to`. | [verified-live] |
| 6 | Hydra 303s to `/api/auth/callback?code&state`. FastAPI exchanges the code (`client_secret_basic` plus PKCE) over the compose network, then validates the ID token: JWKS signature, `iss`, `aud`, `exp` and `nonce`. | [verified-live]; claims `amr, at_hash, aud, auth_time, exp, iat, iss, jti, nonce, preferred_username, rat, sid, sub` |
| 7 | FastAPI loads the account whose `kratos_identity_id` equals `sub` and runs the post-login checks (disabled; doctor pending, rejected or inactive). It then calls `create_token` and `set_session_cookies` and redirects to `next`. | [code] `security.py:34-86` |

### 2.3 The app session

- **The cookie holds an app-minted HS256 JWT, not the ID token.**
  - There's no JWKS fetch per request, the role comes from the database, and the `sv` claim works.
  - The ID token's default lifetime is 1h, so carrying it would force refreshes.
  - The raw ID token is kept only in an HttpOnly `oidc_idt` cookie, used as `id_token_hint` at logout.
- **Lifetime:** `exp = min(now + JWT_EXPIRE_MIN, auth_time + Kratos session lifespan)`, which is 8h.
  - **No refresh tokens.** With the client's scope limited to `openid`, Hydra issues none [verified-live].
  - **No `prompt=none` iframe.** When the app JWT expires, the existing 401 → `/login` → `/api/auth/login` path signs the user in again. This is silent while the Kratos and Hydra sessions are alive.
- **Revocation: `accounts.session_version`,** carried as the `sv` claim and checked in `current_user` with one primary-key read.
  - **What bumps it:** admin disable, password reset, delete and "sign out everywhere"; doctor reject, deactivate and purge; Kratos webhooks after a settings password change or a recovery.
- **Username and role come from the app DB,** looked up by `sub`.
  - Role never goes into the token: it would go stale within a session and leak to any future partner client.
  - `preferred_username` is injected at consent, for logs and display only [verified-live].
- **Only the ID token is validated, once, in the callback.**
  - Use `PyJWKClient` on `http://hydra:4444/.well-known/jwks.json`, refetching when an unknown `kid` appears.
  - Access tokens aren't used. Future partner APIs should use opaque tokens plus introspection.

### 2.4 Logout

1. `POST /auth/logout` stays CSRF-protected. It clears the app cookies and returns `{redirectTo}`, a Hydra `/oauth2/sessions/logout?id_token_hint=…&post_logout_redirect_uri=…/login&state=…` URL.
2. Hydra **always** redirects to `urls.logout?logout_challenge=…`, even with `skip_logout_consent: true` on the client [verified-live].
3. The logout-challenge handler accepts only when `rp_initiated` is true and the client is ours.
4. Because `urls.identity_provider.url` is set, Hydra also ends the Kratos session [verified-live].

### 2.5 CSRF

- **The app API keeps double-submit.** The callback mints the `csrf_token` cookie.
  - There's no name clash: Kratos's cookie is `csrf_token_<hash>`, while `readCookie` matches the exact prefix `csrf_token=` (`frontend/src/lib/api.ts:57-60`).
  - Also check `Origin` and `Sec-Fetch-Site` on unsafe methods.
- **The OIDC leg** is protected by `state`, PKCE and `nonce`.
- **Kratos and Hydra protect their own flows.** Kratos uses its anti-CSRF cookie plus the `csrf_token` UI node, which our screens must submit.
- **The consent and logout handlers** auto-accept only for the first-party client, and logout only when it's RP-initiated.

### 2.6 The OAuth2 client `haputele-web`

- **Settings:** `grant_types=[authorization_code]`, `response_types=[code]`, `scope=openid`, `token_endpoint_auth_method=client_secret_basic`, `skip_consent`, `skip_logout_consent`.
- **A static `client_id` is honoured** [verified-live].
- **Redirect URIs:**
  - dev: `http://localhost:3000/api/auth/callback`, plus `http://localhost:8000/auth/callback` for backend-only contract tests;
  - prod: `https://<domain>/api/auth/callback`;
  - post-logout: `…/login`.
- **Bootstrap:** `hydra import oauth2-client` isn't idempotent, so add `app/scripts/ensure_oidc_client.py` and run it from `backend/entrypoint.sh` after Alembic.
  - It GETs `/admin/clients/haputele-web`, POSTs if the client is missing, and PUTs if it differs.
  - The client secret comes from env.
- **For SSO:** every login, password or SSO, reaches the app as the same kind of ID token. Its `amr` claim (`password` or `oidc`) lets the callback enforce "SSO required for institution X" (§9.3).

### 2.7 Routing and cookies

- **Dev (as built):** the frontend calls Kratos's public API at `http://localhost:4433` cross-origin, with CORS for `http://localhost:3000` and credentials. Hydra is at `http://localhost:4444`. All ports bind to loopback.
- **Prod:** serve both public APIs on the app's origin, ahead of `handle_path /api/*` in the Caddyfile:
  ```
  handle_path /.ory/kratos/public/* { reverse_proxy kratos:4433 }
  handle_path /.ory/hydra/*         { reverse_proxy hydra:4444 }
  handle /api/internal/*            { respond 404 }
  ```
  - Set Kratos `serve.public.base_url` and Hydra `urls.self.issuer` to the matching sub-paths.
  - Sub-path issuers are [inferred]; spike them, with an `auth.` subdomain as the fallback (D19).
- **Dev, later:** add Next.js rewrites for `/.ory/kratos/public/:path*` and `/.ory/hydra/:path*`, so dev matches prod. Whether `Set-Cookie` and `Location` pass through cleanly is [inferred]; spike it.
- **Never route the admin ports** (4434 and 4445). Only `api` reaches them, over the compose network ([production checklist](https://www.ory.com/docs/kratos/guides/production)).
- **Cookies are host-only** (`COOKIE_DOMAIN` empty, `variables.tf:69`), `SameSite=Lax`, `path=/`.

---

## 3. Identities and accounts

### 3.1 Identity schema

This is `ory/kratos/identity.schema.json` [verified-live]:

```json
{
  "$id": "https://haputele.local/schemas/staff.v1.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "HapuTele staff account",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string", "title": "Email", "format": "email",
          "minLength": 3, "maxLength": 320,
          "ory.sh/kratos": {
            "credentials": { "password": { "identifier": true } },
            "recovery": { "via": "email" }
          }
        }
      },
      "required": ["email"],
      "additionalProperties": false
    }
  }
}
```

- **Email is the only login identifier, and it is required.** Kratos stores it lowercased, so login and uniqueness are case-insensitive [verified-live].
- **No verification.** The schema has no `verification` key and `selfservice.flows.verification.enabled` is `false`. Identities carry no verifiable addresses, and login doesn't depend on them [verified-live].
- **No `username` trait.** The app maps `sub` to its own `username`.
- **Users can't edit traits.** Registration and the `profile` method are disabled, so the settings flow changes only the password (and later SSO links). Only the admin API writes traits.
- **Role is never a trait.** It stays in `accounts.role`.
- **Set `external_id = username` on import.** It is unique and fetchable through `GET /admin/identities/by/external/{externalID}`, which makes the import idempotent.

### 3.2 Email and username

- **Every account must have an email, but not a working mailbox.** Today only doctors have one: `doctor.email` is NOT NULL, while `accounts` has no email column and admin and health worker accounts carry only a free-text `contact` [code].
  - `accounts.email` is added as a lowercased `String(320)`, unique, nullable until cutover. It mirrors the Kratos trait for listing, search and Resend. The identity service writes Kratos first, then the app.
  - Doctors are backfilled from `doctor.email` (D22).
  - Admins enter emails for admin and health worker accounts before cutover. The form is prefilled from `contact` where it parses as an email, for the admin to confirm.
- **Staff with no mailbox get a placeholder address** (D24), such as `nimal.hw@no-mail.haputele.invalid`.
  - Kratos accepts it [verified-live].
  - Mail sent there can never reach a stranger.
- **`username` stays the app's internal key.**
  - The app never sees what the user typed at login; the callback maps `sub` to `accounts.kratos_identity_id`.
  - The 7 foreign keys (§7.2) and the ownership checks are unaffected.
  - Emails change, for example when people move institution or fix a typo; keys shouldn't.
- **New accounts don't choose a username (D23).**
  - The app derives an immutable one from the email: the lowercased local part, with `-2`, `-3`… on collision.
  - It is used in audit trails and LiveKit identities (`hw-{username}`).
- **Changing an account's email changes its login.** Admins must tell the user.

**Risk of unverified emails.** Recovery goes to whoever owns the address.
- If an admin mistypes an address, or invents one on a public provider, the real owner of that address can reset the password and take over the account.
- **Mitigations:**
  - placeholder addresses only under a domain the project controls, or a reserved TLD such as `.invalid` (D24);
  - the account form asks the admin to confirm the address and warns when it's on a public provider.
- **Doctors are lower risk:** their address is the one their onboarding invite reached.

### 3.3 Account lifecycle

| Action | Design |
|---|---|
| **Create an operating account** | The admin enters an email and a role, then chooses either **set a password** (as today; the only option for a placeholder address) or **send an invite**. An invite is a password-less identity plus an admin recovery code (72h), emailed through Resend; the user sets their own password. |
| **Reset a password** | The admin either sets a new password (`PUT /admin/identities/{id}`; `sv++`; revoke sessions) or sends a reset invite. Admin-set passwords are checked with `NewPassword`, because the admin API applies no password policy. |
| **Self-service password change** | Kratos settings flow, with `privileged_session_max_age: 15m`. A webhook bumps `sv`. |
| **Self-service recovery** | Kratos recovery by 6-digit code, valid 15 minutes. Unknown addresses get the same response and no mail [verified-live]. After recovery, the `revoke_active_sessions` hook and a webhook (`sv++`) run. |
| **Disable / enable** | Stamp `disabled_at` and bump `sv`, then set the identity `inactive`, which revokes its Kratos sessions ([docs](https://www.ory.com/docs/identities/model/activate-deactivate-user-login-state)). Enable sets it `active`; the user signs in again. |
| **Delete an operating account** | Check references, delete the app row, then delete the identity. |
| **Legacy doctor create** | As for operating accounts: with a password, or with an invite code. Auto-approved, as today. |
| **New-doctor invite by email** | Unchanged: the invite token, the `/doctor-onboarding/{token}` page and the "invited" queue stay. |
| **New-doctor onboarding submit** | The app validates, stores files in S3, creates the identity with the doctor's email and chosen password, then creates the `accounts` and `Doctor` rows with `approved_at = NULL`. The form no longer asks for a username. |
| **Pending approval** | The identity stays active. The callback and `current_user` return 403 `account_pending_approval`. `auth.tsx` must handle that 403 by showing the message and logging out through Hydra. |
| **Approve** | App only. |
| **Reject** | `sv++` and the app tombstone, then **delete the Kratos identity**, which frees the email for a reapply. |
| **Deactivate a doctor** | App flag and `sv++`, then (D4) identity `inactive`. |
| **Purge a rejected doctor** | Delete the app rows, then the identity if one still exists, revoke sessions, then delete the S3 objects. |
| **Admin changes a doctor's email or password** | Email: update the trait and `accounts.email`; it is now their login. Password: as in "Reset a password". |
| **"Awaiting setup" status** | Record "setup link issued at / expires at" in the app, and mark it done from the Kratos webhook after recovery. Webhook payload to confirm in a spike. |
| **First-run sys-admin setup** | Keep the setup token, `/setup/verify-token`, the bearer JWT and `SetupRequiredMiddleware`. `/setup/initialize` creates the identity (409 → `setup_email_taken`), commits the DB transaction, deletes the identity if the commit fails, and **keeps minting the app cookie directly** (D14). |

### 3.4 Order of operations and compensation

There's no distributed transaction between Kratos and the app.
- **Actions that revoke access:** commit the app change, including `sv++`, first. A Kratos failure then leaves the user more locked out, never less.
- **Creates:** create the Kratos identity first, and delete it if the DB commit fails.
- **Reconciliation** (`identity_reconcile.py`, nightly) converges any remaining drift.

| Action | Order | If a step fails |
|---|---|---|
| Create operating account | validate → app pre-check → Kratos create → DB commit → (invite) code → email | DB fails → delete the identity. Kratos 409 → 422 `email_taken` |
| Reset password | `sv++`, commit → Kratos set password or issue code → revoke Kratos and Hydra sessions | Kratos fails → 503; the user is already signed out; retry |
| Disable / enable | stamp `disabled_at` + `sv++`, commit → Kratos state | Log; the app still blocks; reconcile |
| Delete account | reference check → DB delete commit → Kratos delete | An orphan identity maps to nothing, so it's rejected; reconcile |
| Change email | Kratos trait update → DB commit | DB fails → restore the old trait; Kratos 409 → 422 `email_taken` |
| Legacy doctor create | Kratos create → DB commit → (invite) code → email | DB fails → delete the identity |
| Reissue setup link | code → `DoctorInvite` row → email | Kratos fails → 503 |
| New-doctor onboarding | token check → S3 → Kratos create → DB commit | DB fails → delete the identity |
| Approve | app only | — |
| Reject | `sv++` + tombstone, commit → Kratos delete → revoke | Reconcile |
| Deactivate | `sv++` + flag, commit → Kratos inactive → revoke | Reconcile |
| Purge | DB delete commit → Kratos delete → revoke → S3 | Reconcile and log |
| First-run setup | Kratos create → DB tx → app cookie | DB fails → delete the identity |

### 3.5 Mail

- **Kratos's courier sends only recovery codes.** In dev it goes to Mailpit; in prod it uses Resend SMTP: `smtps://resend:${RESEND_API_KEY}@smtp.resend.com:465/` ([Resend docs](https://resend.com/docs/send-with-smtp)), the existing verified sender, and `courier.smtp.local_name`.
  - Run `kratos serve --watch-courier`. The courier must be a singleton ([docs](https://www.ory.com/docs/kratos/self-hosted/mail-courier-selfhosted)).
  - Override `courier.templates.recovery_code.valid` with file-based HTML and plaintext templates in the app's tone.
- **The app keeps sending** invites, setup codes and approval mail through the Resend API, with its `email_suppressions` gate and `notification_log`.
- **Gap:** Kratos's courier doesn't consult `email_suppressions`, so recovery requests for dead addresses bounce at Resend. Volume should be tiny; watch it after cutover.

### 3.6 UI

**Recommended: custom screens on `@ory/client-fetch`** (D10).
- **Why:** the app has a design system, Storybook and a Sinhala translation branch. Kratos UI messages carry numeric IDs that map into `frontend/src/lib/error-codes.ts`.
- **Screens:** login (email + password, plus institution buttons later), recovery (email → code), settings (password; SSO links later), an error page, and logout.
- **Ory Elements:** `@ory/elements-react` is Apache-2.0 and supports React 19, but `@ory/nextjs` documents only Ory Network/OEL and calls its middleware not for production ([README](https://github.com/ory/elements/blob/main/packages/nextjs/README.md)). It's worth a half-day spike for recovery and settings only.

---

## 4. Responsibility inventory

**K** = Kratos, **H** = Hydra, **A** = app, **K+A** = the app decides and calls the Kratos admin API.

| # | Responsibility | Where today [code] | After | Notes |
|---|---|---|---|---|
| 1 | Password hashing and storage (bcrypt `$2b$12$`) | `security.py:23-31`, `models.py:25` | K | Hashes import unchanged; keep `hashers.algorithm: bcrypt`, cost 12. |
| 2 | Password policy (min 10, weak list, no edge whitespace) | `services/credentials.py:36-102`, `frontend/src/lib/credentials.ts` | K (self-service) + A (admin-set) | Kratos has `min_password_length: 10`, its HIBP check and the similarity check. The app keeps `NewPassword` for admin-set, setup and onboarding passwords. The username rules go. |
| 3 | Login | `routers/auth.py:28-68`, `frontend/src/app/login/page.tsx:77-88` | K + H (flow), A (UI) | By email, case-insensitive. |
| 4 | Post-login checks: disabled, doctor rejected or pending | `routers/auth.py:44-59` | A | In the callback (`post_login_gate`) and on every request through `sv` and `disabled_at`. `Doctor.active` isn't checked today (D4). |
| 5 | Session issuance (HS256 JWT, 8h, HttpOnly cookie) | `security.py:34-42,55-86`, `config.py:49-59` | A | Unchanged cookie, minted in the callback, with `sv` added and `exp` capped by `auth_time`. |
| 6 | Session validation per request | `deps.py:53-71` | A | Unchanged, plus one primary-key read for `sv` and `disabled_at`. |
| 7 | Logout and server-side revocation | `routers/auth.py:71-82`: clears cookies only, so a copied JWT stays valid | A + H + K | `sv` makes revocation immediate; Hydra logout ends the Hydra and Kratos sessions. |
| 8 | CSRF for the API | `security.py:45-52`, `deps.py:37-50`, `generated-api-client.ts:71-80` | A | Unchanged; the cookie is minted in the callback. |
| 9 | Role checks and management rights | `deps.py:74-80`, `routers/accounts.py:59-76` | A | Unchanged. |
| 10 | Record-ownership checks | `routers/appointments.py:57`, `availability.py:29`, `consultations.py:29`, `attachments.py:52`, `preconsult.py:201`, `services/capture.py:95-103` | A | Unchanged; `username` stays the key. |
| 11 | Sys-admin singleton | `alembic/versions/0006_system_init.py:63-64` | A | Unchanged. |
| 12 | First-run setup token and bearer JWT | `scripts/bootstrap_setup_token.py`, `routers/setup.py:60-97,152-168`, `middleware/setup_gate.py` | A | Unchanged; still needs `JWT_SECRET`. |
| 13 | Sys-admin creation at `/setup/initialize` | `routers/setup.py:171-262` | K+A | Creates the identity; still mints the app cookie (D14). |
| 14 | Operating-account roster, create, profile edit | `routers/accounts.py:126-305` | A + K+A | Adds `email`; drops the typed username. |
| 15 | Admin password reset | `routers/accounts.py:312-326`, `routers/doctors.py:803-808` | K+A | Set a password or send a reset invite; `sv++`; revoke sessions. |
| 16 | Sys-admin changes own password (no current-password check today) | `routers/accounts.py:247-265` | K | Settings flow with a privileged session. |
| 17 | Disable / enable | `routers/accounts.py:329-358`, `models.py:27-31` | A + K+A | `disabled_at` and `sv++`, plus identity `inactive`. |
| 18 | Hard delete of an operating account | `routers/accounts.py:361-392` | A then K | The reference check gains `CaptureSession.created_by` (Appendix B). |
| 19 | Legacy doctor create, with or without password | `routers/doctors.py:113-207` | K+A | Without a password, it's an admin recovery code emailed by the app. |
| 20 | Rotation invite and reissue | `routers/doctors.py:210-225,493-523`, `services/doctor_invites.py:57-84,253-281`, `routers/doctor_onboarding.py:140-150` | K + A | `POST /admin/recovery/code`; the app emails it through Resend. |
| 21 | New-doctor invite by email | `routers/doctors.py:228-340`, `services/doctor_invites.py:87-233` | A | Unchanged. |
| 22 | New-doctor onboarding submit | `routers/doctor_onboarding.py:152-197`, `services/doctor_invites.py:284-376` | K+A | No username field. |
| 23 | Approve, reject, reapply | `routers/doctors.py:343-490` | A (+K on reject) | Reject deletes the identity. |
| 24 | Deactivate a doctor | `routers/doctors.py:841-850` | A (+K, D4) | |
| 25 | Purge a rejected doctor | `routers/doctors.py:853-892` | A + K | Must also delete any identity, or PII stays in Kratos. |
| 26 | Doctor email change by admin | `routers/doctors.py:777-828` | K+A | It changes the doctor's login. |
| 27 | Transactional mail and suppression list | `services/email.py:79-186` | A | Unchanged. |
| 28 | `/auth/me`, `/sysadmin/me` | `routers/auth.py:85-87`, `routers/sysadmin.py:41-55` | A | Unchanged. |
| 29 | Frontend bootstrap, logout, 401 redirect | `frontend/src/lib/auth.tsx:58-107`, `generated-api-client.ts:82-98` | A | Logout navigates to `{redirectTo}`. |
| 30 | LiveKit identity `hw-{username}` | `routers/preconsult.py:186-206` | A | Unchanged. |
| 31 | Rate limiting on login, setup and recovery | none (`routers/setup.py:9-11` TODO) | A / proxy | Self-hosted Kratos appears to have none [inferred; [issue #3037](https://github.com/ory/kratos/issues/3037)] (D13). |

**Covered from the closed PR #170** (doctor password recovery):
- **15-minute recovery with the same response for unknown addresses:** Kratos recovery by code, with `lifespan: 15m` and `notify_unknown_recipients: false` [verified-live].
- **A password change logs out every device:** the `revoke_active_sessions` hook, plus `sv++` from the webhook and from admin resets.
  - Whether issuing a new recovery code invalidates the previous one is **unverified**.
- **Self-service change with the current password:** the settings flow with a privileged session.
- **Per-request disabled check:** `current_user`.
- **Reject passwords over 72 bytes:** Kratos's bcrypt hasher rejects them ([src](https://github.com/ory/kratos/blob/v26.2.0/hash/hasher_bcrypt.go)), and the app's `NewPassword` mirrors the rule.
- **Dropped by decision:** recovery only to verified emails. Emails are never verified (§3.2).

---

## 5. Implementation spec

### 5.1 Configuration

**Already in `ory/` and verified live:**
- **Kratos:**
  - the email-only identity schema, with verification disabled;
  - registration and the profile and link methods disabled;
  - recovery by code, 15 minutes, with the `revoke_active_sessions` hook;
  - bcrypt cost 12; `session.lifespan: 8h`; courier to Mailpit;
  - `oauth2_provider.url: http://hydra:4445` with `override_return_to: true`.
  - **Finding:** `override_return_to` requires Hydra's public URL in `selfservice.allowed_return_urls`. Without it, the login flow returns 400 `self_service_flow_return_to_forbidden`.
- **Hydra:**
  - `urls.login`, `urls.consent`, `urls.logout`, `urls.error` and `urls.post_logout_redirect`;
  - `urls.identity_provider.url: http://kratos:4434`, so logout through Hydra ends the Kratos session;
  - `oauth2.pkce.enforced: true`; public subject identifiers.

**To add with Phase 2:**
- **Kratos webhook:** a `web_hook` to `http://api:8000/internal/kratos/events`, in `flows.settings.after.password.hooks` and `flows.recovery.after.hooks`, alongside `revoke_active_sessions`.
  - Authenticate it with `auth: {type: api_key, config: {name: X-Kratos-Webhook-Secret, value: …, in: header}}`.
  - The JsonNet body is `{event, identity_id: ctx.identity.id}`.
- **Hydra handler URLs (D18):** `urls.consent` → `http://localhost:3000/api/auth/consent` and `urls.logout` → `http://localhost:3000/api/auth/logout/challenge`. The dev config still points at `/consent` and `/logout` pages.
- **Courier templates** for recovery codes.

**`api` service env:**

| Variable | Dev value or purpose |
|---|---|
| `AUTH_PROVIDER` | `local`, `dual` or `ory` |
| `KRATOS_ADMIN_URL` | `http://kratos:4434` |
| `HYDRA_ADMIN_URL` | `http://hydra:4445` |
| `HYDRA_PUBLIC_INTERNAL_URL` | `http://hydra:4444`, for the token endpoint and JWKS. The issuer host isn't reachable from inside the container. |
| `OIDC_ISSUER` | `http://localhost:4444/` |
| `OIDC_CLIENT_ID` | `haputele-web` |
| `OIDC_CLIENT_SECRET` | secret |
| `OIDC_REDIRECT_URI` | `http://localhost:3000/api/auth/callback` |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | `http://localhost:3000/login` |
| `KRATOS_WEBHOOK_SECRET` | secret |
| `KRATOS_SESSION_LIFESPAN_MIN` | `480` |

### 5.2 Backend, file by file

- **(a) `requirements.txt`**
  - Move `httpx` to runtime.
  - Use `PyJWT[crypto]`, since RS256 and `PyJWKClient` need `cryptography`.
  - No Ory Python SDK: the PyPI clients lag at 25.4.0, and about 15 endpoints are needed, so write thin httpx clients.
- **(b) `config.py`:** add the env settings above. `JWT_SECRET` and `JWT_EXPIRE_MIN` stay: they sign the app cookie, the setup JWT and `oidc_tx`.
- **(c) `security.py`**
  - `create_token(subject, role, session_version=0, expires_at=None)` adds `sv`.
  - Add helpers for the signed `oidc_tx` cookie (10 min, HttpOnly, Lax) and the `oidc_idt` cookie.
  - `clear_session_cookies` also clears `oidc_idt`.
  - `hash_password` and `verify_password` stay until Phase 6.
- **(d) `deps.py`**
  - Restore `import jwt` (Appendix B).
  - `current_user` adds one primary-key read:
  ```python
  payload = decode_token(token)            # existing error mapping
  sub, role, sv = payload["sub"], payload["role"], payload.get("sv", 0)
  acct = db.get(Account, sub)
  if acct is None or acct.role != role or acct.disabled_at is not None \
     or acct.session_version != sv:
      raise unauthorized("session_revoked")
  _verify_csrf_for_unsafe(request, csrf_token)
  return CurrentUser(username=sub, role=role)
  ```
  - `require_role` is unchanged.
- **(e) `models.py`**
  - `Account` adds `email` (lowercased, unique), `kratos_identity_id` (UUID, unique) and `session_version` (int, default 0). All three are nullable until cutover except `session_version`.
  - `password` becomes nullable at cutover and is dropped in Phase 6.
- **(f) Alembic:**
  - `0019_account_identity` adds `email`, `kratos_identity_id` and `session_version`, and backfills `email` from `doctor.email`;
  - `0020_institutions` for SSO-1;
  - `0021_drop_account_password` in Phase 6.
- **(g) New `services/identity.py`**
  - **`IdentityProvider` protocol:** `create(email, password=None)`, `set_password`, `set_email`, `set_active`, `delete`, `revoke_sessions`, `issue_setup_code`.
  - **Implementations:**
    - `LocalIdentityProvider`: today's bcrypt column;
    - `OryIdentityProvider`: the Kratos admin API;
    - `DualIdentityProvider`: Phase 3; local first, then Kratos, with reconciliation fixing drift.
  - **Exceptions:** `IdentityConflict` (→ 422 `email_taken`) and `IdentityUnavailable` (→ 503).
  - Exposed as a FastAPI dependency, so tests can override it.
  - **`OryIdentityProvider` calls:**
    - `POST /admin/identities`, then write back `kratos_identity_id`;
    - password change: `GET`, then `PUT /admin/identities/{id}` (PUT replaces the whole identity, so send traits and state back) [verified-live];
    - `PATCH /admin/identities/{id}` on `/state` or `/traits/email`;
    - `DELETE /admin/identities/{id}`, treating 404 as success;
    - `DELETE /admin/identities/{id}/sessions`, plus Hydra `DELETE /admin/oauth2/auth/sessions/login?subject={id}`;
    - `POST /admin/recovery/code`.
- **(h) New `services/oidc.py`**
  - `start(next)` and `exchange_code(code, verifier)`;
  - `verify_id_token(idt, nonce)`: RS256/ES256, audience, issuer, required `exp`, `iat`, `sub` and `auth_time`, and a constant-time nonce compare;
  - `end_session_url(idt, state)`;
  - a `HydraAdmin` client for consent, logout and login-session revocation.
- **(i) `routers/auth.py`**
  - Extract `post_login_gate(db, acct)` from the existing login checks, and add the `Doctor.active` check (D4).
  - `POST /auth/login` is served only when `AUTH_PROVIDER != "ory"`, and is deleted in Phase 6.
  - **New endpoints:**

    | Endpoint | Behaviour |
    |---|---|
    | `GET /auth/login?next=` | In local mode, 302 to `/login?local=1`. Otherwise set `oidc_tx` and 302 to Hydra. |
    | `GET /auth/callback` | Check `state`, exchange the code, verify the ID token, look up the account by `sub`, run the gate. On failure, revoke sessions and 303 to `/login?error=<code>`. On success, mint the app JWT, CSRF and `oidc_idt` cookies and 303 to `next` (only paths starting with `/` and not `//`). |
    | `GET /auth/consent` | If the client is `haputele-web`, accept with `grant_scope ∩ {"openid"}`, `remember=true` and `preferred_username`. Otherwise reject with `consent_required`. |
    | `GET /auth/logout/challenge` | Accept if `rp_initiated` and the client is ours; otherwise reject and redirect to `/login`. |

  - `POST /auth/logout` returns `{redirectTo}` instead of 204.
  - `GET /auth/me` is unchanged.
- **(j) `routers/setup.py`:** create the identity, then commit the DB transaction, deleting the identity if the commit fails. Keep minting the app cookie (D14). Takes an email.
- **(k) `services/doctor_invites.py`**
  - `issue_rotation` issues a Kratos recovery code and records a `DoctorInvite` with `token_hash=sha256("kratos-flow:"+flow_id)`.
  - `consume_rotation` is deleted; the webhook calls `mark_rotation_consumed`.
  - `consume_new_doctor`: S3, then Kratos create, then DB commit; compensate with an identity delete.
- **(l) `routers/doctor_onboarding.py`:** the rotation branches return 404; rotation links go to `/recovery?flow=…`. The submit schema drops `username`.
- **(m) `routers/doctors.py`**
  - `create_doctor` and `reissue_invite` use the provider, plus a setup code when sending an invite.
  - `reject`: `sv++`, then delete the identity and revoke sessions.
  - `update_doctor`: password → `set_password` + `sv++` + revoke; email → `set_email`; `active` → `set_active`.
  - `delete_doctor` (D4): `sv++` + inactive.
  - `purge`: commit, then identity delete + revoke.
- **(n) `routers/accounts.py`**
  - `create`: email, role and either a password or `send_invite`; derive the username (D23); provider then commit, compensating on failure.
  - `reset`: `sv++`, commit, then `set_password` + revoke, or issue a code and email it.
  - `disable` / `enable`: `sv++` on disable, commit, then `set_active`.
  - `delete`: commit, then identity delete.
  - `_account_is_referenced` adds `CaptureSession.created_by` (Appendix B).
- **(o) Unchanged:** `routers/sysadmin.py`, `middleware/setup_gate.py`.
- **(p) `services/credentials.py`:** reject passwords over 72 bytes (`password_too_long`), because Kratos's bcrypt rejects them. Mirror it in `frontend/src/lib/credentials.ts`. Drop the username rules and add `NewEmail` (lowercased, `format: email`, ≤ 320).
- **(q) New `routers/internal_hooks.py`:** `POST /internal/kratos/events`, with an HMAC-compared header secret. `password_changed` and `recovered` → `sv++` and `mark_rotation_consumed`. Caddy blocks `/api/internal/*` in prod.
- **(r) Scripts:**
  - `ensure_oidc_client.py` (§2.6);
  - `kratos_import.py` (§7.1);
  - `identity_reconcile.py`;
  - `demo_invite.py` switches to the provider.

### 5.3 Frontend

- **`app/login/page.tsx`** has five modes:
  - `login_challenge` → open the Kratos browser login flow;
  - `flow` → render it (email and password, institution buttons later), and follow `422 redirect_browser_to`;
  - `local=1` → the current form, until Phase 6;
  - `error=` → show the message;
  - otherwise → navigate to `/api/auth/login?next=`.
- **For a few weeks after cutover,** the login page says "Sign in with your email (this replaces your username)".
- **Unchanged:** the 401 → `/login?next=` redirects and the `lib/auth.tsx` bootstrap.
- **`lib/auth.tsx`:** `logout` reads `{redirectTo}` and navigates there; a 403 `account_pending_approval` shows the message and logs out.
- **New:**
  - `lib/ory.ts`: the `@ory/client-fetch` `FrontendApi`, `NEXT_PUBLIC_KRATOS_PUBLIC_URL` and `credentials: "include"`;
  - `components/ory/FlowForm.tsx`: a UI-node renderer for inputs, CSRF, OIDC buttons, and message IDs mapped through `error-codes.ts`;
  - pages `/recovery` and `/settings` (password now, SSO links later), and a Kratos error page. `src/app/error.tsx` is Next's error boundary, so the route may need to be `/auth-error`.
  - **Admin-issued recovery flows carry no CSRF node.** The recovery page fetches the flow by ID and posts only the code [verified-live].
- **Account forms:**
  - add an email field (with the public-provider warning and placeholder help from §3.2);
  - keep the password field, with a "send invite instead" option;
  - the username field goes.
- **Doctor screens:**
  - the onboarding form drops the username field;
  - `doctor-onboarding/[token]` loses the rotation panel;
  - the admin doctor page gets "Send password setup link".
- **Topbar:** an "Account security" link to `/settings`.
- **Also:** regenerate the Kubb client and update the Storybook MSW mocks (`frontend/src/stories/scenario.ts:733-748`).

### 5.4 Tests

- **Backend unit suite (~378 tests).** Twenty files log in through `POST /auth/login`, and `conftest.py` seeds `Account` rows with `hash_password`.
  - Add a `login_as(client, username)` fixture that mints `create_token(username, role, sv)` and sets the `session` and `csrf_token` cookies. Per-role client fixtures use it.
  - Add a `fake_identity` provider override, applied after the `client` fixture reload. Account fixtures set `email` and `kratos_identity_id=uuid4()`.
  - **Rewrite:** `test_setup_flow`, `test_sysadmin_account_management`, `test_credential_policy_api`, `test_doctor_onboarding_api`, `test_doctor_invite_by_email`, `test_doctor_invites_service`, `test_account_role_matrix`, and the credentials parity tests (72 bytes, `NewEmail`).
  - **New**, with a fake Hydra over `httpx.MockTransport` and a locally generated RSA JWKS:
    - `test_oidc_callback.py`: `state`, `nonce`, `iss`, `aud` and `exp` checks; an unknown `sub`; the gates; success with `sv` and an `exp` capped by `auth_time`; an open-redirect `next`;
    - `test_session_revocation.py`, `test_consent_logout.py`, `test_identity_ory.py`, `test_kratos_webhook.py`;
    - `test_auth_token_errors.py`: tampered or expired cookies → 401;
    - a capture-session delete test → 409.
- **Contract CI job against the real stack** (`db kratos hydra mailpit api`):
  - `tests/contract/test_ory_flow.py` drives `/auth/login` → Hydra → Kratos → consent → callback with an httpx cookie jar.
  - It also covers bcrypt-import login, recovery through the Mailpit API, a disable revoking access, and logout ending the Kratos session.
  - `ory/smoke.py` already does most of this without the app.
  - Start Kratos and Hydra with `docker compose`, not GitHub service containers, because service containers can't override the command.
- **Playwright end-to-end** (new; there's no frontend test runner today), with docker compose:
  - login per role, and logout;
  - a disabled user being kicked out mid-session;
  - recovery via Mailpit;
  - a password change revoking another browser's session;
  - new-doctor invite → onboarding → pending → approve → login;
  - admin "send setup link";
  - the first-run wizard ending signed in;
  - a cross-origin POST being rejected;
  - the SSO cases in §9.4.

---

## 6. Phases, estimate and risks

| Phase | Scope | Person-days |
|---|---|---|
| 0 | Dev compose stack and smoke test (**done**). Spikes: callback cookies through the Next rewrite, Hydra and Kratos on sub-paths behind Caddy, the flow renderer, and an import dry run on a sanitized dump. | 2–3 |
| 1 | No Ory dependency, ships on its own. `IdentityProvider` with the local implementation; `session_version` and the `current_user` check; `accounts.email` with backfill and the admin collection UI; `login_as`; Alembic `0019`; the two Appendix B bugs. | 5–8 |
| 2 | Behind `AUTH_PROVIDER`, dev only. OIDC endpoints, `OryIdentityProvider`, consent and logout handlers, Kratos webhook, Kratos UI pages, client bootstrap, derived usernames, invite option. | 10–14 |
| 3 | Import, dual-write, reconciliation. | 3–5 |
| 4 | Prod infrastructure: secrets delivery, backups (app → kratos → hydra), Caddy routes, prod compose and Ansible for Ory, client bootstrap. | 5–8 |
| 5 | CI contract job, Playwright, cutover runbook and comms, flag flip, reissue setup links. | 5–8 |
| 6 | Decommission local auth. | 2–3 |
| **Core total** | | **32–49** |
| SSO-1 | Option (a): institutions registry and admin UI, discovery and picker, linking from settings, `sso_required` check, mock IdP in CI, onboarding runbook. | 5–8 |
| SSO-2 | (b) Polis: +6–10 · (c) OEL: +3–6 plus licence · (d) Ory Network: +8–12 plus subscription. | — |

**Main risks**
1. **VM replacement and data loss** when secrets are added (§8.3). Highest severity.
2. **OSS security-patch lag** across Kratos and Hydra, for a health system (§8.5, D1).
3. **Kratos and the app DB drifting apart.** Mitigated by the order of operations (§3.4), reconciliation, and `sv` failing closed.
4. **Account takeover through wrong email addresses,** because nothing is verified (§3.2).
5. **Cutover surprises:** accounts with no email or a shared one, passwords over 72 bytes, rotation links in flight, everyone signing in again, and with an email instead of the username they know.
6. **Ory availability becomes login availability.** Existing app sessions keep working while Kratos or Hydra is down; only new logins need them.
7. **No login rate limiting,** before or after (D13).
8. **Memory on a 2 GB VM** that already runs LiveKit, now with two more Go services [inferred].
9. **i18n** of Kratos UI messages and recovery mail for Sinhala and Tamil.

---

## 7. Data migration and cutover

### 7.1 Importing identities

- **API:** `PATCH /admin/identities`, up to 1,000 identities per request, with `credentials.password.config.hashed_password`. Kratos detects bcrypt by `^\$2[abzy]?\$`, so Python `$2b$12$` hashes import and log in unchanged [verified-live].
- **Per account:**
  - `traits.email` from `accounts.email`;
  - `external_id = username`;
  - `state: inactive` if `disabled_at` is set, or (D4) for an inactive doctor;
  - no `verifiable_addresses`;
  - write `kratos_identity_id` back to the app.
- **Rejected doctors aren't imported.** They can't sign in, and their email stays free for a reapply.
- **Pre-flight checks** (any failure stops the import):
  - every importable account has an email;
  - no two importable accounts share an email in any case;
  - every `accounts.password` matches `^\$2[aby]\$`.
- **Known casualties:**
  - **Passwords over 72 bytes.** `bcrypt==4.2.1` silently truncated them; Kratos rejects them at compare time, so those users need a reset. They can't be found from the hashes.
  - **Doctors with a live rotation invite at cutover.** Their links stop working; reissue them as Kratos codes on cutover day.

### 7.2 `username` stays the key

These foreign keys reference `accounts.username` [code]:

| Column | Defined at | On delete |
|---|---|---|
| `doctor.username` (UNIQUE) | `models.py:43-45`, `0001_initial_schema.py:47-48` | CASCADE |
| `doctor.approved_by`, `doctor.rejected_by` | `models.py:83-88`, `0014` | SET NULL |
| `doctor_availability.created_by` | `models.py:194-196`, `0002` | RESTRICT |
| `appointment_attachments.uploaded_by` | `models.py:258-260`, `0005` | RESTRICT |
| `queue_entries.created_by` | `models.py:315-317`, `0003` | RESTRICT |
| `capture_sessions.created_by` | `models.py:423-425`, `0015` | RESTRICT |

`username` is also used without a foreign key in `preconsult.py:193` (the LiveKit identity), `services/capture.py:103`, and the ownership checks in §4, row 10.

Switching to UUIDs or emails would rewrite 7 columns on clinical tables and about 25 comparison sites. That's about 4–6 more person-days and real data-migration risk, for no gain.

### 7.3 Cutover without password resets

1. **Before cutover (Phase 3):** import, then dual-write: every credential or state write goes to both the local store and Kratos. Run reconciliation nightly until it reports no differences.
2. **Communication, a week ahead:** every user learns their sign-in email. Staff with placeholder addresses get theirs from their admin.
3. **Cutover day:** a short maintenance window. Deploy with `AUTH_PROVIDER=ory`.
   - All app sessions end. Users sign in once with their email and their **existing password**.
   - Reissue pending rotation links.

### 7.4 Rollback

- **How:** set `AUTH_PROVIDER=local` and redeploy the previous image (the `image_tag` input of `.github/workflows/deploy.yml`).
- **Passwords changed in Kratos:** copy their bcrypt hashes back into `accounts.password` through `GET /admin/identities/{id}?include_credential=password`. Whether it returns `hashed_password` needs checking. This only works while Kratos stays on bcrypt.
- **How long:** keep the `password` column and the local implementation for 2–4 weeks after cutover.

---

## 8. Operations

### 8.1 Containers

As in `docker-compose.yml`, with exact tags pinned:
- **`ory-db-init`:** creates the `kratos` and `hydra` databases if missing.
- **`kratos-migrate` and `hydra-migrate`:** `migrate sql --read-from-env --yes`, run once. Back up before every migration.
- **`kratos`:** `serve --watch-courier`. **`hydra`:** `serve all`. Both have health checks on `/health/ready`.
- **Mailpit** in dev and CI only.
- **Prod:** drop `--dev`, and have `api` depend on both services being healthy.

### 8.2 Database

- **Separate `kratos` and `hydra` databases** in the app's Postgres 16.
  - Dev uses the app's role.
  - Prod should give each its own role [inferred best practice].
- **Prod database creation:** the data directory already exists, so `docker-entrypoint-initdb.d` won't run. Use an idempotent Ansible task, or the same `ory-db-init` job.

### 8.3 Secrets: fix this first

- **What's needed:**
  - Kratos `secrets.cookie`, `secrets.cipher` (exactly 32 characters) and `secrets.default`;
  - Hydra `secrets.system`;
  - the OIDC client secret (shared by `api` and the bootstrap script);
  - the Kratos webhook secret;
  - database passwords;
  - the Resend SMTP URI ([docs](https://www.ory.com/docs/kratos/guides/production)).
- **The problem:**
  - Every secret flows `locals.tf` → `vault.tf` → `user_data`, and `deployment/vm.tf` notes that changing a secret **replaces the VM (ForceNew)**.
  - Postgres lives on that VM's local disk, and `main` has **no backups** (issue #121; the nightly backup is unmerged on `origin/feat/nightly-database-backup`).
- **What to do first:**
  - merge the backups;
  - deliver new secrets through Ansible, and/or add `lifecycle { ignore_changes = [user_data] }`;
  - render `kratos.yml` and `hydra.yml` from Ansible templates (mode 0600), like `env.j2`.

### 8.4 Backups

Dump the app DB, then `kratos`, then `hydra`, and restore them together.

### 8.5 Upgrades, footprint and rate limiting

- **Versions** are calendar-based `YY.Q.N` ([docs](https://www.ory.com/docs/oss/upgrading)). Kratos, Hydra, Keto and Elements are Apache-2.0.
- **Patch cadence:** OSS ships twice a year from 2027, with fixes only at the next release unless you buy the Continuous Security License ([docs](https://www.ory.com/docs/oss/commitment)).
- **Upgrade runbook:** back up, pull, migrate, restart. Rehearse on a restored dump, since there's no staging environment.
- **VM size:** `small_3_1` is probably 2 GB RAM [inferred]. Expect tens to low hundreds of MB per Ory service. Don't switch to argon2, which uses 128 MB per hash by default.
- **Rate limiting:** none in self-hosted Kratos [inferred]. Options are a Caddy rate-limit plugin (custom build), fail2ban on Kratos logs, or a login webhook (D13).

### 8.6 Ory Network instead

- **Price:** Production plan $770/year with a $21/month credit, then $0.14 per daily active user per month ([pricing](https://www.ory.com/pricing)).
- **What you get:** managed patching, a custom domain, PII region choice and managed rate limiting [inferred].
- **Fit:** the BFF design works unchanged against hosted OAuth2 endpoints [inferred]. It saves about 3–5 person-days of infrastructure work.
- **Also needed:** custom SMTP for custom templates, and a review of cross-border transfer under Sri Lanka's PDPA. Only staff emails would leave; no patient data goes to Ory.

---

## 9. Institutional SSO

### 9.1 Facts

- **Kratos OIDC providers are static config entries** under `selfservice.methods.oidc.config.providers[]`.
  - Fields include `id`, `provider` (`generic`, `microsoft` with `microsoft_tenant`, `google`, …), `issuer_url`, `client_id`/`client_secret`, `mapper_url`, `claims_source` and `pkce` [src].
  - The callback is `<public base_url>/self-service/methods/oidc/callback/<provider-id>`.
  - Whether a new provider takes effect without a restart is **unverified**.
- **Organizations don't work in OSS.** `organization_id` on a provider and automatic account linking by email (`account_linking_mode: automatic`) are "only effective in the Ory Network" [src]. Organizations need Ory Network or the OEL ([docs](https://www.ory.com/docs/kratos/organizations), [OEL](https://www.ory.com/docs/oel/getting-started)).
- **Kratos OSS has no SAML.** Its `saml` package contains only API model types [src].
- **Ory Polis** (formerly BoxyHQ SAML Jackson; Apache-2.0, v26.2.0; [repo](https://github.com/ory/polis), [docs](https://ory.com/docs/polis)) bridges SAML and OIDC IdPs into an OIDC flow.
  - **Caveat:** for direct connections, the user ID is whatever the IdP provides, not scoped per connection. Scoped federation is enterprise-only.
  - Using Polis as an upstream provider for Kratos OSS isn't documented by Ory. **Unverified; spike it.**

### 9.2 Options

| | (a) Kratos OSS, OIDC providers | (b) Kratos OSS + Polis OSS | (c) Ory Enterprise License | (d) Ory Network + organizations |
|---|---|---|---|---|
| Protocols | OIDC/OAuth2 | SAML 2.0 + OIDC | OIDC + SAML organizations, SCIM | Growth: OIDC, ≤3 orgs. Enterprise: SAML, SCIM |
| Licence | $0 | $0 | Custom quote | Growth $9,350/yr; Enterprise custom ([pricing](https://www.ory.com/pricing)) |
| Onboarding an institution | IdP app registration, a provider entry and secret in `kratos.yml`, a redeploy, and an app `institutions` row. Multi-tenant `microsoft` (`microsoft_tenant: organizations`) and `google` providers can serve many tenants without per-institution Kratos changes [inferred]. | A Polis connection plus a Kratos provider entry per institution, keeping subjects scoped | Org, connection and domains by API or config | Console/API and onboarding-portal links |
| VM footprint | None extra | Polis Node.js container (~200–400 MB [inferred]), a `polis` DB, keys, a public SAML endpoint | Licensed images | Kratos and Hydra leave the VM |
| Patch exposure | OSS cadence | OSS cadence across 3 components, one an internet-facing SAML parser | SLA patches | Managed |
| Effort | 5–8 | +6–10 | +3–6 plus licence lead time | +8–12 |

**Recommendation:**
- Ship (a).
- Build the app-side institution registry and linking UX so the protocol behind them can change.
- When the first SAML-only institution arrives, choose (b) for a few institutions, or get a (c) quote if there will be many or SCIM is needed (D15).

### 9.3 Linking and provisioning

- **With registration disabled, an unlinked SSO login fails** with `ErrRegistrationDisabled` and lands on the error page [src]. The page must explain: "Your institution account isn't linked yet. Sign in with your email and password, then link it under Account security, or ask your administrator."
- **Ways to link:**
  - **(recommended, D17)** the user links from the settings flow, which needs a privileged session;
  - an admin pre-sets `credentials.oidc.config.providers[{provider, subject}]`, which works only when the subject is predictable (for Entra, use `oid`);
  - automatic linking by email is **not available in OSS** (§9.1).
- **No just-in-time provisioning.** It would create new identities instead of linking the admin-created ones, and bypass the profile and approval flow.
- **Passwords:** keep one as break-glass by default. Per-institution SSO-only accounts are D16.
- **Enforcement:** the ID token's `amr` carries `password` or `oidc`. Enforce `institutions.sso_required` in the callback.
- **Roles stay in the app.** Institutional IdP claims, such as Entra groups, are never trusted for HapuTele authorization.

### 9.4 Plan changes for SSO

- **Identity schema:** unchanged.
- **App DB:** a new `institutions` table (`id, name, slug, email_domains, kratos_provider_ids, sso_required`) and `accounts.institution_id`, in Alembic `0020`.
- **Discovery:**
  - `GET /auth/sso/discover?email=`;
  - `/login` shows "Continue with <institution>", which submits `method=oidc`, `provider=<id>` and `upstream_parameters.login_hint`;
  - a searchable picker as fallback.
  - Kratos OSS `identifier_first` is experimental, and domain routing is Network/OEL only.
- **Secrets:** per-institution OIDC client secrets in `kratos.yml` through sops. Kratos `secrets.cipher` also encrypts stored upstream tokens.
- **Tests:** a mock OIDC IdP in CI, such as `navikt/mock-oauth2-server` or a second Hydra. Cover:
  - link from settings, then SSO login, then the callback with `amr=oidc`;
  - an unlinked SSO login landing on the error page;
  - an `sso_required` institution rejecting password login.

---

## 10. Decisions

**Decided**
- Adopt Kratos + Hydra, self-hosted; Keto not adopted. PR #170 (in-house doctor recovery) closed in favour of this.
- The app integrates as a confidential OIDC client and keeps its own JWT session cookie (§2).
- Kratos and Hydra get separate databases in the app's Postgres.
- **D3:** `username` stays the app's internal key.
- **Login is by email** (2026-11-23).
- **D7, D8, D21:** every account requires an email, never verified, and it needn't be a working mailbox (2026-11-25). Self-service recovery works wherever the mailbox is real; admins can always set passwords.

**Open** (the recommended default applies unless changed)

| ID | Question | Recommended |
|---|---|---|
| D1 | OSS only, or add the Continuous Security License or the OEL | Decide before go-live |
| D4 | Block deactivated doctors (`Doctor.active = false`) at login and per request | Yes |
| D5 | Check pending approval in the callback | Yes |
| D6 | The app creates the Kratos identity during onboarding | Yes |
| D9 | App JWT capped at 8h by `auth_time`; no refresh tokens; no `prompt=none` | Yes |
| D10 | Custom UI on `@ory/client-fetch` or Ory Elements | Custom |
| D11 | MFA | Later |
| D13 | Login rate limiting | Caddy plugin or fail2ban, Phase 4 |
| D14 | First-run setup keeps minting the app cookie directly | Yes |
| D15 | SAML path: Polis, OEL or Network | When the first SAML institution arrives |
| D16 | Per-institution SSO-only accounts, or keep a password as break-glass | Keep a password |
| D17 | User links SSO in settings, or an admin pre-sets the subject | User links |
| D18 | Hydra consent and logout go straight to backend endpoints, or through frontend pages | Backend endpoints |
| D19 | Hydra and Kratos on sub-paths or an `auth.` subdomain in prod | Sub-paths, if the spike passes |
| D20 | Multi-tenant Entra/Google providers gated by the institution allowlist, or per-institution registrations | Decide in SSO-1 |
| D22 | Merge `doctor.email` into `accounts.email`, or keep it as a separate contact address | Merge |
| D23 | Derive new usernames from the email, or keep asking for one | Derive |
| D24 | Placeholder addresses for staff with no mailbox: a domain the project controls, or a reserved one such as `name@no-mail.haputele.invalid` | `.invalid`, unless the team prefers an owned subdomain |

---

## Appendix A. Verified on the dev stack

Run `docker compose up -d kratos hydra`, then `python ory/smoke.py`. It is safe to rerun. All of the following pass on v26.2.0:

- **Imports and identifiers**
  - Python bcrypt `$2b$12$` hashes import and log in unchanged.
  - Email identifiers are stored lowercased, login with a different case works, and a second identity with the same email in another case gets a 409.
  - With verification disabled, identities have no verifiable addresses, and the verification flow answers "Verification is not allowed because it was disabled".
- **Login**
  - The full Hydra → Kratos → Hydra → callback flow works.
  - Consent is requested even with `skip_consent: true`, and the admin API accepts it with a custom `preferred_username` claim.
  - A static `client_id` is honoured.
  - The token exchange with scope `openid` returns an ID token and no refresh token.
  - The ID token's `sub` is the Kratos identity ID, and `iss`, `aud` and `nonce` check out.
- **Recovery**
  - Self-service recovery finds the address in any case and mails nothing for unknown addresses.
  - A correct code gets a 422 `browser_location_change_required` that redirects to the settings flow.
- **Logout:** Hydra redirects to the logout handler even with `skip_logout_consent: true`. Accepting it ends at `post_logout_redirect_uri`, and the Kratos session is revoked.
- **Admin invites:** a recovery code on a password-less identity opens the frontend `/recovery?flow=` page. The flow has no CSRF node, and the code leads to the settings flow.
- **Placeholder addresses:** an identity on `nimal.hw@no-mail.haputele.invalid` with an admin-set password can be reset through `PUT /admin/identities/{id}`. Afterwards the old password fails and the new one works.
- **Config finding:** `oauth2_provider.override_return_to` requires Hydra's public URL in `selfservice.allowed_return_urls`.
- **Earlier finding, before verification was disabled:** admin codes left an address `pending`, while self-service recovery verified it.

## Appendix B. Bugs on `main` fixed in Phase 1

- **`backend/app/deps.py:62-64` uses `jwt.ExpiredSignatureError` and `jwt.PyJWTError` without importing `jwt`.** The import was dropped in `bbe7cda`.
  - Any expired, tampered or wrong-secret cookie raises a `NameError`, so the client gets a 500 instead of a 401.
  - The frontend then shows its retry screen instead of sending the user to `/login`.
- **`backend/app/routers/accounts.py` `_account_is_referenced` misses `capture_sessions.created_by`.** That foreign key is RESTRICT (`0015_capture_sessions.py:44`), so deleting an account that created a capture session returns 500 instead of 409 `account_in_use`.
- **Login never checks `Doctor.active`** (`routers/auth.py:53-59`), and sessions can't be revoked (`deps.py:53-71`). `sv` fixes the second; D4 decides the first.
