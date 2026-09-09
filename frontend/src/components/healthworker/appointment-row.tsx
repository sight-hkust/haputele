"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { StatusBadge } from "@/components/primitives/status-badge";
import { fmtDate, fmtTime } from "@/lib/format";
import type { CalendarAppointment } from "@/types/api";

// One booked appointment in the workspace side rail. The row body selects —
// it moves the calendar and rings this appointment there — while the chevron
// opens the appointment itself. Two targets so each click means one thing;
// clicking the ringed block on the calendar opens it too.
export function AppointmentRow({
  appointment,
  selected,
  onSelect,
  basePath = "/healthworker/appointments",
}: {
  appointment: CalendarAppointment;
  selected: boolean;
  onSelect: () => void;
  basePath?: string;
}) {
  const { id, scheduledAt, status, patientName, doctorName } = appointment;

  return (
    <li>
      <Card
        className={`flex items-center gap-2 p-3 transition-shadow ${
          selected ? "ring-2 ring-[var(--accent)] ring-offset-1" : ""
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              {fmtDate(scheduledAt, "EEE d MMM")}
            </span>
            <span className="text-sm font-semibold tracking-[-0.01em]">{fmtTime(scheduledAt)}</span>
          </div>
          <div className="truncate text-sm">
            {patientName}
            <span className="text-[var(--muted-foreground)]"> · {doctorName}</span>
          </div>
          <StatusBadge status={status} />
        </button>

        <Link
          href={`${basePath}/${id}`}
          aria-label={`Open ${patientName}'s appointment`}
          className="shrink-0 rounded-lg p-2 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Card>
    </li>
  );
}
