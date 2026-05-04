"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ToggleLeft, ToggleRight } from "lucide-react";

import { DoctorForm } from "@/components/admin/doctor-form";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { StatusBadge } from "@/components/primitives/status-badge";
import {
  useDeactivateDoctor,
  useDoctor,
  useUpdateDoctor,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { doctorName } from "@/lib/format";

export default function DoctorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const router = useRouter();

  const doctor = useDoctor(Number.isFinite(id) ? id : null);
  const update = useUpdateDoctor(id);
  const deactivate = useDeactivateDoctor();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (doctor.error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ErrorBanner>{explainError(doctor.error.error)}</ErrorBanner>
      </div>
    );
  }
  if (!doctor.data) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      </div>
    );
  }

  const d = doctor.data;
  const errCode = update.error?.error ?? null;
  const missing = (update.error?.detail?.missing as string[] | undefined) ?? undefined;
  const errorMessage = errCode
    ? errCode === "missing_prescription_fields"
      ? "Some §1.7 mandatory fields couldn't be validated server-side."
      : explainError(errCode)
    : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to doctors
      </Link>

      <PageHeader
        label={`Doctor #${d.id}`}
        title={doctorName(d)}
        subtitle={d.email}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={d.active ? "completed" : "cancelled"} />
            {d.active ? (
              <Button variant="ghost" size="md" onClick={() => setConfirmOpen(true)}>
                <ToggleRight className="h-4 w-4" />
                Deactivate
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                onClick={() => update.mutate({ active: true })}
                disabled={update.isPending}
              >
                <ToggleLeft className="h-4 w-4" />
                Reactivate
              </Button>
            )}
          </div>
        }
      />

      <Card variant="elevated" className="p-8">
        <DoctorForm
          mode="update"
          initial={d}
          submitting={update.isPending}
          errorMessage={errorMessage}
          errorMissingFields={missing}
          submitLabel="Save changes"
          onSubmit={(payload) => {
            // Strip undefined so we don't accidentally send `null` rubber stamp etc.
            const body: Record<string, unknown> = {
              givenName: payload.givenName,
              familyName: payload.familyName,
              contact: payload.contact,
              email: payload.email,
              slmcRegistrationNumber: payload.slmcRegistrationNumber,
              qualifications: payload.qualifications,
              practitionerAddress: payload.practitionerAddress,
              instituteName: payload.instituteName,
              instituteContact: payload.instituteContact,
            };
            if (payload.password) body.password = payload.password;
            if (payload.rubberStampImage) body.rubberStampImage = payload.rubberStampImage;
            update.mutate(body);
          }}
          onCancel={() => router.push("/admin")}
        />
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => !deactivate.isPending && setConfirmOpen(false)}
        title="Deactivate this doctor?"
        description="The doctor stays in the database — past appointments and consultations are preserved — but they won't appear in healthworker booking. Reactivate any time."
      >
        {deactivate.error && (
          <ErrorBanner className="mb-3">{explainError(deactivate.error.error)}</ErrorBanner>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setConfirmOpen(false)}
            disabled={deactivate.isPending}
          >
            Keep active
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              deactivate.mutate(d.id, { onSuccess: () => setConfirmOpen(false) })
            }
            disabled={deactivate.isPending}
          >
            {deactivate.isPending ? "Deactivating…" : "Deactivate"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
