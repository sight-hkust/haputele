"use client";

import { useMemo } from "react";

import { AppointmentCalendar } from "@/components/healthworker/appointment-calendar";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { useI18n } from "@/lib/i18n";
import { useAppointmentList, useCurrentDoctor } from "@/lib/use-api";

const RANGE_DAYS = 60;

export default function DoctorCalendar() {
  const { t } = useI18n();
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
        label={t("pages.doctor.calendar.label")}
        title={t("pages.doctor.calendar.welcome")}
        highlight={doctor ? `Dr. ${doctor.familyName}.` : t("pages.doctor.calendar.fallbackHighlight")}
        subtitle={t("pages.doctor.calendar.subtitle")}
        pulseLabel
      />

      <Legend />

      {list.error ? (
        <ApiErrorBanner error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <AppointmentCalendar appointments={list.data ?? []} basePath="/doctor/appointments" />
      )}
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  // The calendar collapses the 7 backend statuses into 3 buckets (plus a
  // muted cancelled). Modals still surface the precise status.
  const items = [
    { key: "upcoming", label: t("pages.doctor.calendar.upcoming"), swatch: "bg-slate-200" },
    { key: "live", label: t("pages.doctor.calendar.live"), swatch: "bg-[var(--accent)]" },
    { key: "done", label: t("pages.doctor.calendar.done"), swatch: "bg-emerald-200" },
    {
      key: "cancelled",
      label: t("pages.doctor.calendar.cancelled"),
      swatch: "bg-slate-100 line-through text-slate-400",
    },
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
