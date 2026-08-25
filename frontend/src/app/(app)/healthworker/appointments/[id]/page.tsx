"use client";

import { useParams } from "next/navigation";

import { AppointmentCockpit, CockpitHeader } from "@/components/healthworker/cockpit";
import { BackLink } from "@/components/primitives/back-link";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { useAppointment, useDoctorList } from "@/lib/use-api";
import { doctorName } from "@/lib/format";
import { parseIdParam, throwNotFoundIf404 } from "@/lib/not-found";

export default function AppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseIdParam(params.id);

  const apt = useAppointment(id);
  const doctors = useDoctorList();

  const doctor = doctors.data?.find((d) => d.id === apt.data?.appointment.doctorId);

  if (apt.error) {
    throwNotFoundIf404(apt.error);
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ApiErrorBanner error={apt.error} onRetry={() => apt.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <BackLink href="/healthworker/appointments">Back to calendar</BackLink>

      <PageHeader
        label="Cockpit"
        title="Appointment"
        highlight="control."
        subtitle="Each step unlocks as the appointment moves through its lifecycle. Server-enforced state machine — only valid transitions are surfaced."
      />

      {apt.isLoading || !apt.data ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      ) : (
        <>
          <CockpitHeader
            data={apt.data}
            doctorName={doctor ? doctorName(doctor) : `Doctor #${apt.data.appointment.doctorId}`}
          />
          <AppointmentCockpit data={apt.data} />
        </>
      )}
    </div>
  );
}
