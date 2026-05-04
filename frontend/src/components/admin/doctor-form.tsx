"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { z } from "zod";
import { BadgeCheck, ContactRound, IdCard, Stamp } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Textarea } from "@/components/primitives/select";
import { RubberStampUploader } from "@/components/admin/rubber-stamp-uploader";
import type { Doctor } from "@/types/api";

// Mode-aware schema — username + password are required at create time, omitted/optional on edit.
// Rubber stamp is required on create; on edit it's optional (existing image stays unless replaced).
const baseFields = {
  givenName: z.string().min(1, "Given name is required"),
  familyName: z.string().min(1, "Family name is required"),
  contact: z.string().min(1, "Contact number is required"),
  email: z.string().email("Enter a valid email"),
  slmcRegistrationNumber: z.string().min(1, "SLMC registration number is required (§1.7)"),
  qualifications: z.string().min(1, "Qualifications are required (§1.7)"),
  practitionerAddress: z.string().min(1, "Practitioner address is required (§1.7)"),
  instituteName: z.string().min(1, "Institute name is required"),
  instituteContact: z.string().min(1, "Institute contact is required (§1.7)"),
};

const createSchema = z.object({
  ...baseFields,
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const updateSchema = z.object({
  ...baseFields,
  password: z.string().optional(),
});

export type DoctorFormPayload = {
  givenName: string;
  familyName: string;
  contact: string;
  email: string;
  slmcRegistrationNumber: string;
  qualifications: string;
  practitionerAddress: string;
  instituteName: string;
  instituteContact: string;
  rubberStampImage?: string; // base64 — required on create, optional on update
  username?: string; // create only
  password?: string;
};

export function DoctorForm({
  initial,
  mode,
  submitting,
  errorMessage,
  errorMissingFields,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Doctor | null;
  mode: "create" | "update";
  submitting: boolean;
  errorMessage?: string | null;
  errorMissingFields?: string[];
  submitLabel: string;
  onSubmit: (payload: DoctorFormPayload) => void;
  onCancel?: () => void;
}) {
  const isCreate = mode === "create";
  type Values = z.infer<typeof createSchema>;
  // In update mode we seed the uploader from the existing stamp so admins see
  // what's on file (Stamp captured / Replace / Clear). `stampDirty` flips on any
  // user interaction so we only resend the stamp when it actually changes —
  // avoids a 1 MB round-trip on every save.
  const [stamp, setStamp] = useState<string | null>(initial?.rubberStampImage ?? null);
  const [stampDirty, setStampDirty] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);

  const handleStampChange = (next: string | null) => {
    setStamp(next);
    setStampDirty(true);
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(isCreate ? createSchema : updateSchema) as never,
    defaultValues: {
      givenName: initial?.givenName ?? "",
      familyName: initial?.familyName ?? "",
      contact: initial?.contact ?? "",
      email: initial?.email ?? "",
      slmcRegistrationNumber: initial?.slmcRegistrationNumber ?? "",
      qualifications: initial?.qualifications ?? "",
      practitionerAddress: initial?.practitionerAddress ?? "",
      instituteName: initial?.instituteName ?? "",
      instituteContact: initial?.instituteContact ?? "",
      username: "",
      password: "",
    } as Values,
  });

  const submit = handleSubmit((v) => {
    if (isCreate && !stamp) {
      setStampError("Rubber stamp image is required (§1.7).");
      return;
    }
    setStampError(null);
    const stampToSend = isCreate ? stamp : stampDirty && stamp ? stamp : null;
    const payload: DoctorFormPayload = {
      givenName: v.givenName.trim(),
      familyName: v.familyName.trim(),
      contact: v.contact.trim(),
      email: v.email.trim(),
      slmcRegistrationNumber: v.slmcRegistrationNumber.trim(),
      qualifications: v.qualifications.trim(),
      practitionerAddress: v.practitionerAddress.trim(),
      instituteName: v.instituteName.trim(),
      instituteContact: v.instituteContact.trim(),
      rubberStampImage: stampToSend ?? undefined,
    };
    if (isCreate) {
      payload.username = v.username?.trim();
      payload.password = v.password;
    } else if (v.password && v.password.trim()) {
      payload.password = v.password;
    }
    onSubmit(payload);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-10">
      {errorMessage && (
        <ErrorBanner>
          {errorMessage}
          {errorMissingFields && errorMissingFields.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {errorMissingFields.map((f) => (
                <li key={f} className="font-mono text-xs">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </ErrorBanner>
      )}

      <Section Icon={ContactRound} title="Identity & contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Given name *" htmlFor="givenName" error={errors.givenName?.message}>
            <Input id="givenName" {...register("givenName")} />
          </Field>
          <Field label="Family name *" htmlFor="familyName" error={errors.familyName?.message}>
            <Input id="familyName" {...register("familyName")} />
          </Field>
          <Field label="Email *" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register("email")} />
          </Field>
          <Field label="Contact number *" htmlFor="contact" error={errors.contact?.message}>
            <Input id="contact" {...register("contact")} placeholder="+94…" />
          </Field>
        </div>
      </Section>

      <Section Icon={IdCard} title={isCreate ? "Login credentials" : "Login credentials (rotate password)"}>
        <div className="grid gap-4 sm:grid-cols-2">
          {isCreate ? (
            <Field label="Username *" htmlFor="username" error={errors.username?.message}>
              <Input id="username" {...register("username")} autoComplete="off" />
            </Field>
          ) : (
            <div className="flex flex-col gap-2">
              <Label>Username</Label>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 font-mono text-sm">
                {initial?.username}
              </div>
            </div>
          )}
          <Field
            label={isCreate ? "Password *" : "New password (leave blank to keep)"}
            htmlFor="password"
            error={errors.password?.message}
          >
            <Input id="password" type="password" {...register("password")} autoComplete="new-password" />
          </Field>
        </div>
      </Section>

      <Section
        Icon={BadgeCheck}
        title="Sri Lanka §1.7 prescription requirements"
        hint="These five fields plus the rubber stamp are reproduced verbatim on every prescription PDF this doctor signs. They're required at account creation."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="SLMC registration number *"
            htmlFor="slmcRegistrationNumber"
            error={errors.slmcRegistrationNumber?.message}
          >
            <Input id="slmcRegistrationNumber" {...register("slmcRegistrationNumber")} />
          </Field>
          <Field label="Institute name *" htmlFor="instituteName" error={errors.instituteName?.message}>
            <Input id="instituteName" {...register("instituteName")} />
          </Field>
          <Field
            label="Institute contact *"
            htmlFor="instituteContact"
            error={errors.instituteContact?.message}
          >
            <Input id="instituteContact" {...register("instituteContact")} />
          </Field>
          <Field label="Qualifications *" htmlFor="qualifications" full error={errors.qualifications?.message}>
            <Textarea id="qualifications" rows={3} {...register("qualifications")} placeholder="e.g. MBBS, MD" />
          </Field>
          <Field
            label="Practitioner address *"
            htmlFor="practitionerAddress"
            full
            error={errors.practitionerAddress?.message}
          >
            <Textarea id="practitionerAddress" rows={3} {...register("practitionerAddress")} />
          </Field>
        </div>
      </Section>

      <Section Icon={Stamp} title="Rubber stamp" hint={isCreate ? "Required (§1.7)." : "Replace only if you need to update the existing stamp."}>
        <RubberStampUploader value={stamp} onChange={handleStampChange} />
        {stampError && <p className="mt-2 text-xs text-rose-600">{stampError}</p>}
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({
  Icon,
  title,
  hint,
  children,
}: {
  Icon: typeof BadgeCheck;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[var(--accent)]/10 p-2">
          <Icon className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div>
          <h3 className="font-display text-xl tracking-[-0.01em]">{title}</h3>
          {hint && <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  full,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
