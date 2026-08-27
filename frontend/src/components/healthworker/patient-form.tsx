"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/primitives/button";
import { DatePicker } from "@/components/primitives/date-picker";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { displayDob, maskDobInput, parseDob } from "@/lib/dob-date";
import { appToday } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Lang, Patient, PatientCreateRequest, PatientUpdateRequest } from "@/types/api";

type FormValues = {
  given: string;
  family: string;
  gender: string;
  dob: string;
  language: Lang | "";
  screeningRef?: string;
  nationalId?: string;
  contact?: string;
  address?: string;
};

const GENDER_OPTIONS = ["female", "male", "other"] as const;

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
  submitLabel,
}: {
  initial?: Patient | null;
  mode: "create" | "update";
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (s: PatientFormSubmit) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const schema = useMemo(() => {
    // `nationalId` ∈ {10, 12} is enforced server-side; we mirror the rule client-side
    // so feedback is instant. Empty string → omitted from the payload.
    const baseSchema = z.object({
      given: z.string().min(1, t("forms.validation.givenRequired")),
      family: z.string().min(1, t("forms.validation.familyRequired")),
      gender: z.string().min(1, t("forms.validation.genderRequired")),
      // Required: the prescription PDF must carry the patient's age (§1.7) and
      // derives it from dob. Enforced here as well as server-side so a health
      // worker finds out at intake rather than the doctor finding out at signing.
      dob: z
        .string()
        .refine((value) => !value || parseDob(value) !== null, t("forms.validation.dobInvalid"))
        .refine((value) => {
          const dob = parseDob(value);
          return !dob || dob <= appToday();
        }, t("forms.validation.dobFuture")),
      language: z
        .enum(["en", "ta", "si"])
        .optional()
        .or(z.literal("") as z.ZodType<"">),
      screeningRef: z.string().optional(),
      nationalId: z
        .string()
        .optional()
        .refine((v) => !v || v.length === 10 || v.length === 12, {
          message: t("forms.validation.nationalIdLength"),
        }),
      contact: z.string().optional(),
      address: z.string().optional(),
    });
    const createSchema = baseSchema.refine((value) => value.dob.trim().length > 0, {
      path: ["dob"],
      message: t("forms.validation.dobRequired"),
    });
    return mode === "create" ? createSchema : baseSchema;
  }, [mode, t]);

  const {
    register,
    control,
    setValue,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
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

  const resolvedSubmitLabel = submitLabel ?? t("forms.savePatient");

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {errorMessage && <ErrorBanner>{errorMessage}</ErrorBanner>}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("forms.givenName")} htmlFor="given" error={errors.given?.message}>
          <Input id="given" {...register("given")} />
        </Field>
        <Field label={t("forms.familyName")} htmlFor="family" error={errors.family?.message}>
          <Input id="family" {...register("family")} />
        </Field>
        <Field label={t("forms.dateOfBirth")} htmlFor="dob" error={errors.dob?.message}>
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
                  setValue("dob", value, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true,
                  })
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
        <Field label={t("forms.gender")} htmlFor="gender" error={errors.gender?.message}>
          <Select id="gender" {...register("gender")}>
            <option value="">{t("forms.selectGender")}</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {t(`forms.genderOptions.${g}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("forms.preferredLanguage")} htmlFor="language">
          <Select id="language" {...register("language")}>
            <option value="">{t("forms.notSpecified")}</option>
            <option value="en">{t("common.english")}</option>
            <option value="ta">{t("common.tamil")}</option>
            <option value="si">{t("common.sinhala")}</option>
          </Select>
        </Field>
        <Field label={t("common.nationalId")} htmlFor="nationalId" error={errors.nationalId?.message}>
          <Input
            id="nationalId"
            {...register("nationalId")}
            placeholder={t("forms.nationalIdPlaceholder")}
          />
        </Field>
        <Field label={t("forms.contactNumber")} htmlFor="contact">
          <Input id="contact" {...register("contact")} placeholder={t("forms.phonePlaceholder")} />
        </Field>
        <Field label={t("forms.screeningRef")} htmlFor="screeningRef">
          <Input id="screeningRef" {...register("screeningRef")} />
        </Field>
      </div>

      <Field label={t("common.address")} htmlFor="address">
        <Textarea id="address" rows={3} {...register("address")} />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? t("common.saving") : resolvedSubmitLabel}
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
  const { t } = useI18n();
  const today = appToday();

  return (
    <div className="flex items-center gap-3">
      <Input
        ref={inputRef}
        id="dob"
        name="dob"
        type="text"
        inputMode="numeric"
        placeholder={t("forms.dobPlaceholder")}
        maxLength={10}
        value={value}
        aria-invalid={invalid}
        aria-describedby={invalid ? "dob-error" : undefined}
        onChange={(event) => onChange(maskDobInput(event.target.value, value))}
        onBlur={onBlur}
      />
      <DatePicker
        trigger="icon"
        ariaLabel={t("forms.dobCalendarAria")}
        max={today}
        value={parseDob(value) ?? ""}
        onChange={(date) => onPickerChange(displayDob(date))}
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
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
