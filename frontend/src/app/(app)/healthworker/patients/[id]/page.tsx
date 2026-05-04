"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  ClipboardList,
  History,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { StatusBadge } from "@/components/primitives/status-badge";
import { PatientForm } from "@/components/healthworker/patient-form";
import { ProfileSummary } from "@/components/healthworker/profile-summary";
import {
  useDeletePatient,
  usePatient,
  usePatientHistory,
  useUpdatePatient,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { ageFromDob, fmtDate, fmtDateTime, fullName } from "@/lib/format";

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const router = useRouter();
  const patientQ = usePatient(id);
  const historyQ = usePatientHistory(id);
  const update = useUpdatePatient(id);
  const del = useDeletePatient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (patientQ.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      </div>
    );
  }
  if (patientQ.error || !patientQ.data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <ErrorBanner>{explainError(patientQ.error?.error ?? "patient_not_found")}</ErrorBanner>
      </div>
    );
  }

  const patient = patientQ.data.patient;
  const profile = patientQ.data.profile;
  const age = ageFromDob(patient.dob);
  const apts = historyQ.data?.appointments ?? [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <Link
        href="/healthworker/patients"
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to patients
      </Link>

      <PageHeader
        label={`Patient #${patient.id}`}
        title={fullName(patient)}
        subtitle={
          [
            patient.gender,
            age !== null ? `${age} years` : null,
            patient.language ? `Prefers ${patient.language.toUpperCase()}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        action={
          <div className="flex items-center gap-2">
            <Link href={`/healthworker/appointments/new?patientId=${patient.id}`}>
              <Button variant="secondary" size="md">
                <CalendarPlus className="h-4 w-4" />
                Book
              </Button>
            </Link>
            <Button variant="secondary" size="md" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="ghost" size="md" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <ProfileSummary profile={profile} editHref={`/healthworker/patients/${patient.id}/profile`} />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Demographics */}
        <Card variant="elevated" className="p-8">
          <div className="mb-6 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">
              Demographics
            </h2>
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Date of birth" value={fmtDate(patient.dob)} />
            <Field label="Gender" value={patient.gender} />
            <Field label="National ID" value={patient.nationalId ?? "—"} mono />
            <Field label="Contact" value={patient.contact ?? "—"} />
            <Field
              label="Preferred language"
              value={patient.language ? patient.language.toUpperCase() : "—"}
            />
            <Field label="Screening ref" value={patient.screeningRef ?? "—"} mono />
            <Field
              className="sm:col-span-2"
              label="Address"
              value={patient.address ?? "—"}
            />
          </dl>
        </Card>

        {/* History sidebar */}
        <Card className="p-8">
          <div className="mb-5 flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">
              Appointment history
            </h2>
          </div>
          {historyQ.isLoading ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : apts.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No appointments yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {apts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/healthworker/appointments/${a.id}`}
                    className="block rounded-lg px-2 py-3 transition-colors hover:bg-[var(--muted)]/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                        {fmtDateTime(a.scheduledAt)}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => !update.isPending && setEditOpen(false)}
        title="Edit patient"
        className="max-w-3xl"
      >
        <PatientForm
          mode="update"
          initial={patient}
          submitting={update.isPending}
          errorMessage={update.error ? explainError(update.error.error) : null}
          submitLabel="Save changes"
          onSubmit={(s) => {
            if (s.mode !== "update") return;
            update.mutate(s.payload, { onSuccess: () => setEditOpen(false) });
          }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Delete modal */}
      <Modal
        open={deleteOpen}
        onClose={() => !del.isPending && setDeleteOpen(false)}
        title="Delete this patient?"
        description="The record is soft-deleted — past appointments are preserved, but the patient won't appear in lists or be available for new appointments."
      >
        {del.error && (
          <ErrorBanner className="mb-3">{explainError(del.error.error)}</ErrorBanner>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={del.isPending}>
            Keep
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              del.mutate(patient.id, {
                onSuccess: () => router.push("/healthworker/patients"),
              })
            }
            disabled={del.isPending}
          >
            {del.isPending ? "Deleting…" : "Delete patient"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className={mono ? "mt-1 font-mono text-sm" : "mt-1 text-sm"}>{value}</dd>
    </div>
  );
}
