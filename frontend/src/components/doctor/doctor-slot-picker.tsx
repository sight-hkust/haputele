"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { DatePicker } from "@/components/primitives/date-picker";
import { Label } from "@/components/primitives/input";
import { Select } from "@/components/primitives/select";
import { startOfWeekLocal } from "@/components/doctor/availability-grid-utils";
import { useAppointmentList, useDoctorAvailability } from "@/lib/use-api";
import { APP_TIMEZONE, appToday } from "@/lib/format";
import { formatWeekSpan, formatWithIntl } from "@/lib/date-locale";
import { captionClass, captionClassTight } from "@/lib/caption-class";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";

// Slot picker for one doctor, one week at a time. Three controls in one frame:
//
//   1. Week nav (prev / next / this-week) — pick which week to look at.
//   2. Chip grid — open 15-min slots inside that week's declared availability.
//   3. "Or pick another time" — date input + 15-min slot dropdown that
//      includes times outside declared availability (with a soft warning).
//
// Used by:
//   - Consultation submit's "Book follow-up appointment" branch (doctor self)
//   - HW manual booking form
//   - HW "book from queue" flow
//
// Already-booked slots (other appointments) never appear; the existing
// _slot_taken backend check is the safety net.
//
// Elapsed slots never appear either. A slot counts as elapsed only once its
// *whole* window has passed — the slot you are currently inside stays
// bookable so a HW can start the consultation right away. The backend
// mirrors this exactly (BOOKING_GRACE in app/dateutils.py) and is the
// authority, since the filter here runs on the browser clock.

const SLOT_MIN = 15;
const SLOT_MS = SLOT_MIN * 60 * 1000;
const NOW_TICK_MS = 60_000; // re-filter every minute so a long-open tab can't go stale
const HORIZON_WEEKS = 12; // backend caps to 92 days; 12 weeks = 84 days
const VISIBLE_HOUR_MIN = 7; // 07:00 — earliest "Or pick another time" slot
const VISIBLE_HOUR_MAX = 20; // 20:00 — exclusive upper bound

