import { notFound } from "next/navigation";

import { ApiError } from "./api";

// Shared "this doesn't exist" handling for [id] detail pages, so entity-level
// 404s render the same global not-found boundary as unmatched URLs
// (src/app/not-found.tsx) instead of each page inventing its own banner —
// or worse, hanging on a spinner forever (issue #52).
//
// Both helpers abort the render by throwing (notFound() returns `never`), so
// call them before the JSX that assumes the data exists.

// Digits only. Number() alone would accept "0x10" (→ 16) and "1e2" (→ 100),
// silently loading a different record than the URL appears to name.
const NUMERIC_ID = /^\d+$/;

/** Parse a numeric route param, rendering the 404 boundary for anything that
 *  isn't a positive integer id. Guards two failure modes: a malformed value
 *  (e.g. /appointments/abc) used to produce NaN, which disabled the data query
 *  and left the page loading forever; and an out-of-range value would have
 *  been sent to the API as a float. */
export function parseIdParam(raw: string | undefined): number {
  if (!raw || !NUMERIC_ID.test(raw)) notFound();
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return id;
}

/** Render the 404 boundary when a detail query failed because the entity
 *  doesn't exist (HTTP 404). Returns normally for every other error (403,
 *  5xx, network) so callers fall through to their inline error banner —
 *  those mean something other than "not found". */
export function throwNotFoundIf404(error: unknown): void {
  if (error instanceof ApiError && error.status === 404) notFound();
}
