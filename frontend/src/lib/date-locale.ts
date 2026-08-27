import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import type { Locale } from "date-fns";

import { getActiveLocale, translate } from "@/lib/i18n";

const INTL_LOCALE = { en: "en-GB", si: "si-LK" } as const;

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

export function intlLocaleTag(): string {
  return INTL_LOCALE[getActiveLocale()];
}

/** date-fns locale — English only; Sinhala uses dictionary month names. */
export function dateFnsLocale(): Locale {
  return enUS;
}

export function monthShort(date: Date): string {
  return translate(getActiveLocale(), `format.months.${MONTH_KEYS[date.getMonth()]}`);
}

export function formatWithIntl(date: Date, options: Intl.DateTimeFormatOptions): string {
  if (getActiveLocale() === "si") {
    const day = date.getDate();
    if (options.month && options.year) return `${day} ${monthShort(date)} ${date.getFullYear()}`;
    if (options.month) return `${day} ${monthShort(date)}`;
    return String(day);
  }
  return new Intl.DateTimeFormat(intlLocaleTag(), options).format(date);
}

export function formatRelativeLocalized(iso: string): string {
  try {
    const date = parseISO(iso);
    const locale = getActiveLocale();
    const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
    const abs = Math.abs(diffSec);
    const t = (key: string, n: number) => translate(locale, key, { n });
    if (abs < 60) return translate(locale, "format.relative.justNow");
    if (abs < 3600) {
      const n = Math.round(abs / 60);
      return t(n === 1 ? "format.relative.minuteAgo" : "format.relative.minutesAgo", n);
    }
    if (abs < 86400) {
      const n = Math.round(abs / 3600);
      return t(n === 1 ? "format.relative.hourAgo" : "format.relative.hoursAgo", n);
    }
    if (abs < 2592000) {
      const n = Math.round(abs / 86400);
      return t(n === 1 ? "format.relative.dayAgo" : "format.relative.daysAgo", n);
    }
    if (abs < 31536000) {
      const n = Math.round(abs / 2592000);
      return t(n === 1 ? "format.relative.monthAgo" : "format.relative.monthsAgo", n);
    }
    const n = Math.round(abs / 31536000);
    return t(n === 1 ? "format.relative.yearAgo" : "format.relative.yearsAgo", n);
  } catch {
    return iso;
  }
}

/** Localized Mon–Sun span, e.g. "24 Aug – 30 Aug 2026". */
export function formatWeekSpan(start: Date, end: Date): string {
  if (getActiveLocale() === "si") {
    const startPart = `${start.getDate()} ${monthShort(start)}`;
    const endPart = `${end.getDate()} ${monthShort(end)} ${end.getFullYear()}`;
    return `${startPart} – ${endPart}`;
  }
  return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
}
