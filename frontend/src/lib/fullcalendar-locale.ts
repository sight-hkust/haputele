import type { LocaleInput } from "@fullcalendar/core";

import { type Locale, translate } from "@/lib/i18n";

function buildSinhalaLocale(): LocaleInput {
  return {
    code: "si",
    buttonText: {
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
    dayNames: [
      "ඉරිදා",
      "සඳුදා",
      "අඟහරුවාදා",
      "බදාදා",
      "බ්‍රහස්පතින්දා",
      "සිකුරාදා",
      "සෙනසුරාදා",
    ],
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
export function getFullCalendarLocaleCode(appLocale: Locale): "si" | "en-gb" {
  return appLocale === "si" ? "si" : "en-gb";
}

/** Register custom locales (Sinhala) with FullCalendar. */
export function getFullCalendarLocales(appLocale: Locale): LocaleInput[] | undefined {
  return appLocale === "si" ? [buildSinhalaLocale()] : undefined;
}
