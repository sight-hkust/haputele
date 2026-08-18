import { endOfWeek, format, parseISO, startOfWeek } from "date-fns";

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
  return start.getMonth() === end.getMonth()
    ? `${format(start, "d")}–${format(end, "d MMM yyyy")}`
    : `${format(start, "d MMM")}–${format(end, "d MMM yyyy")}`;
}
