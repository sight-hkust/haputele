// Single source of truth for preconsult vitals validation. The bounds here
// mirror PreconsultIn in backend/app/schemas.py — keep the two in sync so the
// client catches a typo before the round-trip and the server stays the final
// authority. The same bounds drive (a) react-hook-form field rules, (b) the
// human-readable "out of range" copy, and (c) mapping a server 422 back onto
// the field that tripped it.

import type { ApiError } from "@/lib/api";

export type VitalField = "height" | "weight" | "sysBp" | "diaBp" | "pulse" | "temperature";

type Bound = {
  label: string;
  unit: string;
  min: number;
  max: number;
  /** true → whole numbers only (everything except temperature). */
  integer: boolean;
};

export const VITALS_BOUNDS: Record<VitalField, Bound> = {
  height: { label: "Height", unit: "cm", min: 30, max: 250, integer: true },
  weight: { label: "Weight", unit: "kg", min: 1, max: 400, integer: true },
  sysBp: { label: "Systolic BP", unit: "mmHg", min: 50, max: 300, integer: true },
  diaBp: { label: "Diastolic BP", unit: "mmHg", min: 30, max: 200, integer: true },
  pulse: { label: "Pulse", unit: "bpm", min: 20, max: 300, integer: true },
  temperature: { label: "Temperature", unit: "°C", min: 30, max: 45, integer: false },
};

export const PRIMARY_COMPLAINT_MAX = 2000;

/**
 * Validate one raw input string against its bound. Empty is always valid —
 * every vital is optional. Returns a user-facing message, or null when fine.
 * Designed to be used directly as a react-hook-form `validate` function.
 */
export function validateVital(field: VitalField, raw: string): string | null {
  const value = (raw ?? "").trim();
  if (value === "") return null; // optional — blank means "not measured"

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return `${VITALS_BOUNDS[field].label} must be a number.`;
  }

  const { label, unit, min, max, integer } = VITALS_BOUNDS[field];
  if (integer && !Number.isInteger(num)) {
    return `${label} must be a whole number.`;
  }
  if (num < min || num > max) {
    return `${label} looks off — enter a value between ${min} and ${max} ${unit}. Double-check the reading.`;
  }
  return null;
}

/**
 * Cross-field rule: a diastolic reading at or above systolic is physiologically
 * impossible and almost always a swapped/typo'd pair. Only fires when both are
 * present and individually valid. Returns a message for the diastolic field.
 */
export function validateBloodPressurePair(sysRaw: string, diaRaw: string): string | null {
  const sys = Number((sysRaw ?? "").trim());
  const dia = Number((diaRaw ?? "").trim());
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return null;
  if (sysRaw.trim() === "" || diaRaw.trim() === "") return null;
  if (dia >= sys) {
    return "Diastolic must be lower than systolic — check the two BP numbers aren't swapped.";
  }
  return null;
}

export type ParsedVitalsErrors = {
  /** Field → message, ready to feed into RHF `setError`. */
  fieldErrors: Partial<Record<VitalField, string>>;
  /** A single banner message for anything not pinned to a field. */
  formError: string | null;
};

const KNOWN_FIELDS = new Set<string>(Object.keys(VITALS_BOUNDS));

/**
 * Turn a backend 422 (`detail.errors` = FastAPI's validation list) into
 * per-field messages. Bound failures arrive with `loc` ending in the field
 * name; the diastolic<systolic rule arrives as a model-level error whose
 * message we recognise and pin to the diaBp field. Anything we can't place
 * falls back to a single readable form-level line.
 */
export function parseVitalsValidationError(err: ApiError | null | undefined): ParsedVitalsErrors {
  const empty: ParsedVitalsErrors = { fieldErrors: {}, formError: null };
  if (!err) return empty;

  // Non-validation conflicts (locked / consent-required) are handled by the
  // caller via explainError — we only own the 422 field-mapping here.
  if (err.status !== 422) return empty;

  const rawErrors = (err.detail?.errors ?? []) as Array<{
    loc?: unknown[];
    msg?: string;
  }>;
  if (!Array.isArray(rawErrors) || rawErrors.length === 0) {
    return { fieldErrors: {}, formError: null };
  }

  const fieldErrors: Partial<Record<VitalField, string>> = {};
  let formError: string | null = null;

  for (const e of rawErrors) {
    const loc = Array.isArray(e.loc) ? e.loc : [];
    const last = loc.length ? String(loc[loc.length - 1]) : "";
    const msg = String(e.msg ?? "");

    if (KNOWN_FIELDS.has(last)) {
      const field = last as VitalField;
      fieldErrors[field] = outOfRangeMessage(field);
      continue;
    }

    // The model-level BP-order rule (loc is just ["body"]). Pydantic prefixes
    // raised ValueErrors with "Value error, " — match on our sentinel.
    if (msg.includes("diaBp_must_be_below_sysBp")) {
      fieldErrors.diaBp = "Diastolic must be lower than systolic — check the two BP numbers aren't swapped.";
      continue;
    }

    if (!formError) formError = "Some vitals are out of range. Fix the highlighted fields and try again.";
  }

  return { fieldErrors, formError };
}

function outOfRangeMessage(field: VitalField): string {
  const { label, unit, min, max } = VITALS_BOUNDS[field];
  return `${label} looks off — enter a value between ${min} and ${max} ${unit}. Double-check the reading.`;
}
