"use client";

import { useParams } from "next/navigation";

import { ConsultationFlow } from "@/components/doctor/consultation-flow";
import { PatientSummary } from "@/components/doctor/patient-summary";
import { DoctorCallPanel } from "@/components/meeting/doctor-call-panel";
import { Eyebrow } from "@/components/primitives/eyebrow";
import { BackLink } from "@/components/primitives/back-link";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { useAppointment, useConsultation } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { parseIdParam, throwNotFoundIf404 } from "@/lib/not-found";

export default function ConsultationPage() {
  const params = useParams<{ id: string }>();
  const cid = parseIdParam(params.id);
  const consult = useConsultation(cid);
  // Pull appointment via the consultation's appointmentId once we have it.
  const apt = useAppointment(consult.data?.appointmentId ?? null);

  // Hard-fail only when there's nothing to show. The consultation query
  // refetches on every window focus (staleTime 0), so a transient refetch
  // error with cached data present must NOT unmount the flow — that would
  // wipe the doctor's stage, signature, and follow-up choice mid-consult.
  if (consult.error && !consult.data) {
    throwNotFoundIf404(consult.error);
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ErrorBanner>{explainError(consult.error.error)}</ErrorBanner>
      </div>
    );
  }
  // Same hard-fail for the linked appointment — without this branch an
  // appointment fetch error left the page on the loading card forever.
  if (apt.error && !apt.data) {
    throwNotFoundIf404(apt.error);
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ErrorBanner>{explainError(apt.error.error)}</ErrorBanner>
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
      <BackLink href={`/doctor/appointments/${apt.data.appointment.id}`}>Back to appointment</BackLink>

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
          <Eyebrow>
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] align-middle" />
            {readOnly ? "Record · locked" : "Consultation · in progress"}
          </Eyebrow>
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
