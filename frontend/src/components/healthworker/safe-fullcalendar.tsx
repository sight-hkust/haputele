"use client";

import { Calendar, type CalendarOptions } from "@fullcalendar/core";
import { useEffect, useRef } from "react";

/** FullCalendar treats explicit `undefined` as an override and skips defaults. */
function sanitizeCalendarOptions(props: CalendarOptions): CalendarOptions {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out as CalendarOptions;
}

/** resetOptions updates most props but not date formatting locale — recreate on change. */
function localeIdentity(props: CalendarOptions): string {
  const locales = props.locales;
  const localeCodes = Array.isArray(locales)
    ? locales
        .map((entry) =>
          typeof entry === "object" && entry && "code" in entry
            ? String(entry.code)
            : String(entry),
        )
        .join(",")
    : "";
  return `${props.locale ?? ""}|${localeCodes}`;
}

/**
 * Drop-in replacement for @fullcalendar/react. The official React adapter calls
 * calendar.destroy() in componentWillUnmount even when componentDidMount never
 * ran (React Strict Mode, fast navigation). This hooks-based wrapper only
 * destroys an instance it successfully created in the same effect.
 */
export function SafeFullCalendar(props: CalendarOptions) {
  const elRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<Calendar | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const localeKey = localeIdentity(props);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const cal = new Calendar(el, sanitizeCalendarOptions(propsRef.current));
    cal.render();
    calRef.current = cal;

    return () => {
      cal.destroy();
      calRef.current = null;
    };
  }, [localeKey]);

  useEffect(() => {
    if (!calRef.current) return;
    calRef.current.resetOptions(sanitizeCalendarOptions(propsRef.current), [
      "locale",
      "locales",
      "titleFormat",
      "dayHeaderFormat",
      "dayHeaderContent",
      "slotLabelFormat",
      "slotLabelContent",
      "eventTimeFormat",
      "buttonText",
      "events",
    ]);
  });

  const height =
    typeof props.height === "string" || typeof props.height === "number"
      ? props.height
      : undefined;

  return <div ref={elRef} style={height ? { height } : undefined} />;
}
