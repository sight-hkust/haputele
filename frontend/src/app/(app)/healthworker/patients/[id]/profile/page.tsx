"use client";

import { useParams, useRouter } from "next/navigation";

import { ProfileForm } from "@/components/healthworker/profile-form";
import { BackLink } from "@/components/primitives/back-link";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
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

  if (patientQ.error) {
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
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      <BackLink href={`/healthworker/patients/${patient.id}`}>Back to {fullName(patient)}</BackLink>

      <PageHeader
        label="Patient profile"
        title="Intake"
        highlight="form."
        subtitle="Capture disease history, allergies, surgeries, existing medications, and lifestyle. Everything here is shown to the doctor in the consultation cockpit."
      />

      <Card variant="elevated" className="p-8">
        <ProfileForm
          initial={profile}
          submitting={upsert.isPending}
          errorMessage={upsert.error ? explainError(upsert.error.error) : null}
          onCancel={() => router.push(`/healthworker/patients/${patient.id}`)}
          onSubmit={(req) =>
            upsert.mutate(req, {
              onSuccess: () => router.push(`/healthworker/patients/${patient.id}`),
            })
          }
        />
      </Card>
    </div>
  );
}
