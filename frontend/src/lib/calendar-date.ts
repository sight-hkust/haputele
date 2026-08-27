import { endOfWeek, format, parseISO, startOfWeek } from "date-fns";

import { monthShort } from "@/lib/date-locale";
import { getActiveLocale } from "@/lib/i18n";

const WEEK_STARTS_ON = 1 as const;

export function parseCalendarDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWeekRange(value: string): string {
  const date = parseCalendarDate(value);
  if (!date) return "";
  const start = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });

  if (getActiveLocale() === "si") {
    const startDay = start.getDate();
    const endDay = end.getDate();
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${startDay}–${endDay} ${monthShort(end)} ${end.getFullYear()}`;
    }
    return `${startDay} ${monthShort(start)}–${endDay} ${monthShort(end)} ${end.getFullYear()}`;
  }

  // English fallback — keep compact numeric range used before i18n.
  return start.getMonth() === end.getMonth()
    ? `${format(start, "d")}–${format(end, "d MMM yyyy")}`
    : `${format(start, "d MMM")}–${format(end, "d MMM yyyy")}`;
}
