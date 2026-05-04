"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ProfileForm } from "@/components/healthworker/profile-form";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { explainError } from "@/lib/error-codes";
import { fullName } from "@/lib/format";
import { usePatient, useUpsertProfile } from "@/lib/use-api";

export default function PatientProfilePage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const router = useRouter();

  const patientQ = usePatient(Number.isFinite(id) ? id : null);
  const upsert = useUpsertProfile(id);

  if (patientQ.error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ErrorBanner>{explainError(patientQ.error.error)}</ErrorBanner>
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
      <Link
        href={`/healthworker/patients/${patient.id}`}
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to {fullName(patient)}
      </Link>

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
