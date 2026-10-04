"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";

import { cn } from "@/lib/cn";
import { Button } from "@/components/primitives/button";
import { Select } from "@/components/primitives/select";

// when2meet-style 30-min cell grid for one week. Drag to paint / erase.
// Pointer events unify mouse + touch. The rectangle between the drag-start
// cell and the cursor's current cell is filled (column-wise — dragging from
// Mon 9am to Wed 11am fills Mon 9–11, Tue 9–11, Wed 9–11).
//
// Granularity note: cells are 30 min for *declaration*, even though
// consultations are booked in 15-min slots. Doctors declare ranges (e.g.
// 9:00–12:00) — finer cells would just multiply clicks for the same range.
// Slots within those declared ranges are carved at 15-min granularity by
// FollowUpAppointmentPicker. Edge case: declaring an off-grid range like
// 09:15–09:45 isn't expressible here; use the "Or pick another time"
// fallback on the picker for those rare cases.

export type CellKey = string; // `${dayIndex}-${slotIndex}` — dayIndex 0=Mon

export const SLOT_MIN_HOUR = 7; // visible day starts here (07:00 local)
export const SLOT_MAX_HOUR = 20; // and ends here (20:00, exclusive bound is 19:30 cell)
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (SLOT_MAX_HOUR - SLOT_MIN_HOUR) * (60 / SLOT_MINUTES);

