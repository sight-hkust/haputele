"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppointmentCockpit, CockpitHeader } from "@/components/healthworker/cockpit";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { useAppointment, useDoctorList } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { doctorName } from "@/lib/format";

export default function AppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);

  const apt = useAppointment(Number.isFinite(id) ? id : null);
  const doctors = useDoctorList();

  const doctor = doctors.data?.find((d) => d.id === apt.data?.appointment.doctorId);

  if (apt.error) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ErrorBanner>{explainError(apt.error.error)}</ErrorBanner>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <Link
        href="/healthworker/appointments"
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to calendar
      </Link>

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
