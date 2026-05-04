import { addDays, addMinutes, format, parseISO } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { APP_TIMEZONE } from "@/lib/format";
import {
  cellKey,
  type CellKey,
  SLOT_MINUTES,
  SLOT_MIN_HOUR,
  SLOTS_PER_DAY,
} from "./week-grid";

// ── Window / cell conversions ────────────────────────────────────────
//
// The week-grid quantizes availability into 30-min cells. The backend stores
// arbitrary {startAt, endAt} windows. These helpers move between the two.
//
// Convention used throughout this module:
//   - `weekStartLocal`: a Date object whose .getFullYear/.getDate/.getHours
//     reflect the APP_TIMEZONE wall-clock for Monday 00:00. (a "zoned" date
//     in date-fns-tz parlance — produced by `toZonedTime` or by setting
//     fields directly.)
//   - ISO strings on the wire are real UTC instants (parseISO yields real-UTC).
//
// Conversions:
//   real-UTC instant → zoned wall-clock: toZonedTime(d, APP_TIMEZONE)
//   zoned wall-clock → real-UTC instant: fromZonedTime(d, APP_TIMEZONE)

type Window = { startAt: string; endAt: string };

/**
 * Expand each window into the set of 30-min cells it covers, snapping to
 * cell boundaries (overestimate — a 09:15–11:45 window becomes 09:00–12:00
 * cells). Cells outside the visible day range or outside `weekStartLocal`
 * + 7 days are dropped.
 */
export function windowsToCells(windows: Window[], weekStartLocal: Date): Set<CellKey> {
  const cells = new Set<CellKey>();
  const weekStartMs = weekStartLocal.getTime();
  const weekEndMs = weekStartMs + 7 * 86_400_000;
  const slotMs = SLOT_MINUTES * 60_000;

  for (const w of windows) {
    const startLocal = toZonedTime(parseISO(w.startAt), APP_TIMEZONE);
    const endLocal = toZonedTime(parseISO(w.endAt), APP_TIMEZONE);
    if (endLocal.getTime() <= weekStartMs || startLocal.getTime() >= weekEndMs) continue;

    // Snap start down to the nearest cell boundary, end up.
    const stepStart = new Date(Math.floor(startLocal.getTime() / slotMs) * slotMs);
    const stepEnd = new Date(Math.ceil(endLocal.getTime() / slotMs) * slotMs);

    for (let t = stepStart; t < stepEnd; t = addMinutes(t, SLOT_MINUTES)) {
      const dayMs = t.getTime() - weekStartMs;
      const dayIndex = Math.floor(dayMs / 86_400_000);
      if (dayIndex < 0 || dayIndex >= 7) continue;
      const minutesIntoDay = t.getHours() * 60 + t.getMinutes();
      const slotIndex = (minutesIntoDay - SLOT_MIN_HOUR * 60) / SLOT_MINUTES;
      if (slotIndex < 0 || slotIndex >= SLOTS_PER_DAY) continue;
      cells.add(cellKey(dayIndex, Math.floor(slotIndex)));
    }
  }
  return cells;
}

/**
 * Group consecutive cells (per day) into the smallest set of contiguous
 * windows. Returns ISO timestamps in real UTC, derived by interpreting the
 * cell positions as APP_TIMEZONE wall-clock.
 */
export function cellsToWindows(cells: Set<CellKey>, weekStartLocal: Date): Window[] {
  const byDay = new Map<number, number[]>();
  for (const k of cells) {
    const [d, s] = k.split("-").map(Number);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(s);
  }
  const out: Window[] = [];
  for (const [dayIndex, slots] of byDay) {
    slots.sort((a, b) => a - b);
    const dayDate = addDays(weekStartLocal, dayIndex);
    const ymd = format(dayDate, "yyyy-MM-dd");
    let runStart: number | null = null;
    let runPrev: number | null = null;
    const flush = (start: number, endExclusive: number) => {
      const startMin = SLOT_MIN_HOUR * 60 + start * SLOT_MINUTES;
      const endMin = SLOT_MIN_HOUR * 60 + endExclusive * SLOT_MINUTES;
      const startTime = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}:00`;
      const endTime = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00`;
      out.push({
        startAt: fromZonedTime(`${ymd} ${startTime}`, APP_TIMEZONE).toISOString(),
        endAt: fromZonedTime(`${ymd} ${endTime}`, APP_TIMEZONE).toISOString(),
      });
    };
    for (const s of slots) {
      if (runStart === null) {
        runStart = s;
        runPrev = s;
      } else if (s === (runPrev as number) + 1) {
        runPrev = s;
      } else {
        flush(runStart, (runPrev as number) + 1);
        runStart = s;
        runPrev = s;
      }
    }
    if (runStart !== null) flush(runStart, (runPrev as number) + 1);
  }
  return out;
}

/** Booked-appointment overlay — 30-min hint per appointment, snapped to the
 * grid's cell granularity. Used by the availability page to render a
 * visibility marker (not a constraint) on cells that already have a booking. */
export function appointmentsToCells(
  appts: { scheduledAt: string }[],
  weekStartLocal: Date,
): Set<CellKey> {
  return windowsToCells(
    appts.map((a) => {
      const start = parseISO(a.scheduledAt);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      return { startAt: a.scheduledAt, endAt: end.toISOString() };
    }),
    weekStartLocal,
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Shift every window by a multiple of 7 days (used by "copy to N weeks"). */
export function shiftWindowsByWeeks(windows: Window[], weeks: number): Window[] {
  const ms = weeks * 7 * 86_400_000;
  return windows.map((w) => ({
    startAt: new Date(parseISO(w.startAt).getTime() + ms).toISOString(),
    endAt: new Date(parseISO(w.endAt).getTime() + ms).toISOString(),
  }));
}

/** Local Monday 00:00 (zoned) for the week containing the given instant. */
export function startOfWeekLocal(realInstant: Date): Date {
  const zoned = toZonedTime(realInstant, APP_TIMEZONE);
  const day = zoned.getDay(); // 0=Sun, 1=Mon, …
  const offset = (day + 6) % 7; // Mon=0
  zoned.setDate(zoned.getDate() - offset);
  zoned.setHours(0, 0, 0, 0);
  return zoned;
}

/** Real-UTC ISO bounds for the API, given a zoned Monday 00:00. */
export function weekRangeUtc(weekStartLocal: Date): { from: string; to: string } {
  const ymd = format(weekStartLocal, "yyyy-MM-dd");
  const endYmd = format(addDays(weekStartLocal, 7), "yyyy-MM-dd");
  return {
    from: fromZonedTime(`${ymd} 00:00:00`, APP_TIMEZONE).toISOString(),
    to: fromZonedTime(`${endYmd} 00:00:00`, APP_TIMEZONE).toISOString(),
  };
}
