# Password Input Validation Analysis

Status: focused code review of registration, login, password change/reset, and invite-token inputs on `main` at `3001293` (2026-08-03). This document deliberately excludes broader authentication architecture except where it changes whether an input is safe to accept.

## TL;DR

Password validation is fragmented and client-dependent. Operator creation uses a shared server rule of 10 characters plus a 12-value exact blocklist; doctor onboarding uses 8 characters; manual doctor create/update has no meaningful server rule. Multiple clients trim passwords, while one setup path stores whitespace exactly and the login client always trims it. There is no maximum length, bcrypt 72-byte guard, Unicode normalization, breached-password screening, or schema-level size protection.

Implement one server-owned validation and normalization contract for every password-setting path. Preserve password whitespace, normalize Unicode consistently with NFC, require 15 characters for password-only accounts, accept at least 64 characters, set a documented resource-safety maximum, block compromised/common/context-derived passwords, and use no composition rules. Login must not re-run new-password strength rules: it should normalize exactly as registration did, cap input safely, verify legacy hashes, return generic failures, and rate-limit attempts. Password change should verify the current password/recent authentication, validate the new password through the same service, and revoke sessions.

## Current validation inventory

### Password registration and setting

| Entry point | Client behavior | Server behavior | Result |
|---|---|---|---|
| First sys-admin setup | Trims password and confirmation; requires 10 characters | Shared `validate_new_password`: exact weak-list match, then Python `len >= 10` | Leading/trailing spaces cannot be selected through this UI; no max/Unicode/bcrypt-byte/breach rule |
| Admin/healthworker from account modal | Trims password and confirmation; requires 10 | Same shared rule | Client/server length agrees, but valid intentional whitespace is silently removed |
| Admin/healthworker from setup wizard | Does **not** trim; raw length and raw equality, sends raw password | Same shared rule, which also does not trim | A whitespace-padded/whitespace-only 10-character secret can be stored; login UI later trims it |
| New doctor through email invite | Shared doctor form trims before sending; client requires nonblank and page checks 8 | Public onboarding endpoint checks `len(password) >= 8` | Weaker than operator policy; no blocklist/max/normalization |
| Existing doctor rotation invite | Trims password/confirmation; requires 8 | Requires `len(password) >= 8` | Same weaknesses; token is the only authorization |
| Legacy manual doctor creation | Trims, requires nonblank and matching confirmation | Any truthy password is bcrypt-hashed | A one-character password is accepted by direct API and by UI if nonblank |
| Doctor password through `PATCH /doctors/{id}` | Trims if present; confirmation in UI | Any non-empty password is bcrypt-hashed | General profile edit doubles as an unprotected password reset primitive |
| Sys-admin/operator reset | Account UI trims replacement; server schema accepts string | Shared 10-character rule | No current-password or recent-auth input; sessions remain valid |

Evidence:

