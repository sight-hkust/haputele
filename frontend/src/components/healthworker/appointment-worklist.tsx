"use client";

import { useMemo, useState } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";

import { AppointmentRow } from "@/components/healthworker/appointment-row";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import type { ApiError } from "@/lib/api";
import { appToday, fmtDate, fmtTime } from "@/lib/format";
import type { CalendarAppointment } from "@/types/api";

type WorklistView = "today" | "unfinished" | "all";

export function AppointmentWorklist({
  appointments,
  loading,
  fetching,
  error,
  updatedAt,
  onRefresh,
  viewerRole: role,
}: {
  appointments: CalendarAppointment[] | undefined;
  loading: boolean;
  fetching: boolean;
  error: ApiError | null | undefined;
  updatedAt: number;
  onRefresh: () => void;
  viewerRole: "doctor" | "healthworker";
}) {
  const [view, setView] = useState<WorklistView>("today");
  const today = appToday();
  const groups = useMemo(() => {
    const unfinished = (appointments ?? []).filter(
      (a) => a.status !== "completed" && a.status !== "cancelled",
    );
    const rank = (a: CalendarAppointment) => {
      if (role !== "doctor") return 0;
      if (a.status === "awaiting_notes") return 0;
      if (a.status === "in_progress") return 1;
      if (a.status === "data_collection") return 2;
      return 3;
    };
    const sort = (a: CalendarAppointment, b: CalendarAppointment) =>
      rank(a) - rank(b) || a.scheduledAt.localeCompare(b.scheduledAt);
    const daily = (appointments ?? []).filter(
      (a) => fmtDate(a.scheduledAt, "yyyy-MM-dd") === today,
    );
    const overdue = unfinished.filter((a) => fmtDate(a.scheduledAt, "yyyy-MM-dd") < today);
    return {
      daily: daily.sort(sort),
      overdue: overdue.sort(sort),
      unfinished: unfinished.sort(sort),
      all: [...(appointments ?? [])].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    };
  }, [appointments, role, today]);
  const rows =
    view === "today" ? groups.daily : view === "unfinished" ? groups.unfinished : groups.all;
  const hasData = appointments !== undefined;
  const reliable = hasData && !error;

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Patient worklist</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]" role="status">
            {error
              ? hasData
                ? "Refresh failed · showing last loaded appointments"
                : "Appointments unavailable"
              : loading
                ? "Loading appointments…"
                : fetching
                  ? "Refreshing appointments…"
                  : updatedAt
                    ? `Updated ${fmtTime(new Date(updatedAt).toISOString())}`
                    : "Not yet loaded"}
          </p>
        </div>
        <Button variant="secondary" onClick={onRefresh} disabled={fetching}>
          <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      </div>
      <fieldset className="flex flex-wrap gap-2" aria-label="Appointment worklist views">
        {(
          [
            ["today", "Today", groups.daily.length],
            ["unfinished", "Unfinished", groups.unfinished.length],
            ["all", "All appointments", groups.all.length],
          ] as const
        ).map(([key, label, count]) => (
          <Button
            key={key}
            variant={view === key ? "primary" : "secondary"}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
            {reliable ? ` (${count})` : ""}
          </Button>
        ))}
      </fieldset>
      <ApiErrorBanner error={error} onRetry={onRefresh} />
      {loading && !hasData ? (
        <p className="py-4 text-sm text-[var(--muted-foreground)]">Loading patient worklist…</p>
      ) : hasData ? (
        <>
          {rows.length > 0 ? (
            <section
              className="flex flex-col gap-3"
              aria-label={view === "today" ? "Today's appointments" : "Appointments"}
            >
              {view === "today" && (
                <h3 className="text-sm font-semibold">
                  Today · {fmtDate(`${today}T12:00:00`, "EEE d MMM")}
                </h3>
              )}
              <Rows appointments={rows} role={role} />
            </section>
          ) : !error ? (
            <EmptyState
              Icon={CalendarClock}
              title={
                view === "today"
                  ? "No appointments today"
                  : view === "unfinished"
                    ? "No unfinished encounters"
                    : "No appointments"
              }
              description={
                view === "today"
                  ? "Check unfinished encounters or open the planning calendar for another day."
                  : "Appointments will appear here when booked."
              }
              className="py-6"
            />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No rows in this last-loaded view. Refresh to confirm.
            </p>
          )}
          {view === "today" && groups.overdue.length > 0 && (
            <section className="flex flex-col gap-3" aria-label="Overdue unfinished appointments">
              <h3 className="text-sm font-semibold text-amber-800">
                Overdue unfinished encounters · {groups.overdue.length}
                {error ? " last loaded" : ""}
              </h3>
              <Rows appointments={groups.overdue} role={role} />
            </section>
          )}
        </>
      ) : null}
    </Card>
  );
}

function Rows({
  appointments,
  role,
}: {
  appointments: CalendarAppointment[];
  role: "doctor" | "healthworker";
}) {
  return (
    <ul className="flex flex-col gap-2">
      {appointments.map((appointment) => (
        <AppointmentRow
          key={appointment.id}
          appointment={appointment}
          viewerRole={role}
          basePath={role === "doctor" ? "/doctor/appointments" : "/healthworker/appointments"}
        />
      ))}
    </ul>
  );
}
