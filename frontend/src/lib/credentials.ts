// Client-side mirror of the backend credential policy
// (backend/app/services/credentials.py). The server is authoritative — these
// exist so a user is told about a stray space while they can still see the
// field, instead of after a round-trip.
//
//   username — no whitespace at all, internal or external
//   password — no leading/trailing whitespace; internal whitespace is fine,
//              so passphrases stay usable
//
// Nothing here transforms a value. Credential fields are never trimmed or
// rewritten on the way to the server: the original lockout bug came from one
// side trimming while the other didn't, so the rule is "reject, never repair".

export const USERNAME_WHITESPACE_MESSAGE = "Username cannot contain spaces.";
export const PASSWORD_EDGE_WHITESPACE_MESSAGE =
  "Password cannot start or end with a space.";

/** Validation message for a username being *set*, or null when it's fine. */
export function usernameError(value: string): string | null {
  return /\s/.test(value) ? USERNAME_WHITESPACE_MESSAGE : null;
}

/** Validation message for a password being *set*, or null when it's fine. */
export function passwordError(value: string): string | null {
  return value !== value.trim() ? PASSWORD_EDGE_WHITESPACE_MESSAGE : null;
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
 *    field type AND a DB constraint), so whitespace here is definitely wrong.
 *  - password: edge whitespace is only *probably* wrong — an account created
 *    before this policy may genuinely have it stored. Worded as a possibility
 *    so it doesn't mislead the very users it exists to help.
 */
export function loginWhitespaceHint(
  username: string,
  password: string,
): string | null {
  if (/\s/.test(username)) {
    return "Your username contains a space. Usernames never do — remove it and try again.";
  }
  if (password !== password.trim()) {
    return "Your password starts or ends with a space. If that wasn't deliberate, remove it and try again.";
  }
  return null;
}
