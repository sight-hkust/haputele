"use client";

import { useState } from "react";

import { AppointmentCalendar } from "@/components/healthworker/appointment-calendar";
import { AppointmentWorklist } from "@/components/healthworker/appointment-worklist";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { useAppointmentList } from "@/lib/use-api";

export default function DoctorWorklistPage() {
  const [view, setView] = useState<"worklist" | "calendar">("worklist");
  // No date cutoff: an unfinished encounter must remain reachable even after
  // it falls outside the planning calendar's current week.
  const list = useAppointmentList({});

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Ready patients, active encounters and unfinished notes.
          </p>
        </div>
        <fieldset className="flex flex-wrap gap-2" aria-label="Appointment workspace views">
          <Button
            variant={view === "worklist" ? "primary" : "secondary"}
            aria-pressed={view === "worklist"}
            onClick={() => setView("worklist")}
          >
            Worklist
          </Button>
          <Button
            variant={view === "calendar" ? "primary" : "secondary"}
            aria-pressed={view === "calendar"}
            onClick={() => setView("calendar")}
          >
            Planning calendar
          </Button>
        </fieldset>
      </header>
      <div hidden={view !== "worklist"}>
        <AppointmentWorklist
          appointments={list.data}
          loading={list.isLoading}
          fetching={list.isFetching}
          error={list.error}
          updatedAt={list.dataUpdatedAt}
          onRefresh={() => list.refetch()}
          viewerRole="doctor"
        />
      </div>
      {view === "calendar" && (
        <section className="flex min-w-0 flex-col gap-3" aria-label="Planning calendar">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Plan by day, week, month or agenda.
              {list.error && list.data ? " Showing last loaded appointments." : ""}
            </p>
            <Button variant="secondary" disabled={list.isFetching} onClick={() => list.refetch()}>
              {list.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          <ApiErrorBanner error={list.error} onRetry={() => list.refetch()} />
          {list.isLoading && !list.data ? (
            <Card className="p-4 text-sm text-[var(--muted-foreground)]">
              Loading appointments…
            </Card>
          ) : list.data ? (
            <AppointmentCalendar appointments={list.data} basePath="/doctor/appointments" />
          ) : null}
        </section>
      )}
    </div>
  );
}
