"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DoctorForm } from "@/components/admin/doctor-form";
import { Card } from "@/components/primitives/card";
import { PageHeader } from "@/components/primitives/page-header";
import { useCreateDoctor } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";

export default function NewDoctorPage() {
  const router = useRouter();
  const create = useCreateDoctor();

  // Backend returns either `username_taken`, `missing_prescription_fields`
  // (with a `missing` array), or `invalid_rubber_stamp_image`. We surface
  // each clearly.
  const errCode = create.error?.error ?? null;
  const missing = (create.error?.detail?.missing as string[] | undefined) ?? undefined;
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
        label="New doctor"
        title="Create a"
        highlight="doctor account."
        subtitle="Identity, login credentials, and the §1.7 prescription mandatory fields are all captured in one form. The rubber stamp image is required."
      />

      <Card variant="elevated" className="p-8">
        <DoctorForm
          mode="create"
          submitting={create.isPending}
          errorMessage={errorMessage}
          errorMissingFields={missing}
          submitLabel="Create doctor"
          onCancel={() => router.push("/admin")}
          onSubmit={(payload) => {
            // create requires username + password + rubberStampImage to be present;
            // DoctorForm's create-mode validation guarantees this so we cast.
            create.mutate(
              {
                username: payload.username!,
                password: payload.password!,
                givenName: payload.givenName,
                familyName: payload.familyName,
                contact: payload.contact,
                email: payload.email,
                slmcRegistrationNumber: payload.slmcRegistrationNumber,
                qualifications: payload.qualifications,
                practitionerAddress: payload.practitionerAddress,
                instituteName: payload.instituteName,
                instituteContact: payload.instituteContact,
                rubberStampImage: payload.rubberStampImage!,
              },
              { onSuccess: (doc) => router.push(`/admin/doctors/${doc.id}`) },
            );
          }}
        />
      </Card>
    </div>
  );
}
