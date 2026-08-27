import type { CalendarOptions, LocaleInput } from "@fullcalendar/core";
import siLk from "@fullcalendar/core/locales/si-lk";

import { formatWeekSpan, formatWithIntl, intlLocaleTag } from "@/lib/date-locale";
import { type Locale, translate } from "@/lib/i18n";

const SINHALA_DAY_NAMES = [
  "ඉරිදා",
  "සඳුදා",
  "අඟහරුවාදා",
  "බදාදා",
  "බ්‍රහස්පතින්දා",
  "සිකුරාදා",
  "සෙනසුරාදා",
] as const;

type FormatArg = {
  date: { marker: Date };
  start: { marker: Date };
  end?: { marker: Date };
  defaultSeparator: string;
};

function markerDate(arg: FormatArg): Date {
  return arg.start?.marker ?? arg.date.marker;
}

function formatSiTime(date: Date): string {
  return new Intl.DateTimeFormat(intlLocaleTag(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatSiWeekday(date: Date): string {
  return SINHALA_DAY_NAMES[date.getDay()];
}

function formatSiTitle(arg: FormatArg): string {
  const start = arg.start.marker;
  const end = arg.end?.marker;

  if (!end) {
    return formatWithIntl(start, { day: "numeric", month: "long", year: "numeric" });
  }

  const startDay = new Date(start);
  const endDay = new Date(end);
  endDay.setMilliseconds(endDay.getMilliseconds() - 1);

  if (startDay.getFullYear() !== endDay.getFullYear()) {
    return `${formatWithIntl(startDay, { day: "numeric", month: "long", year: "numeric" })}${arg.defaultSeparator}${formatWithIntl(endDay, { day: "numeric", month: "long", year: "numeric" })}`;
  }

  if (startDay.getMonth() !== endDay.getMonth()) {
    return `${formatWithIntl(startDay, { day: "numeric", month: "long" })}${arg.defaultSeparator}${formatWithIntl(endDay, { day: "numeric", month: "long", year: "numeric" })}`;
  }

  if (startDay.getDate() !== endDay.getDate()) {
    return formatWeekSpan(startDay, endDay);
  }

  return formatWithIntl(startDay, { day: "numeric", month: "long", year: "numeric" });
}

function buildSinhalaLocale(): LocaleInput {
  return {
    ...siLk,
    code: "si-LK",
    buttonText: {
      ...siLk.buttonText,
      prev: "පෙර",
      next: "ඊළඟ",
      today: translate("si", "common.today"),
      month: translate("si", "calendar.month"),
      week: translate("si", "calendar.week"),
      day: translate("si", "calendar.day"),
      list: translate("si", "calendar.agenda"),
    },
    weekText: "ස",
    allDayText: "දින පුරා",
    moreLinkText: (n) => `+ ${n}`,
    noEventsText: "සිදුවීම් නැත",
    dayNames: [...SINHALA_DAY_NAMES],
    dayNamesShort: ["ඉරි", "සඳු", "අඟ", "බදා", "බ්‍රහ", "සිකු", "සෙන"],
    monthNames: [
      "ජනවාරි",
      "පෙබරවාරි",
      "මාර්තු",
      "අප්‍රේල්",
      "මැයි",
      "ජූනි",
      "ජූලි",
      "අගෝස්තු",
      "සැප්තැම්බර්",
      "ඔක්තෝබර්",
      "නොවැම්බර්",
      "දෙසැම්බර්",
    ],
    monthNamesShort: [
      "ජන",
      "පෙබ",
      "මාර්",
      "අප්‍රේ",
      "මැයි",
      "ජූනි",
      "ජූලි",
      "අගෝ",
      "සැප්",
      "ඔක්",
      "නොවැ",
      "දෙසැ",
    ],
  } as LocaleInput;
}

/** FullCalendar locale code for the active app locale. */
export function getFullCalendarLocaleCode(appLocale: Locale): "si-LK" | "en-gb" {
  return appLocale === "si" ? "si-LK" : "en-gb";
}

/** Register custom locales (Sinhala) with FullCalendar. */
export function getFullCalendarLocales(appLocale: Locale): LocaleInput[] {
  return appLocale === "si" ? [buildSinhalaLocale()] : [];
}

/**
 * FullCalendar's Luxon integration ignores locale for several labels. Override
 * the rendered content directly when Sinhala is active.
 */
export function getFullCalendarFormatOptions(
  appLocale: Locale,
): Pick<
  CalendarOptions,
  | "titleFormat"
  | "dayHeaderFormat"
  | "dayHeaderContent"
  | "slotLabelFormat"
  | "slotLabelContent"
  | "eventTimeFormat"
> {
  if (appLocale !== "si") return {};

  return {
    titleFormat: (arg) => formatSiTitle(arg),
    dayHeaderFormat: (arg) => formatSiWeekday(markerDate(arg)),
    dayHeaderContent: (arg) => formatSiWeekday(arg.date),
    slotLabelFormat: (arg) => formatSiTime(markerDate(arg)),
    slotLabelContent: (arg) => formatSiTime(arg.date),
    eventTimeFormat: (arg) => formatSiTime(markerDate(arg)),
  };
}
