"use client";

import { useParams } from "next/navigation";

import { ConsultationFlow } from "@/components/doctor/consultation-flow";
import { PatientSummary } from "@/components/doctor/patient-summary";
import { VisitHistoryPanel } from "@/components/doctor/visit-history";
import { PatientSafetyStrip } from "@/components/clinical/patient-safety-strip";
import { DoctorCallPanel } from "@/components/meeting/doctor-call-panel";
import { BackLink } from "@/components/primitives/back-link";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { useAppointment, useConsultation } from "@/lib/use-api";
import { fmtTime } from "@/lib/format";
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
        <ApiErrorBanner error={consult.error} onRetry={() => consult.refetch()} />
      </div>
    );
  }
  // Same hard-fail for the linked appointment — without this branch an
  // appointment fetch error left the page on the loading card forever.
  if (apt.error && !apt.data) {
    throwNotFoundIf404(apt.error);
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ApiErrorBanner error={apt.error} onRetry={() => apt.refetch()} />
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
    <div className="mx-auto flex max-w-[96rem] flex-col gap-4 px-4 py-6 sm:px-6">
      <BackLink href={`/doctor/appointments/${apt.data.appointment.id}`}>
        Back to appointment
      </BackLink>

      <div className="sticky top-16 z-20">
        <PatientSafetyStrip patient={apt.data.patient} profile={apt.data.profile} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted-foreground)]">
        <span>
          {readOnly
            ? "Signed consultation record"
            : "Your task: document, prescribe, review and sign"}{" "}
          · Updated {fmtTime(new Date(apt.dataUpdatedAt).toISOString())}
        </span>
        <Button variant="ghost" onClick={() => apt.refetch()} disabled={apt.isFetching}>
          {apt.isFetching ? "Refreshing…" : "Refresh appointment"}
        </Button>
      </div>
      {consult.error && <ApiErrorBanner error={consult.error} onRetry={() => consult.refetch()} />}
      {apt.error && <ApiErrorBanner error={apt.error} onRetry={() => apt.refetch()} />}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {!readOnly && (
            <DoctorCallPanel
              appointmentId={apt.data.appointment.id}
              status={apt.data.appointment.status}
            />
          )}
          <a
            href="#patient-context"
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)] underline underline-offset-4 lg:hidden"
          >
            View patient context and previous visits
          </a>
          <ConsultationFlow
            consultation={consult.data}
            appointmentId={apt.data.appointment.id}
            readOnly={readOnly}
          />
        </div>
        <aside id="patient-context" className="flex min-w-0 flex-col gap-4 scroll-mt-64">
          {apt.data.patient && (
            <VisitHistoryPanel
              patientId={apt.data.patient.id}
              excludeAppointmentId={apt.data.appointment.id}
            />
          )}
          {apt.data.patient && (
            <PatientSummary
              patient={apt.data.patient}
              preconsult={apt.data.preconsult}
              profile={apt.data.profile}
              attachments={apt.data.attachments ?? []}
              appointmentId={apt.data.appointment.id}
              showIdentity={false}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
