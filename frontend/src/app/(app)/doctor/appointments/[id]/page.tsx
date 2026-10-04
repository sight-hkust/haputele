"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink, FileSignature, Stethoscope } from "lucide-react";

import { PatientSummary } from "@/components/doctor/patient-summary";
import { VisitHistoryPanel } from "@/components/doctor/visit-history";
import { PatientSafetyStrip } from "@/components/clinical/patient-safety-strip";
import { FollowUpSummary } from "@/components/clinical/follow-up-summary";
import { BackLink } from "@/components/primitives/back-link";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner, ErrorBanner } from "@/components/primitives/error-banner";
import { StatusBadge } from "@/components/primitives/status-badge";
import { explainError } from "@/lib/error-codes";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { useAppointment, useCreateOrGetDraft } from "@/lib/use-api";
import { parseIdParam, throwNotFoundIf404 } from "@/lib/not-found";

export default function DoctorAppointmentDetail() {
  const params = useParams<{ id: string }>();
  const id = parseIdParam(params.id);
  const router = useRouter();

  const apt = useAppointment(id);
  const draft = useCreateOrGetDraft();

  if (apt.error && !apt.data) {
    throwNotFoundIf404(apt.error);
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ApiErrorBanner error={apt.error} onRetry={() => apt.refetch()} />
      </div>
    );
  }
  if (!apt.data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      </div>
    );
  }

  const { appointment, patient, profile, preconsult, consultation, attachments } = apt.data;

  // Doctors can begin consultation in in_progress (alongside the meeting) or
  // awaiting_notes (after the call). Pre-meeting states aren't actionable for
  // the doctor — meeting hasn't been started by the healthworker yet.
  const canBeginConsult = ["in_progress", "awaiting_notes"].includes(appointment.status);
  const isCompleted = appointment.status === "completed";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <BackLink href="/doctor">Back to appointments</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">
            Appointment #{appointment.id}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {fmtDateTime(appointment.scheduledAt)}
          </p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>
      <PatientSafetyStrip patient={patient} profile={profile} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted-foreground)]">
        <span>Updated {fmtTime(new Date(apt.dataUpdatedAt).toISOString())}</span>
        <Button variant="ghost" onClick={() => apt.refetch()} disabled={apt.isFetching}>
          {apt.isFetching ? "Refreshing…" : "Refresh status"}
        </Button>
      </div>
      {apt.error && <ApiErrorBanner error={apt.error} onRetry={() => apt.refetch()} />}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Main column — actions */}
        <div className="flex min-w-0 flex-col gap-4">
          {!canBeginConsult && !isCompleted && (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <Stethoscope className="mt-0.5 h-5 w-5 text-[var(--muted-foreground)]" />
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.01em]">
                    {appointment.status === "cancelled"
                      ? "Appointment cancelled"
                      : appointment.status === "data_collection"
                        ? "Ready — healthworker starts the call"
                        : "Healthworker is preparing the patient"}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {appointment.status === "cancelled"
                      ? appointment.cancellationReason ||
                        "No consultation can be started for this appointment."
                      : appointment.status === "data_collection"
                        ? "Consent and vitals are captured. The healthworker will start the meeting; this view updates automatically. Review the patient's context while you wait."
                        : "The healthworker owns confirming consent and collecting vitals. Review the patient's context now; you can begin notes once they start the meeting."}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {canBeginConsult && (
            <Card variant="elevated" className="p-4">
              <h2 className="text-2xl font-semibold tracking-[-0.01em]">
                {appointment.status === "awaiting_notes"
                  ? "Write up the consultation"
                  : "Open the consultation while you talk"}
              </h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {appointment.status === "awaiting_notes"
                  ? "You own the next step: finish the notes, prescription and signature so the healthworker can deliver the prescription."
                  : "Join the patient call and document the consultation. Save each stage before moving on."}
              </p>

              {draft.error && (
                <ErrorBanner className="mt-4">{explainError(draft.error.error)}</ErrorBanner>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  onClick={() =>
                    draft.mutate(appointment.id, {
                      onSuccess: (res) =>
                        router.push(`/doctor/consultations/${res.consultationId}`),
                    })
                  }
                  disabled={draft.isPending}
                >
                  <FileSignature className="h-4 w-4" />
                  {draft.isPending
                    ? "Opening…"
                    : consultation
                      ? "Resume consultation"
                      : "Begin consultation"}
                </Button>
              </div>
            </Card>
          )}

          {isCompleted && consultation && (
            <FollowUpSummary consultation={consultation} viewerRole="doctor" />
          )}
          {isCompleted && consultation && (
            <Card variant="elevated" className="p-4">
              <h2 className="text-2xl font-semibold tracking-[-0.01em]">Consultation completed</h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Signed and locked. Open the record to review the diagnoses, prescription, and notes.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/doctor/consultations/${consultation.id}`}>
                  <Button variant="secondary">
                    <ExternalLink className="h-4 w-4" />
                    View record
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar — patient context */}
        <aside className="flex min-w-0 flex-col gap-4">
          {patient ? (
            <>
              <PatientSummary
                patient={patient}
                preconsult={preconsult}
                profile={profile}
                attachments={attachments ?? []}
                appointmentId={appointment.id}
                showIdentity={false}
              />
              <VisitHistoryPanel patientId={patient.id} excludeAppointmentId={appointment.id} />
            </>
          ) : (
            <Card className="p-6">
              <p className="text-sm text-[var(--muted-foreground)]">Patient unavailable.</p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
