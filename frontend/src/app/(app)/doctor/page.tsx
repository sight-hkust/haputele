"use client";

import { useMemo } from "react";

import { AppointmentCalendar } from "@/components/healthworker/appointment-calendar";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { useAppointmentList, useCurrentDoctor } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";

const RANGE_DAYS = 60;

export default function DoctorCalendar() {
  const { doctor } = useCurrentDoctor();
  // Memoize so the query key is stable across renders — otherwise `new Date()`
  // produces a fresh ISO string each pass and react-query never settles.
  const { from, to } = useMemo(() => {
    const now = Date.now();
    return {
      from: new Date(now - RANGE_DAYS * 86_400_000).toISOString(),
      to: new Date(now + RANGE_DAYS * 86_400_000).toISOString(),
    };
  }, []);
  // Server scopes to JWT subject when role=doctor — no doctorId param needed.
  const list = useAppointmentList({ from, to });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label="Today"
        title={`Welcome,`}
        highlight={doctor ? `Dr. ${doctor.familyName}.` : "Doctor."}
        subtitle="Your appointments only — the server filters everyone else's away. Click any event to open the patient and start the consultation."
        pulseLabel
      />

      <Legend />

      {list.error ? (
        <ErrorBanner>{explainError(list.error.error)}</ErrorBanner>
      ) : list.isLoading ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      ) : (
        <AppointmentCalendar appointments={list.data ?? []} basePath="/doctor/appointments" />
      )}
    </div>
  );
}

function Legend() {
  // The calendar collapses the 7 backend statuses into 3 buckets (plus a
  // muted cancelled). Modals still surface the precise status.
  const items = [
    { key: "upcoming", label: "Upcoming", swatch: "bg-slate-200" },
    { key: "live", label: "Live", swatch: "bg-[var(--accent)]" },
    { key: "done", label: "Done", swatch: "bg-emerald-200" },
    { key: "cancelled", label: "Cancelled", swatch: "bg-slate-100 line-through text-slate-400" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--muted-foreground)]">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-2">
          <span className={`h-2 w-3 rounded-sm ${it.swatch}`} />
          <span className="font-mono uppercase tracking-[0.12em]">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
