"use client";

import {
  addDays,
  addMonths,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { Button } from "@/components/primitives/button";
import { formatWeekRange, parseCalendarDate } from "@/lib/calendar-date";
import { cn } from "@/lib/cn";

type DatePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  mode?: "date" | "week";
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabel?: string;
  trigger?: "field" | "icon";
  align?: "start" | "end";
  className?: string;
};

const WEEK_STARTS_ON = 1 as const;
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function DatePicker({
  id,
  value,
  onChange,
  mode = "date",
  min,
  max,
  placeholder = "Choose a date",
  ariaLabel = "Choose date",
  trigger = "field",
  align = "start",
  className,
}: DatePickerProps) {
  const generatedId = useId();
  const calendarId = `${id ?? generatedId}-calendar`;
  const selected = parseCalendarDate(value);
  const minDate = parseCalendarDate(min);
  const maxDate = parseCalendarDate(max);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selected ?? today));
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setVisibleMonth(startOfMonth(selected ?? today));
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>("[data-focus-date]")?.focus();
    });
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: WEEK_STARTS_ON });
    return Array.from({ length: 42 }, (_, index) => addDays(first, index));
  }, [visibleMonth]);

  const firstYear = minDate?.getFullYear() ?? today.getFullYear() - 120;
  const lastYear = maxDate?.getFullYear() ?? today.getFullYear() + 12;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const selectedWeekStart = selected
    ? startOfWeek(selected, { weekStartsOn: WEEK_STARTS_ON })
    : null;
  const selectedWeekEnd = selected
    ? endOfWeek(selected, { weekStartsOn: WEEK_STARTS_ON })
    : null;
  const focusDay = selected && days.some((day) => isSameDay(day, selected))
    ? selected
    : days.some((day) => isSameDay(day, today))
      ? today
      : startOfMonth(visibleMonth);
  const displayValue = selected
    ? mode === "week"
      ? formatWeekRange(value)
      : format(selected, "d MMM yyyy")
    : placeholder;

  const choose = (date: Date) => {
    onChange(format(date, "yyyy-MM-dd"));
    if (mode === "date") setOpen(false);
  };

  const focusDate = (date: Date) => {
    if ((minDate && isBefore(date, minDate)) || (maxDate && isAfter(date, maxDate))) return;
    setVisibleMonth(startOfMonth(date));
    requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${format(date, "yyyy-MM-dd")}"]`)
        ?.focus();
    });
  };

  const moveWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, day: Date) => {
    const target =
      event.key === "ArrowLeft" ? addDays(day, -1)
      : event.key === "ArrowRight" ? addDays(day, 1)
      : event.key === "ArrowUp" ? addDays(day, -7)
      : event.key === "ArrowDown" ? addDays(day, 7)
      : event.key === "Home" ? startOfWeek(day, { weekStartsOn: WEEK_STARTS_ON })
      : event.key === "End" ? endOfWeek(day, { weekStartsOn: WEEK_STARTS_ON })
      : event.key === "PageUp" ? addMonths(day, -1)
      : event.key === "PageDown" ? addMonths(day, 1)
      : null;
    if (!target) return;
    event.preventDefault();
    focusDate(target);
  };

  return (
    <div ref={rootRef} className={cn("relative", trigger === "field" && "w-full", className)}>
      {trigger === "icon" ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-12 w-12 shrink-0"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={calendarId}
          onClick={() => setOpen((current) => !current)}
        >
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </Button>
      ) : (
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={calendarId}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "flex h-12 w-full items-center justify-between rounded-xl border border-[var(--border)] bg-transparent px-4 text-left text-sm transition-all duration-200",
            "focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
            selected ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]/60",
          )}
        >
          <span>{displayValue}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          id={calendarId}
          role="dialog"
          aria-label={mode === "week" ? "Choose target week" : ariaLabel}
          className={cn(
            "absolute top-full z-50 mt-2 w-[20rem] max-w-[calc(100vw-3rem)] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl",
            trigger === "icon" || align === "end" ? "right-0" : "left-0",
          )}
        >
          <div className="mb-3 flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <select
              aria-label="Month"
              value={visibleMonth.getMonth()}
              onChange={(event) =>
                setVisibleMonth(new Date(visibleMonth.getFullYear(), Number(event.target.value), 1))
              }
              className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold focus-visible:border-[var(--accent)] focus-visible:outline-none"
            >
              {Array.from({ length: 12 }, (_, month) => (
                <option key={month} value={month}>
                  {format(new Date(2024, month, 1), "MMMM")}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={visibleMonth.getFullYear()}
              onChange={(event) =>
                setVisibleMonth(new Date(Number(event.target.value), visibleMonth.getMonth(), 1))
              }
              className="h-9 rounded-lg border border-transparent bg-transparent px-2 font-mono text-sm tabular-nums focus-visible:border-[var(--accent)] focus-visible:outline-none"
            >
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div role="grid" aria-label={format(visibleMonth, "MMMM yyyy")}>
            <div role="row" className="mb-1 grid grid-cols-7">
              {WEEKDAYS.map((day) => (
                <span
                  key={day}
                  role="columnheader"
                  aria-label={day}
                  className="py-1 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
                >
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {days.map((day) => {
                const disabled = Boolean(
                  (minDate && isBefore(day, minDate)) || (maxDate && isAfter(day, maxDate)),
                );
                const isSelected = Boolean(selected && isSameDay(day, selected));
                const inSelectedWeek = Boolean(
                  mode === "week" &&
                    selectedWeekStart &&
                    selectedWeekEnd &&
                    !isBefore(day, selectedWeekStart) &&
                    !isAfter(day, selectedWeekEnd),
                );
                const weekStart = inSelectedWeek && day.getDay() === 1;
                const weekEnd = inSelectedWeek && day.getDay() === 0;
                const isToday = isSameDay(day, today);
                const outsideMonth = !isSameMonth(day, visibleMonth);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    role="gridcell"
                    aria-label={format(day, "EEEE, d MMMM yyyy")}
                    aria-selected={isSelected || inSelectedWeek}
                    disabled={disabled}
                    tabIndex={isSameDay(day, focusDay) ? 0 : -1}
                    data-date={format(day, "yyyy-MM-dd")}
                    data-focus-date={isSameDay(day, focusDay) ? "" : undefined}
                    onClick={() => choose(day)}
                    onKeyDown={(event) => moveWithKeyboard(event, day)}
                    className={cn(
                      "relative flex h-9 items-center justify-center text-sm tabular-nums transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      outsideMonth && "text-slate-400",
                      !disabled && !inSelectedWeek && "rounded-lg hover:bg-[var(--muted)]",
                      disabled && "cursor-not-allowed text-slate-200",
                      inSelectedWeek && "bg-[var(--accent)]/10 text-[var(--accent)]",
                      weekStart && "rounded-l-lg",
                      weekEnd && "rounded-r-lg",
                      mode === "date" && isSelected && "rounded-lg bg-[var(--accent)] text-white",
                      mode === "week" && isSelected && "z-10 rounded-lg ring-2 ring-inset ring-[var(--accent)]",
                      isToday && !isSelected && "font-semibold underline decoration-[var(--accent)] decoration-2 underline-offset-4",
                    )}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <div className="mt-3 flex items-center justify-end gap-1 border-t border-[var(--border)] pt-3">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
              {mode === "week" && (
                <Button type="button" size="sm" onClick={() => setOpen(false)}>
                  Done
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
