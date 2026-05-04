"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ConsultationFlow } from "@/components/doctor/consultation-flow";
import { PatientSummary } from "@/components/doctor/patient-summary";
import { DoctorCallPanel } from "@/components/meeting/doctor-call-panel";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { useAppointment, useConsultation } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";

export default function ConsultationPage() {
  const params = useParams<{ id: string }>();
  const cid = parseInt(params.id, 10);
  const consult = useConsultation(Number.isFinite(cid) ? cid : null);
  // Pull appointment via the consultation's appointmentId once we have it.
  const apt = useAppointment(consult.data?.appointmentId ?? null);

  if (consult.error) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ErrorBanner>{explainError(consult.error.error)}</ErrorBanner>
      </div>
    );
  }
  if (!consult.data || !apt.data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      </div>
    );
  }

  const readOnly = consult.data.status === "completed";

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-10 px-6 py-12">
      <Link
        href={`/doctor/appointments/${apt.data.appointment.id}`}
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to appointment
      </Link>

      <div
        className={
          readOnly
            ? "grid gap-8 lg:grid-cols-[1fr_0.4fr]"
            : "grid gap-8 lg:grid-cols-[1.2fr_1.2fr_0.4fr]"
        }
      >
        {!readOnly && (
          <aside className="lg:sticky lg:top-8 lg:order-1 lg:h-[calc(100vh-8rem)] lg:self-start">
            <DoctorCallPanel
              appointmentId={apt.data.appointment.id}
              status={apt.data.appointment.status}
            />
          </aside>
        )}
        <div className="flex flex-col gap-6 lg:order-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] align-middle" />
            {readOnly ? "Record · locked" : "Consultation · in progress"}
          </span>
          <ConsultationFlow
            consultation={consult.data}
            appointmentId={apt.data.appointment.id}
            readOnly={readOnly}
          />
        </div>
        <aside className="lg:sticky lg:top-24 lg:order-3 lg:self-start">
          {apt.data.patient && (
            <PatientSummary
              patient={apt.data.patient}
              preconsult={apt.data.preconsult}
              profile={apt.data.profile}
              attachments={apt.data.attachments ?? []}
              appointmentId={apt.data.appointment.id}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
