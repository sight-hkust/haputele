"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileSignature,
  Stethoscope,
} from "lucide-react";

import { PatientSummary } from "@/components/doctor/patient-summary";
import { VisitHistoryPanel } from "@/components/doctor/visit-history";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { StatusBadge } from "@/components/primitives/status-badge";
import { explainError } from "@/lib/error-codes";
import { fmtDateTime } from "@/lib/format";
import { useAppointment, useCreateOrGetDraft } from "@/lib/use-api";

export default function DoctorAppointmentDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const router = useRouter();

  const apt = useAppointment(Number.isFinite(id) ? id : null);
  const draft = useCreateOrGetDraft();

  if (apt.error) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <ErrorBanner>{explainError(apt.error.error)}</ErrorBanner>
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

  const beginConsultation = () =>
    draft.mutate(appointment.id, {
      onSuccess: (res) => router.push(`/doctor/consultations/${res.consultationId}`),
    });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <Link
        href="/doctor"
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to calendar
      </Link>

      <PageHeader
        label={`Appointment #${appointment.id}`}
        title={patient ? `${patient.given} ${patient.family}` : "Patient"}
        subtitle={fmtDateTime(appointment.scheduledAt)}
        action={<StatusBadge status={appointment.status} />}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_0.6fr]">
        {/* Main column — actions */}
        <div className="flex flex-col gap-6 lg:order-1">
          {!canBeginConsult && !isCompleted && (
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <Stethoscope className="mt-0.5 h-5 w-5 text-[var(--muted-foreground)]" />
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.01em]">
                    Waiting on the healthworker
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    The consultation flow opens once vitals are submitted and the meeting starts.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {canBeginConsult && (
            <Card variant="elevated" className="p-8">
              <h2 className="font-display text-2xl tracking-[-0.01em]">
                {appointment.status === "awaiting_notes"
                  ? "Write up the consultation"
                  : "Open the consultation while you talk"}
              </h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Three stages — notes, prescription, then review &amp; sign. Drafts persist between stages so
                you can step away and come back.
              </p>

              {draft.error && (
                <ErrorBanner className="mt-4">{explainError(draft.error.error)}</ErrorBanner>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={beginConsultation} disabled={draft.isPending}>
                  <FileSignature className="h-4 w-4" />
                  {draft.isPending ? "Opening…" : "Begin consultation"}
                </Button>
              </div>
            </Card>
          )}

          {isCompleted && consultation && (
            <Card variant="elevated" className="p-8">
              <h2 className="font-display text-2xl tracking-[-0.01em]">
                Consultation completed
              </h2>
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
        <aside className="flex flex-col gap-4 lg:order-2">
          {patient ? (
            <>
              <PatientSummary
                patient={patient}
                preconsult={preconsult}
                profile={profile}
                attachments={attachments ?? []}
                appointmentId={appointment.id}
              />
              <VisitHistoryPanel
                patientId={patient.id}
                excludeAppointmentId={appointment.id}
              />
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
