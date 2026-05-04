"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";

import { cn } from "@/lib/cn";

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

export const SLOT_MIN_HOUR = 7;   // visible day starts here (07:00 local)
export const SLOT_MAX_HOUR = 20;  // and ends here (20:00, exclusive bound is 19:30 cell)
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (SLOT_MAX_HOUR - SLOT_MIN_HOUR) * (60 / SLOT_MINUTES); // 30

export function slotLabel(slotIndex: number): string {
  const totalMinutes = SLOT_MIN_HOUR * 60 + slotIndex * SLOT_MINUTES;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function cellKey(dayIndex: number, slotIndex: number): CellKey {
  return `${dayIndex}-${slotIndex}`;
}

function parseCellKey(k: CellKey): { dayIndex: number; slotIndex: number } {
  const [d, s] = k.split("-").map(Number);
  return { dayIndex: d, slotIndex: s };
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
  const gridRef = useRef<HTMLDivElement>(null);

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
    (e.target as Element).releasePointerCapture?.(e.pointerId);
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
    <div
      ref={gridRef}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className="select-none rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3"
    >
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
              "px-1 pb-2 text-center font-mono text-[10px] uppercase tracking-[0.12em]",
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
            onPointerDownCell={onCellPointerDown}
            onPointerEnterCell={onCellPointerEnter}
          />
        ))}
      </div>
    </div>
  );
}

function FragmentRow({
  slotIndex,
  days,
  display,
  booked,
  readOnly,
  onPointerDownCell,
  onPointerEnterCell,
}: {
  slotIndex: number;
  days: { index: number; isPast: boolean; isToday: boolean }[];
  display: Set<CellKey>;
  booked: Set<CellKey> | undefined;
  readOnly: boolean;
  onPointerDownCell: (d: number, s: number, e: React.PointerEvent) => void;
  onPointerEnterCell: (d: number, s: number) => void;
}) {
  const onHourBoundary = slotIndex % 2 === 0;
  return (
    <>
      <div
        className={cn(
          "pr-2 text-right font-mono text-[10px] tabular-nums",
          onHourBoundary
            ? "text-[var(--muted-foreground)]"
            : "text-[var(--muted-foreground)]/40",
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
          <div
            key={d.index}
            onPointerDown={(e) => onPointerDownCell(d.index, slotIndex, e)}
            onPointerEnter={() => onPointerEnterCell(d.index, slotIndex)}
            className={cn(
              "relative border-t border-[var(--border)]/60",
              !onHourBoundary && "border-t-dashed",
              "transition-colors duration-75",
              !disabled && "cursor-pointer",
              active
                ? "bg-emerald-400/70 hover:bg-emerald-400/80"
                : d.isPast
                  ? "bg-[var(--muted)]/40"
                  : "bg-transparent hover:bg-emerald-100/50",
            )}
            style={{ height: 22 }}
            aria-label={`${slotLabel(slotIndex)} ${active ? "available" : "free"}${isBooked ? " · appointment" : ""}`}
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
          </div>
        );
      })}
    </>
  );
}
