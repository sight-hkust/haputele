// Maps backend error codes (apiSequenceFlows.md "Error Codes") to UX copy.
// Per §12, the API responds in English codes and the client translates using
// the active UI locale (English / Sinhala dictionaries in lib/i18n).
import { en } from "@/lib/i18n/en";
import { getActiveLocale, translate } from "@/lib/i18n";

const KNOWN_CODES = new Set(Object.keys(en.errors));

export function explainError(code: string, fallback?: string): string {
  if (KNOWN_CODES.has(code)) {
    return translate(getActiveLocale(), `errors.${code}`);
  }
  return fallback ?? translate(getActiveLocale(), "common.somethingWentWrong");
}

/**
 * True when the code has curated copy in the i18n dictionaries. Used by error
 * banners to decide whether showing a support reference (requestId) adds
 * anything — a message like "That time has already passed" explains itself;
 * "Something went wrong" does not, and the reference lets ops find the exact
 * server log entry.
 */
export function isKnownErrorCode(code: string): boolean {
  return KNOWN_CODES.has(code);
}
