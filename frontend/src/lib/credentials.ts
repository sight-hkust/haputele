// Client-side mirror of the backend credential policy
// (backend/app/services/credentials.py). The server is authoritative — these
// exist so a user is told about a stray space while they can still see the
// field, instead of after a round-trip.
//
//   username — no whitespace at all, internal or external
//   password — no leading/trailing whitespace; internal whitespace is fine,
//              so passphrases stay usable
//   password — at least MIN_PASSWORD_LEN characters
//
// Nothing here transforms a value. Credential fields are never trimmed or
// rewritten on the way to the server: the original lockout bug came from one
// side trimming while the other didn't, so the rule is "reject, never repair".
//
// This module is the ONLY place any of these rules may be written down on the
// client. Every credential form imports from here.

/**
 * Mirrors MIN_PASSWORD_LEN in backend/app/services/credentials.py.
 *
 * backend/tests/test_credential_policy_frontend_parity.py fails if the two
 * numbers ever diverge. That test exists because they already did: the
 * doctor-onboarding page carried its own `const MIN_PASSWORD_LEN = 8` against
 * a backend that enforced 10, so its placeholder promised 8 was fine, its
 * `minLength` let 9 through, and the API then rejected it. Four other files
 * kept their own copy of the number too.
 */
export const MIN_PASSWORD_LEN = 10;

export const USERNAME_WHITESPACE_MESSAGE = "Username cannot contain spaces.";
export const PASSWORD_EDGE_WHITESPACE_MESSAGE = "Password cannot start or end with a space.";
export const PASSWORD_TOO_SHORT_MESSAGE = `Choose a password at least ${MIN_PASSWORD_LEN} characters long.`;
/** Field-hint / placeholder copy, so the number in the UI can't drift either. */
export const PASSWORD_LENGTH_HINT = `At least ${MIN_PASSWORD_LEN} characters`;

/** Validation message for a username being *set*, or null when it's fine. */
export function usernameError(value: string): string | null {
  return /\s/.test(value) ? USERNAME_WHITESPACE_MESSAGE : null;
}

/**
 * Edge-whitespace message for a password being *set*, or null when it's fine.
 *
 * Kept separate from the length rule because this one is safe to run on every
 * keystroke — it only fires on a mistake the user has actually made. Folding
 * length in here would shout "too short" at the first character typed.
 */
export function passwordError(value: string): string | null {
  return value !== value.trim() ? PASSWORD_EDGE_WHITESPACE_MESSAGE : null;
}

/** Length-only message for a password being *set*, or null when it's fine. */
export function passwordLengthError(value: string): string | null {
  return value.length < MIN_PASSWORD_LEN ? PASSWORD_TOO_SHORT_MESSAGE : null;
}

/**
 * Submit-time gate: the full client-side mirror of validate_new_password.
 *
 * Order matches the backend deliberately. Edge whitespace is checked BEFORE
 * length, because otherwise padding sneaks a short secret past the minimum —
 * "1234 5678 " is ten characters and only eight of them are real.
 */
export function newPasswordError(value: string): string | null {
  return passwordError(value) ?? passwordLengthError(value);
}

/**
 * Diagnostic hint shown only AFTER a failed sign-in.
 *
 * Login submits verbatim and the backend deliberately returns the same
 * `invalid_credentials` for every failure mode, so it can never tell us that
 * whitespace was the cause. We inspect what was typed and offer the most
 * likely explanation — which the user cannot do themselves for a password,
 * because the field is masked.
 *
 * The two fields differ in how certain we can be:
 *  - username: no stored username can contain whitespace (enforced by the
 *    field type AND a DB constraint on every new or updated row), so
 *    whitespace here is definitely wrong.
 *  - password: edge whitespace is only *probably* wrong — an account created
 *    before this policy may genuinely have it stored. Worded as a possibility
 *    so it doesn't mislead the very users it exists to help.
 */
export function loginWhitespaceHint(username: string, password: string): string | null {
  if (/\s/.test(username)) {
    return "Your username contains a space. Usernames never do — remove it and try again.";
  }
  if (password !== password.trim()) {
    return "Your password starts or ends with a space. If that wasn't deliberate, remove it and try again.";
  }
  return null;
}
