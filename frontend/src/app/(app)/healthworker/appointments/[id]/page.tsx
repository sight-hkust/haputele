"use client";

import { useParams } from "next/navigation";

import { AppointmentCockpit, CockpitHeader } from "@/components/healthworker/cockpit";
import { BackLink } from "@/components/primitives/back-link";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { useAppointment, useDoctorList } from "@/lib/use-api";
import { doctorName, fmtTime } from "@/lib/format";
import { parseIdParam, throwNotFoundIf404 } from "@/lib/not-found";

export default function AppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseIdParam(params.id);

  const apt = useAppointment(id);
  const doctors = useDoctorList();

  const doctor = doctors.data?.find((d) => d.id === apt.data?.appointment.doctorId);

  if (apt.error && !apt.data) {
    throwNotFoundIf404(apt.error);
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ApiErrorBanner error={apt.error} onRetry={() => apt.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
      <BackLink href="/healthworker/appointments">Back to appointments</BackLink>

      {!apt.data ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      ) : (
        <>
          <CockpitHeader
            data={apt.data}
            doctorName={doctor ? doctorName(doctor) : `Doctor #${apt.data.appointment.doctorId}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted-foreground)]">
            <span>Updated {fmtTime(new Date(apt.dataUpdatedAt).toISOString())}</span>
            <Button variant="ghost" onClick={() => apt.refetch()} disabled={apt.isFetching}>
              {apt.isFetching ? "Refreshing…" : "Refresh status"}
            </Button>
          </div>
          {apt.error && <ApiErrorBanner error={apt.error} onRetry={() => apt.refetch()} />}
          <AppointmentCockpit data={apt.data} />
        </>
      )}
    </div>
  );
}
