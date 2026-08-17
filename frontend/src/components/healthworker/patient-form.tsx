"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays } from "lucide-react";
import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { displayDob, maskDobInput, parseDob } from "@/lib/dob-date";
import { appToday } from "@/lib/format";
import type { Lang, Patient, PatientCreateRequest, PatientUpdateRequest } from "@/types/api";

// `nationalId` ∈ {10, 12} is enforced server-side; we mirror the rule client-side
// so feedback is instant. Empty string → omitted from the payload.
const baseSchema = z.object({
  given: z.string().min(1, "Given name is required"),
  family: z.string().min(1, "Family name is required"),
  gender: z.string().min(1, "Gender is required"),
  // Required: the prescription PDF must carry the patient's age (§1.7) and
  // derives it from dob. Enforced here as well as server-side so a health
  // worker finds out at intake rather than the doctor finding out at signing.
  dob: z
    .string()
    .refine((value) => !value || parseDob(value) !== null, "Enter a valid date in DD/MM/YYYY")
    .refine((value) => {
      const dob = parseDob(value);
      return !dob || dob <= appToday();
    }, "Date of birth cannot be in the future"),
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

const createSchema = baseSchema.refine((value) => value.dob.trim().length > 0, {
  path: ["dob"],
  message: "Date of birth is required",
});

type FormValues = z.infer<typeof baseSchema>;

const GENDER_OPTIONS = ["female", "male", "other"];

function strip(v: string | undefined): string | undefined {
  return v?.trim() || undefined;
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
    control,
    setValue,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(mode === "create" ? createSchema : baseSchema),
    defaultValues: {
      given: initial?.given ?? "",
      family: initial?.family ?? "",
      gender: initial?.gender ?? "",
      dob: displayDob(initial?.dob),
      language: (initial?.language as Lang) ?? "",
      screeningRef: initial?.screeningRef ?? "",
      nationalId: initial?.nationalId ?? "",
      contact: initial?.contact ?? "",
      address: initial?.address ?? "",
    },
  });

  const submit = handleSubmit((v) => {
    const dob = parseDob(v.dob);
    const payload = {
      given: v.given.trim(),
      family: v.family.trim(),
      gender: v.gender,
      language: (strip(v.language as string) as Lang | undefined) ?? undefined,
      screeningRef: strip(v.screeningRef),
      nationalId: strip(v.nationalId),
      contact: strip(v.contact),
      address: strip(v.address),
    };
    if (mode === "create") {
      if (!dob) return;
      onSubmit({ mode: "create", payload: { ...payload, dob } });
    } else {
      onSubmit({ mode: "update", payload: { ...payload, dob } });
    }
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
        <Field label="Date of birth" htmlFor="dob" error={errors.dob?.message}>
          <Controller
            name="dob"
            control={control}
            render={({ field }) => (
              <DobInput
                inputRef={field.ref}
                value={field.value ?? ""}
                invalid={Boolean(errors.dob)}
                onChange={field.onChange}
                onPickerChange={(value) =>
                  setValue("dob", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
                }
                onBlur={() => {
                  const dob = parseDob(field.value);
                  if (dob) field.onChange(displayDob(dob));
                  field.onBlur();
                  void trigger("dob");
                }}
              />
            )}
          />
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

function DobInput({
  inputRef,
  value,
  invalid,
  onChange,
  onPickerChange,
  onBlur,
}: {
  inputRef: (instance: HTMLInputElement | null) => void;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onPickerChange: (value: string) => void;
  onBlur: () => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const today = appToday();

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.click();
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Input
        ref={inputRef}
        id="dob"
        name="dob"
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={value}
        aria-invalid={invalid}
        aria-describedby={invalid ? "dob-error" : undefined}
        onChange={(event) => onChange(maskDobInput(event.target.value, value))}
        onBlur={onBlur}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="h-12 w-12 shrink-0"
        aria-label="Choose date of birth from calendar"
        onClick={openPicker}
      >
        <CalendarDays className="h-5 w-5" aria-hidden="true" />
      </Button>
      <input
        ref={pickerRef}
        type="date"
        className="pointer-events-none absolute h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        max={today}
        value={parseDob(value) ?? ""}
        onChange={(event) => onPickerChange(displayDob(event.target.value))}
      />
    </div>
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
      {error && <p id={`${htmlFor}-error`} className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
