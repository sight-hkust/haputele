"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import type { Lang, Patient, PatientCreateRequest, PatientUpdateRequest } from "@/types/api";

// `nationalId` ∈ {10, 12} is enforced server-side; we mirror the rule client-side
// so feedback is instant. Empty string → omitted from the payload.
const baseSchema = z.object({
  given: z.string().min(1, "Given name is required"),
  family: z.string().min(1, "Family name is required"),
  gender: z.string().min(1, "Gender is required"),
  dob: z.string().optional().or(z.literal("")),
  language: z.enum(["en", "ta", "si"]).optional().or(z.literal("") as z.ZodType<"">),
  screeningRef: z.string().optional(),
  nationalId: z
    .string()
    .optional()
    .refine((v) => !v || v.length === 10 || v.length === 12, {
      message: "National ID must be 10 or 12 characters",
    }),
  contact: z.string().optional(),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof baseSchema>;

const GENDER_OPTIONS = ["female", "male", "other"];

function strip(v: string | undefined): string | undefined {
  return v && v.trim() ? v.trim() : undefined;
}

export type PatientFormSubmit =
  | { mode: "create"; payload: Omit<PatientCreateRequest, "masterConsent"> }
  | { mode: "update"; payload: PatientUpdateRequest };

export function PatientForm({
  initial,
  mode,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
  submitLabel = "Save patient",
}: {
  initial?: Patient | null;
  mode: "create" | "update";
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (s: PatientFormSubmit) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      given: initial?.given ?? "",
      family: initial?.family ?? "",
      gender: initial?.gender ?? "",
      dob: initial?.dob ?? "",
      language: (initial?.language as Lang) ?? "",
      screeningRef: initial?.screeningRef ?? "",
      nationalId: initial?.nationalId ?? "",
      contact: initial?.contact ?? "",
      address: initial?.address ?? "",
    },
  });

  const submit = handleSubmit((v) => {
    const payload = {
      given: v.given.trim(),
      family: v.family.trim(),
      gender: v.gender,
      dob: strip(v.dob),
      language: (strip(v.language as string) as Lang | undefined) ?? undefined,
      screeningRef: strip(v.screeningRef),
      nationalId: strip(v.nationalId),
      contact: strip(v.contact),
      address: strip(v.address),
    };
    if (mode === "create") onSubmit({ mode: "create", payload });
    else onSubmit({ mode: "update", payload });
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {errorMessage && <ErrorBanner>{errorMessage}</ErrorBanner>}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Given name" htmlFor="given" error={errors.given?.message}>
          <Input id="given" {...register("given")} />
        </Field>
        <Field label="Family name" htmlFor="family" error={errors.family?.message}>
          <Input id="family" {...register("family")} />
        </Field>
        <Field label="Date of birth" htmlFor="dob">
          <Input id="dob" type="date" {...register("dob")} />
        </Field>
        <Field label="Gender" htmlFor="gender" error={errors.gender?.message}>
          <Select id="gender" {...register("gender")}>
            <option value="">Select gender…</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g[0].toUpperCase() + g.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preferred language" htmlFor="language">
          <Select id="language" {...register("language")}>
            <option value="">Not specified</option>
            <option value="en">English</option>
            <option value="ta">Tamil</option>
            <option value="si">Sinhala</option>
          </Select>
        </Field>
        <Field label="National ID" htmlFor="nationalId" error={errors.nationalId?.message}>
          <Input id="nationalId" {...register("nationalId")} placeholder="10 or 12 characters" />
        </Field>
        <Field label="Contact number" htmlFor="contact">
          <Input id="contact" {...register("contact")} placeholder="+94…" />
        </Field>
        <Field label="Screening reference" htmlFor="screeningRef">
          <Input id="screeningRef" {...register("screeningRef")} />
        </Field>
      </div>

      <Field label="Address" htmlFor="address">
        <Textarea id="address" rows={3} {...register("address")} />
      </Field>

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

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