export function DoctorSlotPicker({
  doctorId,
  value,
  onChange,
  defaultWeeksAhead = 0,
}: {
  doctorId: number;
  /** datetime-local string, "yyyy-MM-ddTHH:mm" — APP_TIMEZONE wall-clock */
  value: string;
  onChange: (v: string) => void;
  /** Initial week offset to land on. Defaults to 0 (this week) — HW booking
      tends to want soon-as-possible. Consultation follow-up passes 4. */
  defaultWeeksAhead?: number;
}) {
  const { t, locale } = useI18n();
  // If a value is already set on mount (e.g. queue entry's targetDate
  // pre-fill, or follow-up branch reopen), land on that week so the chosen
  // chip is immediately visible. Otherwise use defaultWeeksAhead.
  const [weeksAhead, setWeeksAhead] = useState<number>(() => {
    if (value) {
      try {
        const valueLocal = fromZonedTime(`${value.replace("T", " ")}:00`, APP_TIMEZONE);
        const valueWeekStart = startOfWeekLocal(valueLocal);
        const todayWeekStart = startOfWeekLocal(new Date());
        const diffWeeks = Math.round(
          (valueWeekStart.getTime() - todayWeekStart.getTime()) / (7 * 86_400_000),
        );
        return Math.max(0, diffWeeks);
      } catch {
        /* fall through */
      }
    }
    return defaultWeeksAhead;
  });

  // Ticking "now" — a picker left open at 09:00 must stop offering 09:15
  // once that slot has run out, without the user reloading.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const weekStartLocal = useMemo(
    () => startOfWeekLocal(addDays(new Date(), weeksAhead * 7)),
    [weeksAhead],
  );

  // 12-week horizon = one cache entry; chip list filters per-week, the
  // "outside declared" warning checks against the full horizon.
  const horizonRange = useMemo(() => {
    const startZoned = startOfWeekLocal(new Date());
    const endZoned = addDays(startZoned, HORIZON_WEEKS * 7);
    return {
      from: fromZonedTime(
        `${format(startZoned, "yyyy-MM-dd")} 00:00:00`,
        APP_TIMEZONE,
      ).toISOString(),
      to: fromZonedTime(`${format(endZoned, "yyyy-MM-dd")} 00:00:00`, APP_TIMEZONE).toISOString(),
    };
  }, []);

  const availQ = useDoctorAvailability(doctorId, horizonRange);
  const apptQ = useAppointmentList({
    from: horizonRange.from,
    to: horizonRange.to,
    doctorId,
  });

  const allWindows = availQ.data ?? [];
  const allAppts = (apptQ.data ?? []).filter((a) => a.status !== "cancelled");
  const bookedAt = useMemo(
    () => new Set(allAppts.map((a) => parseISO(a.scheduledAt).getTime())),
    [allAppts],
  );

  // Open slots inside declared availability for the visible week, by ymd.
  // `declaredDays` records which days had *any* declared window before the
  // booked/elapsed filters ran, so an emptied-out day can say "no slots
  // left" instead of wrongly claiming the doctor declared nothing.
  const { byDay: slotsByDay, declaredDays } = useMemo(() => {
    const byDay = new Map<string, Date[]>();
    const declared = new Set<string>();
    const weekStartMs = parseISO(
      fromZonedTime(`${format(weekStartLocal, "yyyy-MM-dd")} 00:00:00`, APP_TIMEZONE).toISOString(),
    ).getTime();
    const weekEndMs = weekStartMs + 7 * 86_400_000;

    for (const w of allWindows) {
      const wStart = parseISO(w.startAt).getTime();
      const wEnd = parseISO(w.endAt).getTime();
      const t0 = Math.max(wStart, weekStartMs);
      const tEnd = Math.min(wEnd, weekEndMs);
      for (let t = t0; t + SLOT_MS <= tEnd; t += SLOT_MS) {
        const slot = new Date(t);
        const ymd = formatInTimeZone(slot, APP_TIMEZONE, "yyyy-MM-dd");
        declared.add(ymd);
        if (bookedAt.has(t)) continue;
        if (t + SLOT_MS <= nowMs) continue; // whole slot elapsed
        const list = byDay.get(ymd) ?? [];
        list.push(slot);
        byDay.set(ymd, list);
      }
    }
    for (const list of byDay.values()) list.sort((a, b) => a.getTime() - b.getTime());
    return { byDay, declaredDays: declared };
  }, [allWindows, bookedAt, weekStartLocal, nowMs]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStartLocal, i);
        return {
          date: d,
          ymd: format(d, "yyyy-MM-dd"),
          label: formatWithIntl(d, { weekday: "short", day: "numeric", month: "short" }),
        };
      }),
    [weekStartLocal, locale],
  );

  const valueAsMs = useMemo(() => {
    if (!value) return null;
    try {
      return fromZonedTime(`${value.replace("T", " ")}:00`, APP_TIMEZONE).getTime();
    } catch {
      return null;
    }
  }, [value]);

  const valueOutsideDeclared = useMemo(() => {
    if (valueAsMs == null) return false;
    return !allWindows.some((w) => {
      const s = parseISO(w.startAt).getTime();
      const e = parseISO(w.endAt).getTime();
      return valueAsMs >= s && valueAsMs < e;
    });
  }, [valueAsMs, allWindows]);

  const pickSlot = (slot: Date) => {
    onChange(formatInTimeZone(slot, APP_TIMEZONE, "yyyy-MM-dd'T'HH:mm"));
  };

  // Custom date + time-slot pickers — derived from `value` so they stay in
  // sync no matter how the doctor chose the time.
  const customDate = value ? value.slice(0, 10) : "";
  const customTime = value ? value.slice(11, 16) : "";

  const setCustomDate = (d: string) => {
    if (!d) {
      onChange("");
      return;
    }
    const time = customTime || "09:00";
    onChange(`${d}T${time}`);
  };
  const setCustomTime = (timeVal: string) => {
    if (!timeVal) return;
    const date = customDate || formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
    onChange(`${date}T${timeVal}`);
  };

  // 15-min options for the "Or pick another time" select. Booked and
  // elapsed instants for the chosen date are flagged disabled — kept in the
  // list rather than dropped so the 07:00–20:00 rows stay in fixed positions.
  const customSlotOptions = useMemo(() => {
    if (!customDate) return [];
    const out: { value: string; label: string; disabled: boolean }[] = [];
    for (let m = VISIBLE_HOUR_MIN * 60; m < VISIBLE_HOUR_MAX * 60; m += SLOT_MIN) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const hh = String(h).padStart(2, "0");
      const mm = String(min).padStart(2, "0");
      const ts = fromZonedTime(`${customDate} ${hh}:${mm}:00`, APP_TIMEZONE).getTime();
      const booked = bookedAt.has(ts);
      const past = ts + SLOT_MS <= nowMs;
      const suffix = booked ? t("slotPicker.bookedSuffix") : past ? t("slotPicker.pastSuffix") : "";
      out.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}${suffix}`, disabled: booked || past });
    }
    return out;
  }, [customDate, bookedAt, nowMs, t]);

  const weekLabel =
    weeksAhead === 0
      ? t("slotPicker.thisWeek")
      : weeksAhead === 1
        ? t("slotPicker.nextWeek")
        : t("slotPicker.weeksAhead", { n: weeksAhead });
  const weekRangeLabel = formatWeekSpan(weekStartLocal, addDays(weekStartLocal, 6));
  const loading = availQ.isLoading || apptQ.isLoading;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      {/* Week nav ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setWeeksAhead(Math.max(0, weeksAhead - 1))}
          disabled={weeksAhead === 0}
          aria-label={t("slotPicker.prevWeek")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-[10rem] flex-col items-center">
          <span className="text-sm font-semibold tracking-[-0.01em]">{weekLabel}</span>
          <span className={captionClassTight(locale, "text-[var(--muted-foreground)]")}>
            {weekRangeLabel}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setWeeksAhead(weeksAhead + 1)}
          aria-label={t("slotPicker.nextWeekAria")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {weeksAhead !== 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setWeeksAhead(0)}>
            {t("slotPicker.thisWeek")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className={captionClass(locale, "text-[var(--muted-foreground)]")}>
          {t("slotPicker.openSlots")}
        </span>
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-[var(--muted-foreground)]">
            <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {days.map((d) => {
              const slots = slotsByDay.get(d.ymd) ?? [];
              return (
                <div key={d.ymd} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-3">
                  <span className={captionClassTight(locale, "text-[var(--muted-foreground)]")}>
                    {d.label}
                  </span>
                  {slots.length === 0 ? (
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {declaredDays.has(d.ymd)
                        ? t("slotPicker.noSlotsRemaining")
                        : t("slotPicker.noDeclaredAvailability")}
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {slots.map((slot) => {
                        const isSelected = valueAsMs === slot.getTime();
                        return (
                          <button
                            key={slot.getTime()}
                            type="button"
                            onClick={() => pickSlot(slot)}
                            className={cn(
                              "rounded-lg border px-2 py-0.5 font-mono text-xs tabular-nums transition-all",
                              isSelected
                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400",
                            )}
                          >
                            {formatInTimeZone(slot, APP_TIMEZONE, "HH:mm")}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom date + 15-min slot dropdown ───────────────────────────── */}
      <div className="mt-2 flex flex-col gap-1.5">
        <Label>{t("slotPicker.orPickAnotherTime")}</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <DatePicker
            value={customDate}
            onChange={setCustomDate}
            min={appToday()}
            placeholder={t("slotPicker.chooseAnotherDate")}
            ariaLabel={t("slotPicker.chooseAppointmentDate")}
          />
          <Select
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            disabled={!customDate}
          >
            <option value="">{t("slotPicker.pickSlot")}</option>
            {customSlotOptions.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {valueOutsideDeclared && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t("slotPicker.outsideAvailability")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