- Shared rule: [`backend/app/services/passwords.py`](../backend/app/services/passwords.py#L15)
- Setup sys-admin transformation: [`frontend/src/app/setup/page.tsx`](../frontend/src/app/setup/page.tsx#L284)
- Setup operating-account transformation: [`frontend/src/app/setup/page.tsx`](../frontend/src/app/setup/page.tsx#L558)
- Account modal transformation: [`frontend/src/app/(app)/sysadmin/accounts/page.tsx`](../frontend/src/app/%28app%29/sysadmin/accounts/page.tsx#L409)
- Doctor form transformation: [`frontend/src/components/admin/doctor-form.tsx`](../frontend/src/components/admin/doctor-form.tsx#L152)
- Doctor onboarding rule: [`backend/app/routers/doctor_onboarding.py`](../backend/app/routers/doctor_onboarding.py#L44)
- Manual doctor creation: [`backend/app/routers/doctors.py`](../backend/app/routers/doctors.py#L112)
- Doctor update: [`backend/app/routers/doctors.py`](../backend/app/routers/doctors.py#L748)
- Operator reset: [`backend/app/routers/sysadmin.py`](../backend/app/routers/sysadmin.py#L353)

### Login inputs

[`LoginIn`](../backend/app/schemas.py#L10) declares unconstrained `str` fields for username and password. There is no minimum, maximum, whitespace, or request-size schema rule.

The browser login page sends:

```ts
{ username: username.trim(), password: password.trim() }
```

([login client](../frontend/src/app/login/page.tsx#L68)). The server itself performs no trimming or normalization; direct API clients receive exact-string behavior. It looks up the exact username key and bcrypt-verifies the submitted password ([login endpoint](../backend/app/routers/auth.py#L28)).

Consequences:

- Browser and direct-API behavior differ.
- Passwords beginning or ending in spaces cannot be submitted unchanged by the browser.
- Passwords created by the setup operating-account path can become unusable through the browser.
- An unbounded password reaches UTF-8 encoding and bcrypt. bcrypt has a 72-byte ceiling; the code defines no explicit over-limit behavior, so dependency versions may ignore excess bytes or reject the input.
- An absent account bypasses bcrypt entirely, creating a timing difference despite identical response text.
- Strength/blocklist checks must **not** be applied at login because that would lock out existing credentials before a controlled migration.

### Usernames and related identifiers

Current username handling is also inconsistent:

- `accounts.username` is the case-sensitive primary key.
- Setup and account-management clients trim usernames.
- The setup/sys-admin schemas constrain 1–255 characters **before** endpoint-specific cleanup, but the backend generally stores the provided string as-is.
- Doctor onboarding explicitly strips username server-side, while legacy doctor creation stores `payload.username` directly.
- No centralized allowed-character, case, Unicode normalization, control-character, or confusable policy exists.

Do not silently switch existing usernames to case-insensitive matching without a collision audit and migration. The target design should introduce an immutable account ID plus a normalized unique login identifier.

### Confirmation fields

Password confirmation exists only in the UI; server payloads generally contain one password. That is appropriate: confirmation prevents typing errors, not attacks. It should remain a client-side equality check against the exact, untrimmed value. Sending the password twice increases secret handling without adding server trust.

### Invite/reset token inputs

Setup and doctor tokens are high entropy and compared through SHA-256 hashes. Doctor lookups return one generic “not found” state for unknown, expired, or consumed values ([invite lookup](../backend/app/services/doctor_invites.py#L236)). Current token path/schema strings have no explicit maximum or format check, and doctor lookup/consumption is not an atomic claim.

The raw doctor token is in the URL path, and request middleware logs the full path. This is an input-handling leak: raw password-reset/onboarding credentials must be redacted before logging.

## Validation defects

| Severity | Defect | Required correction |
|---|---|---|
| Critical | Doctor create/update bypasses the shared password policy | Remove password from general profile schemas; route all credential changes through one credential service |
| High | Client trims passwords | Preserve exact input; remove every password `.trim()` and compare exact confirmation |
| High | Setup path and login transform secrets differently | Adopt one registration/login normalization function and migration compatibility logic |
| High | bcrypt 72-byte limit is unchecked | Migrate to Argon2id; until then reject new bcrypt inputs above 72 UTF-8 bytes |
| High | No input maximum | Enforce field and HTTP-body limits before hashing to prevent CPU/memory abuse |
| High | Policies are 8/10/none rather than one standard | Use one server rule across all roles and credential-setting operations |
| Medium | Tiny exact blocklist | Check a maintained breached/common/expected-password corpus without sending the password to third parties |
| Medium | No Unicode normalization | Apply NFC at every set and verify boundary, with backward-compatible migration for existing hashes |
| Medium | Usernames are not canonicalized centrally | Define trim/case/character policy and persist a unique normalized identifier |
| Medium | Missing-account verification has different work | Verify a fixed dummy hash and rate-limit attempts |
| Medium | Token shape is unconstrained and consume is non-atomic | Cap token length, validate expected URL-safe form, and claim once atomically |

## Proposed canonical input contract

### New password

The following service must be the sole route from untrusted password text to storage:

1. Require a JSON string; reject null, arrays, numbers, invalid UTF-8, and control characters that cannot be entered reliably.
2. Do **not** trim, collapse whitespace, case-fold, remove characters, or truncate.
3. Normalize to Unicode NFC once, centrally, before length checks and hashing. Login must use the identical normalization. During migration, successful verification should try the legacy exact value first, then the NFC value only where safe, and rehash the winner; never create multiple accounts or reveal which form matched.
4. Count Unicode code points after NFC for the user-facing length rule.
5. While password is the only factor, require at least 15 code points. If the application later guarantees MFA for a flow, NIST permits a minimum of 8, but one 15-character policy across roles is simpler and safer.
6. Support at least 64 characters. Recommended application contract: maximum 128 code points and 512 UTF-8 bytes after NFC. Return a validation error rather than truncating. Also impose a small whole-request limit at the HTTP boundary.
7. Reject values found in a maintained list of compromised, commonly used, or expected passwords. Include context variants derived from username, email, role, institute/application name, and obvious local terms. Do not log the candidate or send it in full to an external API; use an offline corpus or a privacy-preserving range-query design with controlled failure behavior.
8. Do not require mixed case, digits, symbols, or arbitrary character-class combinations. Do not calculate “complexity scores” as an acceptance gate.
9. Reject a new password equal to the current password after canonicalization. Broad password-history rules are optional and often harmful; do not add them without a specific threat/compliance requirement.
10. Hash only after every validation passes. Store algorithm and parameters in the encoded hash.

Suggested machine errors:

| Error | Meaning | Safe UI behavior |
|---|---|---|
| `password_required` | Missing/not a string/empty | “Enter a password.” |
| `password_too_short` | Fewer than 15 normalized code points | Include `minLength: 15` |
| `password_too_long` | More than 128 code points or 512 bytes | Explain supported maximum; never echo input |
| `password_compromised` | Blocklist/context match | Ask for a different password; do not reveal corpus details |
| `password_same_as_current` | New value equals current | Ask for a different password |
| `password_invalid_characters` | Disallowed control/invalid encoding | Explain that normal printable Unicode and spaces are accepted |

Password policy errors are appropriate during registration/change/reset after a valid invite or authenticated session. Login must continue returning only generic authentication failure.

### Password UI

All registration/change/reset forms should:

- use `autocomplete="new-password"`; login uses `current-password`;
- permit paste, autofill, and password managers;
- show the actual minimum and maximum before submission;
- offer a show/hide control so users can verify long passphrases;
- compare confirmation to the exact unmodified password;
- perform the same length checks for fast feedback, while treating server errors as authoritative;
- clear secret state after success and on flow expiry, and never place it in URLs, logs, analytics, persistence, cache keys, or error telemetry.

Do not disable the submit button solely because a client strength meter dislikes a password. The breached-password and final policy decision belongs to the server.

### Username/login identifier

Choose and document one policy. Recommended for this project:

1. Strip leading/trailing Unicode whitespace from usernames—but never passwords.
2. Apply NFC and a chosen case policy centrally. A practical target is a case-insensitive normalized lookup key while preserving a display form.
3. Permit a conservative, documented character set suitable for staff identifiers; reject control characters, path separators, bidi controls, and invisible-format characters unless the product has a demonstrated need.
4. Enforce minimum/maximum after normalization, for example 3–64 code points, and enforce database uniqueness on the normalized column.
5. Use an immutable account UUID for foreign keys and session subject; allow controlled username changes without rewriting identity history.
6. Before migration, inventory collisions such as `Alice`/`alice`, whitespace variants, and canonically equivalent Unicode.

Email invite identifiers should be parsed by a standards-aware library, trimmed, and domain-normalized. Avoid assuming the local part is case-insensitive unless the product explicitly adopts that constraint. The current code lowercases the entire doctor email; preserve or deliberately migrate that behavior rather than changing it accidentally.

### Login request

Login validates shape and resource use, not new-password strength:

- Require exactly a username string and password string; reject wrong JSON types.
- Cap username and password bytes before expensive work. The cap must still accept every password allowed by registration and any grandfathered legacy maximum.
- Normalize username using the canonical identifier policy.
- Normalize password exactly as the matching stored credential version requires; do not trim.
- For legacy bcrypt, safely handle its byte ceiling. A value outside any possible stored credential range should still follow a constant-shape failure path.
- Use a fixed dummy password hash when no account exists.
- Return the same status/body for unknown username and incorrect password. Do not expose whether a password failed normalization, size, or hash verification.
- Apply per-account and per-IP/network throttling with progressive delay; do not rely only on client debounce.
- Never log request bodies, password length, normalization differences, hashes, or raw cookies.

### Authenticated password change

Target payload:

```json
{
  "currentPassword": "exact existing secret",
  "newPassword": "exact new secret"
}
```

Required server order:

1. Validate authenticated, active account and CSRF-protected request.
2. Require recent authentication; require MFA/step-up for privileged accounts.
3. Shape/size-check both inputs without trimming.
4. Verify `currentPassword` against the stored credential using the login compatibility path.
5. Run the canonical new-password policy, including compromised/context checks and “different from current.”
6. Hash with current Argon2id parameters and commit the credential change.
7. Revoke all other sessions; rotate the current session only if policy intentionally keeps it.
8. Send a security notification without any secret or reset link.

Return a generic current-credential error rather than exposing hash or normalization details. Rate-limit repeated current-password failures.

### Recovery/invite password reset

A reset token substitutes for `currentPassword`; it does not weaken new-password validation.

- Require a bounded URL-safe token string of the expected entropy/encoded length.
- Hash it before lookup; compare only the hash.
- Validate purpose, account binding, expiry, unused state, and account status.
- Atomically mark it consumed in the same transaction as the password change.
- Apply the canonical new-password policy.
- Revoke all sessions and notify the account. Do not auto-login.
- Return a common error for malformed, unknown, expired, and consumed tokens.
- Rate-limit both reset requests and token submissions.

## Implementation shape

Create a credential module with no route-specific policy constants:

```python
canonicalize_password(raw: str) -> CanonicalPassword
validate_new_password(raw: str, context: PasswordContext) -> CanonicalPassword
hash_password(canonical: CanonicalPassword) -> str
verify_password(raw: str, stored_hash: str) -> VerifyResult
needs_rehash(stored_hash: str) -> bool
normalize_login_identifier(raw: str) -> str
```

`PasswordContext` should carry only the values needed for expected-password screening—normalized username, email fragments, role, and application/institute terms—and must never be logged. `VerifyResult` should report success and whether rehash is needed internally, without changing the public login response.

Call `validate_new_password` from:

- `/setup/initialize`;
- `/sysadmin/accounts`;
- operator/admin invitation acceptance;
- new-doctor onboarding;
- doctor rotation/recovery;
- authenticated password change;
- any temporary legacy reset route until it is removed.

Remove direct calls to `hash_password` from general doctor create/update routes. Add code review/static checks so future endpoints cannot bypass the credential service.

## Required test matrix

Run every new-password vector against every credential-setting endpoint, not only the service unit test.

| Category | Cases |
|---|---|
| Boundaries | 0, 14, 15, 64, 128, 129 code points; 511/512/513 UTF-8 bytes |
| Whitespace | Leading, trailing, internal, all-space, tabs/newlines/control characters; registration and login must agree |
| Unicode | NFC/NFD equivalent forms, emoji, combining marks, non-Latin scripts, four-byte code points, invalid encoding at HTTP boundary |
| Compromised values | Exact, case variants where applicable, context-derived username/email/application terms, corpus service unavailable |
| bcrypt migration | 71/72/73-byte legacy inputs, valid bcrypt login and Argon2id rehash, malformed hash, Argon2id parameter upgrade |
| Confirmation | Exact match/mismatch; prove no trimming or case transformation |
| Login | Unknown user dummy-hash path, wrong password, oversized input, generic response equality, throttle account/IP dimensions |
| Change | Wrong current password, stale/recent auth, same new password, revoked sessions, concurrent changes |
| Reset/invite | Malformed/unknown/expired/consumed token same response; atomic double-submit allows one success only |
| Username | Trim/case/NFC collisions, length boundaries, prohibited controls, migration collision handling |
| Logging | Assert passwords, hashes, tokens, and token-bearing paths are absent from app/proxy/analytics logs |

Property-based tests should assert that for every accepted password `p`, `verify(p, hash(canonicalize(p)))` succeeds and any distinct input that is not canonically equivalent fails. Fuzz schema boundaries to ensure malformed/oversized bodies fail before expensive hashing.

## Rollout cautions

- Removing client trimming can expose existing accounts whose stored secret was the trimmed form. Continue verifying their current exact submitted value; do not guess whitespace variants.
- Adding NFC can change the byte representation of existing Unicode passwords. Use version-aware verification and rehash rather than normalizing all stored hashes offline—plaintext is unavailable.
- Do not reject legacy passwords at login merely because they fail the new creation policy. Prompt an authenticated change or require reset after a deliberate migration deadline.
- Audit bcrypt inputs and dependency behavior before deploying a strict byte rule; never truncate existing credentials.
- Identifier canonicalization requires a collision report and operator-led resolution before adding a unique normalized index.

## Standards used for the target contract

- [NIST SP 800-63B §3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html): 15-character minimum for single-factor passwords, at least 64-character support, spaces/Unicode, NFC, blocklists, no composition rules, no routine forced rotation, full-password verification, password-manager/paste support, and rate limiting.
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): Argon2id guidance and bcrypt’s 72-byte limitation.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): generic errors, throttling, MFA, and reauthentication for sensitive changes.
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): random bound single-use expiring tokens, consistent password policy, notification, no automatic login, and session invalidation.
