import { formatDistanceToNow, parseISO } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import type { Locale } from "date-fns";

import { getActiveLocale } from "@/lib/i18n";

const INTL_LOCALE = { en: "en-GB", si: "si-LK" } as const;

export function intlLocaleTag(): string {
  return INTL_LOCALE[getActiveLocale()];
}

/** date-fns locale — English only; Sinhala uses Intl helpers below. */
export function dateFnsLocale(): Locale {
  return enUS;
}

export function formatWithIntl(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocaleTag(), options).format(date);
}

export function formatRelativeLocalized(iso: string): string {
  try {
    const date = parseISO(iso);
    if (getActiveLocale() === "si") {
      const rtf = new Intl.RelativeTimeFormat("si-LK", { numeric: "auto" });
      const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
      const abs = Math.abs(diffSec);
      if (abs < 60) return rtf.format(Math.round(diffSec), "second");
      if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
      if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), "day");
      if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), "month");
      return rtf.format(Math.round(diffSec / 31536000), "year");
    }
    return formatDistanceToNow(date, { addSuffix: true, locale: enUS });
  } catch {
    return iso;
  }
}
