"use client";

import { useParams, useRouter } from "next/navigation";

import { PatientSafetyStrip } from "@/components/clinical/patient-safety-strip";
import { ProfileForm } from "@/components/healthworker/profile-form";
import { BackLink } from "@/components/primitives/back-link";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { explainError } from "@/lib/error-codes";
import { fullName } from "@/lib/format";
import { parseIdParam, throwNotFoundIf404 } from "@/lib/not-found";
import { usePatient, useUpsertProfile } from "@/lib/use-api";

export default function PatientProfilePage() {
  const params = useParams<{ id: string }>();
  const id = parseIdParam(params.id);
  const router = useRouter();

  const patientQ = usePatient(id);
  const upsert = useUpsertProfile(id);

  if (patientQ.error && !patientQ.data) {
    throwNotFoundIf404(patientQ.error);
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ApiErrorBanner error={patientQ.error} onRetry={() => patientQ.refetch()} />
      </div>
    );
  }
  if (!patientQ.data) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      </div>
    );
  }

  const { patient, profile } = patientQ.data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <BackLink href={`/healthworker/patients/${patient.id}`}>Back to {fullName(patient)}</BackLink>

      <PatientSafetyStrip patient={patient} profile={profile} />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Medical intake</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Record the history, allergies, and current medicines the doctor needs for this patient.
        </p>
      </header>
      {patientQ.error && (
        <ApiErrorBanner error={patientQ.error} onRetry={() => patientQ.refetch()} />
      )}

      <Card variant="elevated" className="p-4 sm:p-6">
        <ProfileForm
          initial={profile}
          submitting={upsert.isPending}
          errorMessage={upsert.error ? explainError(upsert.error.error) : null}
          onCancel={() => router.push(`/healthworker/patients/${patient.id}`)}
          onSubmit={(req) => upsert.mutateAsync(req)}
          onSaved={() => router.push(`/healthworker/patients/${patient.id}`)}
        />
      </Card>
    </div>
  );
}
