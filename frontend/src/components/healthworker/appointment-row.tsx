"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { StatusBadge } from "@/components/primitives/status-badge";
import { fmtDate, fmtTime } from "@/lib/format";
import type { AppointmentStatus, CalendarAppointment } from "@/types/api";

const HEALTHWORKER_ACTION: Record<AppointmentStatus, string> = {
  scheduled: "Capture consent",
  consent_pending: "Record vitals",
  data_collection: "Start meeting",
  in_progress: "Return to meeting",
  awaiting_notes: "Check doctor notes",
  completed: "Open prescription & handoff",
  cancelled: "View cancellation",
};
const DOCTOR_ACTION: Record<AppointmentStatus, string> = {
  scheduled: "Check preparation",
  consent_pending: "Check preparation",
  data_collection: "Review ready patient",
  in_progress: "Open encounter",
  awaiting_notes: "Finish consultation notes",
  completed: "Review signed consultation",
  cancelled: "View cancellation",
};

export function AppointmentRow({
  appointment,
  basePath = "/healthworker/appointments",
  viewerRole: role = "healthworker",
}: {
  appointment: CalendarAppointment;
  basePath?: string;
  viewerRole?: "doctor" | "healthworker";
}) {
  const { id, scheduledAt, status, patientName, doctorName } = appointment;
  const action = (role === "doctor" ? DOCTOR_ACTION : HEALTHWORKER_ACTION)[status];

  return (
    <li className="min-w-0">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Link
          href={`${basePath}/${id}`}
          aria-label={`${action}: ${patientName}, appointment #${id}`}
          className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold tabular-nums">{fmtTime(scheduledAt)}</span>
            <span className="text-sm text-[var(--muted-foreground)]">
              {fmtDate(scheduledAt, "EEE d MMM yyyy")}
            </span>
          </div>
          <div className="break-words text-base font-semibold">{patientName}</div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Patient #{appointment.patientId} · Appointment #{id}
            {role === "healthworker" ? ` · ${doctorName}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]">
              {action}
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </span>
          </div>
        </Link>
      </Card>
    </li>
  );
}
