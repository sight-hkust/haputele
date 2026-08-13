import { differenceInYears, formatDistanceToNow, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

// Single-source-of-truth for the application timezone. The DB stays in UTC;
// every visible timestamp is converted to APP_TIMEZONE at render time so the
// user's browser tz never matters. Inlined at build time from
// NEXT_PUBLIC_APP_TIMEZONE (set via docker-compose from APP_TIMEZONE in .env);
// falls back to Asia/Colombo for local `next dev` without docker.
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Colombo";

// Fixed to Sri Lanka regardless of APP_TIMEZONE. The bulk exports feed SL
// pharmacy pickup workflows, so the "day" they cover and the filename date
// stamp must stay SL-anchored even if the system is hosted with another
// APP_TIMEZONE. Mirrored on the backend as `EXPORT_TZ` in `app/tz.py`.
export const EXPORT_TIMEZONE = "Asia/Colombo";

export function fmtDate(iso: string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!iso) return "—";
  try {
    return formatInTimeZone(parseISO(iso), APP_TIMEZONE, pattern);
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  return fmtDate(iso, "d MMM yyyy · HH:mm");
}

export function fmtTime(iso: string | null | undefined): string {
  return fmtDate(iso, "HH:mm");
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

// Patient age for the on-screen patient headers — derived from dob, computed
// against today in APP_TIMEZONE so a "born today, viewed at midnight UTC"
// edge case doesn't off-by-one.
//
// NOT the source of the §1.7 age on the prescription: that PDF is rendered
// server-side (backend/app/pdf.py `format_age`) and computes age against the
// appointment date rather than today, so re-downloading an old prescription
// prints the age it was dispensed at. Expect these two to disagree for a
// patient whose birthday fell between the appointment and now — that's the
// intended behaviour, not drift.
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  try {
    return differenceInYears(toZonedTime(new Date(), APP_TIMEZONE), parseISO(dob));
  } catch {
    return null;
  }
}

// Convert a datetime-local input value (e.g. "2026-04-29T09:00") to a UTC
// ISO string by interpreting it in APP_TIMEZONE rather than the browser's
// local timezone. Used by appointment booking so the time the user types
// always means SL time, regardless of where they are.
export function appLocalToUtcIso(localDateTime: string): string {
  return fromZonedTime(localDateTime, APP_TIMEZONE).toISOString();
}

// Today as YYYY-MM-DD in the given timezone (default APP_TIMEZONE) — for
// date pickers. Pass EXPORT_TIMEZONE for export-related UI.
export function appToday(tz: string = APP_TIMEZONE): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

// Convert a YYYY-MM-DD picked in the UI to a UTC ISO range covering that
// day in the given timezone (default APP_TIMEZONE). Inclusive (`to` is
// end-of-day-1ms). Pass EXPORT_TIMEZONE when computing export windows.
export function appDayWindow(
  yyyyMmDd: string,
  tz: string = APP_TIMEZONE,
): { fromISO: string; toISO: string } {
  const start = fromZonedTime(`${yyyyMmDd} 00:00:00`, tz);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { fromISO: start.toISOString(), toISO: end.toISOString() };
}

export function fullName(p: { given: string; family: string }): string {
  return `${p.given} ${p.family}`.trim();
}

export function doctorName(d: { givenName: string; familyName: string }): string {
  return `Dr. ${d.givenName} ${d.familyName}`.trim();
}

// The §11 status values are named for the step being entered, not the step just
// completed — `consent_pending` is reached *after* consent is captured, and
// `data_collection` *after* the vitals are saved. Rendering them raw told the
// health worker the opposite of the truth, so never show the raw value: map it
// to whatever is actually outstanding.
const STATUS_LABELS: Record<string, string> = {
  scheduled:       "Scheduled",
  consent_pending: "Vitals pending",
  data_collection: "Ready to start",
  in_progress:     "In progress",
  awaiting_notes:  "Awaiting notes",
  completed:       "Completed",
  cancelled:       "Cancelled",
};

export function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s.replace(/_/g, " ");
}

// Queue target-date is stored as the Monday of the target week (snapped on
// the backend). Render it as "Week of d MMM" so the fuzzy semantics show.
export function fmtTargetWeek(yyyyMmDd: string | null | undefined): string {
  if (!yyyyMmDd) return "—";
  return `Week of ${fmtDate(yyyyMmDd)}`;
}