export function slotLabel(slotIndex: number): string {
  const totalMinutes = SLOT_MIN_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function cellKey(dayIndex: number, slotIndex: number): CellKey {
  return `${dayIndex}-${slotIndex}`;
}

type DragState = {
  mode: "paint" | "erase";
  startDay: number;
  startSlot: number;
} | null;

export function WeekGrid({
  weekStart, // Monday 00:00 local
  cells,
  bookedCells,
  readOnly = false,
  onChange,
}: {
  weekStart: Date;
  cells: Set<CellKey>;
  /** Visibility marker for cells that already have an appointment. Does not
      constrain painting — the doctor can still paint over a booked cell. */
  bookedCells?: Set<CellKey>;
  readOnly?: boolean;
  onChange: (next: Set<CellKey>) => void;
}) {
  const [drag, setDrag] = useState<DragState>(null);
  const [previewCells, setPreviewCells] = useState<Set<CellKey> | null>(null);
  const gridRef = useRef<HTMLFieldSetElement>(null);
  const [focusedCell, setFocusedCell] = useState<CellKey | null>(null);
  const instructionsId = useId();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i);
        return {
          index: i,
          date: d,
          isPast: d < today,
          isToday: d.getTime() === today.getTime(),
        };
      }),
    [weekStart, today],
  );
  const firstEditableDay = days.find((day) => !day.isPast)?.index;
  const focusKey =
    focusedCell && !days[Number(focusedCell.split("-")[0])]?.isPast
      ? focusedCell
      : firstEditableDay === undefined
        ? null
        : cellKey(firstEditableDay, 0);

  const toggleCell = (dayIndex: number, slotIndex: number) => {
    if (readOnly || days[dayIndex].isPast) return;
    const next = new Set(cells);
    const key = cellKey(dayIndex, slotIndex);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };
  const moveFocus = (dayIndex: number, slotIndex: number, event: React.KeyboardEvent) => {
    let day = dayIndex;
    let slot = slotIndex;
    switch (event.key) {
      case "ArrowLeft":
        day--;
        break;
      case "ArrowRight":
        day++;
        break;
      case "ArrowUp":
        slot--;
        break;
      case "ArrowDown":
        slot++;
        break;
      case "Home":
        slot = 0;
        break;
      case "End":
        slot = SLOTS_PER_DAY - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (day < 0 || day > 6 || slot < 0 || slot >= SLOTS_PER_DAY || days[day].isPast) return;
    const key = cellKey(day, slot);
    setFocusedCell(key);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell-key="${key}"]`)?.focus();
  };

  // Compute the rectangle of cells for the active drag.
  const dragRect = useCallback(
    (curDay: number, curSlot: number) => {
      if (!drag) return new Set<CellKey>();
      const dMin = Math.min(drag.startDay, curDay);
      const dMax = Math.max(drag.startDay, curDay);
      const sMin = Math.min(drag.startSlot, curSlot);
      const sMax = Math.max(drag.startSlot, curSlot);
      const out = new Set<CellKey>();
      for (let d = dMin; d <= dMax; d++) {
        // Skip past days during drag (read-only).
        if (days[d].isPast) continue;
        for (let s = sMin; s <= sMax; s++) out.add(cellKey(d, s));
      }
      return out;
    },
    [drag, days],
  );

  const onCellPointerDown = (dayIndex: number, slotIndex: number, e: React.PointerEvent) => {
    if (readOnly || days[dayIndex].isPast) return;
    e.preventDefault();
    setFocusedCell(cellKey(dayIndex, slotIndex));
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.focus();
    const target = e.currentTarget as Element;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    const mode = cells.has(cellKey(dayIndex, slotIndex)) ? "erase" : "paint";
    setDrag({ mode, startDay: dayIndex, startSlot: slotIndex });
    // Initialize preview with just the start cell.
    const init = new Set(cells);
    if (mode === "paint") init.add(cellKey(dayIndex, slotIndex));
    else init.delete(cellKey(dayIndex, slotIndex));
    setPreviewCells(init);
  };

  const onCellPointerEnter = (dayIndex: number, slotIndex: number) => {
    if (!drag) return;
    const rect = dragRect(dayIndex, slotIndex);
    const next = new Set(cells);
    rect.forEach((k) => {
      if (drag.mode === "paint") next.add(k);
      else next.delete(k);
    });
    setPreviewCells(next);
  };

  const onPointerUp = () => {
    if (drag && previewCells) onChange(previewCells);
    setDrag(null);
    setPreviewCells(null);
  };

  const display = previewCells ?? cells;

  return (
    <fieldset
      ref={gridRef}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className="select-none rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3"
      aria-label="Weekly availability"
      aria-describedby={instructionsId}
    >
      {!readOnly && (
        <AvailabilityInterval
          key={weekStart.toISOString()}
          days={days}
          cells={cells}
          onChange={onChange}
        />
      )}
      <p id={instructionsId} className="mb-3 text-sm text-[var(--muted-foreground)]">
        {readOnly
          ? "Availability is read-only."
          : "Drag to paint or erase. Keyboard: arrow keys move between dates and times; Enter or Space toggles a slot. Use the interval controls for touch editing. Save week to apply changes."}
      </p>
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: "auto repeat(7, minmax(0, 1fr))" }}
      >
        {/* Header row */}
        <div />
        {days.map((d) => (
          <div
            key={d.index}
            className={cn(
              "px-1 pb-2 text-center font-mono text-xs uppercase tracking-[0.12em]",
              d.isToday ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]",
              d.isPast && "opacity-40",
            )}
          >
            <div>{format(d.date, "EEE")}</div>
            <div className="text-base font-display tracking-[-0.01em] text-[var(--foreground)]">
              {format(d.date, "d")}
            </div>
          </div>
        ))}

        {/* Slot rows */}
        {Array.from({ length: SLOTS_PER_DAY }).map((_, slotIndex) => (
          <FragmentRow
            key={slotIndex}
            slotIndex={slotIndex}
            days={days}
            display={display}
            booked={bookedCells}
            readOnly={readOnly}
            focusKey={focusKey}
            onFocusCell={(key) => setFocusedCell(key)}
            onKeyDownCell={moveFocus}
            onToggleCell={toggleCell}
            onPointerDownCell={onCellPointerDown}
            onPointerEnterCell={onCellPointerEnter}
          />
        ))}
      </div>
    </fieldset>
  );
}

function FragmentRow({
  slotIndex,
  days,
  display,
  booked,
  readOnly,
  focusKey,
  onFocusCell,
  onKeyDownCell,
  onToggleCell,
  onPointerDownCell,
  onPointerEnterCell,
}: {
  slotIndex: number;
  days: { index: number; date: Date; isPast: boolean; isToday: boolean }[];
  display: Set<CellKey>;
  booked: Set<CellKey> | undefined;
  readOnly: boolean;
  focusKey: CellKey | null;
  onFocusCell: (key: CellKey) => void;
  onKeyDownCell: (d: number, s: number, e: React.KeyboardEvent) => void;
  onToggleCell: (d: number, s: number) => void;
  onPointerDownCell: (d: number, s: number, e: React.PointerEvent) => void;
  onPointerEnterCell: (d: number, s: number) => void;
}) {
  const onHourBoundary = slotIndex % 2 === 0;
  return (
    <>
      <div
        className={cn(
          "pr-2 text-right font-mono text-xs tabular-nums",
          onHourBoundary ? "text-[var(--muted-foreground)]" : "text-[var(--muted-foreground)]/40",
        )}
        style={{ height: 22 }}
      >
        {onHourBoundary ? slotLabel(slotIndex) : ""}
      </div>
      {days.map((d) => {
        const k = cellKey(d.index, slotIndex);
        const active = display.has(k);
        const isBooked = booked?.has(k) ?? false;
        const disabled = readOnly || d.isPast;
        return (
          <button
            key={d.index}
            type="button"
            data-cell-key={k}
            tabIndex={!disabled && k === focusKey ? 0 : -1}
            disabled={disabled}
            aria-pressed={active}
            onFocus={() => onFocusCell(k)}
            onKeyDown={(event) => onKeyDownCell(d.index, slotIndex, event)}
            onClick={(event) => {
              // Pointer painting commits on release; native keyboard activation
              // and assistive-technology clicks toggle exactly once.
              if (event.detail === 0) onToggleCell(d.index, slotIndex);
            }}
            onPointerDown={(e) => onPointerDownCell(d.index, slotIndex, e)}
            onPointerEnter={() => onPointerEnterCell(d.index, slotIndex)}
            className={cn(
              "relative block w-full border-t border-[var(--border)]/60 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed",
              !onHourBoundary && "border-t-dashed",
              "transition-colors duration-75 p-0 text-left",
              !disabled && "cursor-pointer",
              active
                ? "bg-emerald-400/70 hover:bg-emerald-400/80"
                : d.isPast
                  ? "bg-[var(--muted)]/40"
                  : "bg-transparent hover:bg-emerald-100/50",
            )}
            style={{ height: 22 }}
            aria-label={`${format(d.date, "EEEE d MMMM yyyy")}, ${slotLabel(slotIndex)} to ${slotLabel(slotIndex + 1)}, ${active ? "available" : "not available"}${isBooked ? ", booked appointment" : ""}${disabled ? ", read-only" : ""}`}
          >
            {isBooked && (
              <span
                aria-hidden
                title="You have an appointment in this slot"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, transparent 0, transparent 4px, rgba(15, 23, 42, 0.22) 4px, rgba(15, 23, 42, 0.22) 7px)",
                }}
              />
            )}
          </button>
        );
      })}
    </>
  );
}

function AvailabilityInterval({
  days,
  cells,
  onChange,
}: {
  days: { index: number; date: Date; isPast: boolean }[];
  cells: Set<CellKey>;
  onChange: (next: Set<CellKey>) => void;
}) {
  const firstDay = days.find((day) => !day.isPast)?.index ?? 0;
  const [day, setDay] = useState(firstDay);
  const [start, setStart] = useState(4);
  const [end, setEnd] = useState(10);
  const id = useId();
  const disabled = days[day].isPast || end <= start;
  const apply = (available: boolean) => {
    if (disabled) return;
    const next = new Set(cells);
    for (let slot = start; slot < end; slot++) {
      if (available) next.add(cellKey(day, slot));
      else next.delete(cellKey(day, slot));
    }
    onChange(next);
  };
  return (
    <fieldset className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <legend className="px-1 text-sm font-semibold">Edit a time interval</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <label htmlFor={`${id}-day`} className="flex flex-col gap-1 text-sm">
          Day
          <Select
            id={`${id}-day`}
            value={day}
            onChange={(event) => setDay(Number(event.target.value))}
            className="min-h-11"
          >
            {days.map((date) => (
              <option key={date.index} value={date.index} disabled={date.isPast}>
                {format(date.date, "EEE d MMM")}
                {date.isPast ? " (past)" : ""}
              </option>
            ))}
          </Select>
        </label>
        <label htmlFor={`${id}-start`} className="flex flex-col gap-1 text-sm">
          Start time
          <Select
            id={`${id}-start`}
            value={start}
            onChange={(event) => {
              const next = Number(event.target.value);
              setStart(next);
              if (end <= next) setEnd(next + 1);
            }}
            className="min-h-11"
          >
            {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
              <option key={slot} value={slot}>
                {slotLabel(slot)}
              </option>
            ))}
          </Select>
        </label>
        <label htmlFor={`${id}-end`} className="flex flex-col gap-1 text-sm">
          End time
          <Select
            id={`${id}-end`}
            value={end}
            onChange={(event) => setEnd(Number(event.target.value))}
            className="min-h-11"
          >
            {Array.from({ length: SLOTS_PER_DAY }, (_, index) => index + 1).map((slot) => (
              <option key={slot} value={slot} disabled={slot <= start}>
                {slotLabel(slot)}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={disabled}
          onClick={() => apply(true)}
        >
          Mark interval available
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={disabled}
          onClick={() => apply(false)}
        >
          Remove interval
        </Button>
      </div>
    </fieldset>
  );
}
