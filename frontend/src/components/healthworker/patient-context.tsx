"use client";

import { useMemo } from "react";
import { CalendarPlus, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/primitives/button";
import { useAppointmentList, useQueueList } from "@/lib/use-api";
import { fmtDateTime, fmtTargetWeek } from "@/lib/format";
import type { QueueEntry } from "@/types/api";

// Beneath the patient picker on the booking form: surface what's already
// in motion for this patient — upcoming/active appointments and pending
// queue entries. Lets the HW spot duplicates and bridge to "book from queue"
// without losing sight of the calendar.
//
// The "Book this" button on a queue entry calls `onBookQueueEntry` so the
// host (the workspace) can switch its side panel to the queue book sub-state
// instead of opening a modal that would cover the calendar.
export function PatientContext({
  patientId,
  onBookQueueEntry,
}: {
  patientId: number;
  onBookQueueEntry: (entry: QueueEntry) => void;
}) {
  const apptQ = useAppointmentList({ patientId });
  const queueQ = useQueueList({ patientId, status: "pending" });

  const upcoming = useMemo(() => {
    const now = Date.now();
    return (apptQ.data ?? [])
      .filter(
        (a) =>
          a.status !== "completed" &&
          a.status !== "cancelled" &&
          new Date(a.scheduledAt).getTime() >= now,
      )
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [apptQ.data]);

  const pending = queueQ.data ?? [];

  if (apptQ.isLoading || queueQ.isLoading) return null;
  if (upcoming.length === 0 && pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-amber-800">
        This patient already has
      </p>

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-amber-900">
            {upcoming.length} upcoming appointment{upcoming.length === 1 ? "" : "s"}
          </p>
          <ul className="flex flex-col gap-1">
            {upcoming.map((a) => (
              <li key={a.id} className="text-xs text-amber-900/90">
                <Link
                  href={`/healthworker/appointments/${a.id}`}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  <Clock className="h-3 w-3" />
                  {fmtDateTime(a.scheduledAt)} · {a.doctorName}
                  <span className="font-mono uppercase tracking-[0.1em] text-[10px] text-amber-700">
                    ({a.status.replace(/_/g, " ")})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-amber-900">
            {pending.length} pending queue entr{pending.length === 1 ? "y" : "ies"}
          </p>
          <ul className="flex flex-col gap-1.5">
            {pending.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white/60 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium capitalize">{e.source.replace("_", "-")}</span>
                    {e.priority === "urgent" && (
                      <span className="font-mono text-[10px] uppercase text-rose-600">urgent</span>
                    )}
                    {e.targetDate && (
                      <span className="text-amber-800/80">{fmtTargetWeek(e.targetDate).toLowerCase()}</span>
                    )}
                  </div>
                  {e.notes && <span className="line-clamp-2 text-[11px] text-amber-900/70">{e.notes}</span>}
                </div>
                <Button size="sm" onClick={() => onBookQueueEntry(e)}>
                  <CalendarPlus className="h-3 w-3" />
                  Book this
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
