"use client";

import { forwardRef, useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Textarea } from "@/components/primitives/select";
import {
  PRIMARY_COMPLAINT_MAX,
  validateBloodPressurePair,
  validateVital,
  type VitalField,
} from "@/lib/vitals";
import type { Preconsult, PreconsultRequest } from "@/types/api";

type VitalsValues = {
  primaryComplaint: string;
  height: string;
  weight: string;
  sysBp: string;
  diaBp: string;
  pulse: string;
  temperature: string;
};

const toIntOrNull = (s: string): number | null => {
  const v = parseInt(s, 10);
  return Number.isFinite(v) ? v : null;
};

const toFloatOrNull = (s: string): number | null => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};

export function VitalsForm({
  initial,
  submitting,
  errorMessage,
  serverFieldErrors,
  disabled,
  onSubmit,
}: {
  initial?: Preconsult | null;
  submitting: boolean;
  /** Banner-level message — a non-field conflict, or a form-wide validation note. */
  errorMessage?: string | null;
  /** Server 422s mapped back onto the inputs that tripped them. */
  serverFieldErrors?: Partial<Record<VitalField, string>>;
  disabled?: boolean;
  onSubmit: (v: PreconsultRequest) => void;
}) {
  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    setError,
    formState: { errors },
  } = useForm<VitalsValues>({
    // Validate as the HW tabs through, and re-check on every edit once a field
    // has erred — so a corrected typo clears its red state immediately.
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      primaryComplaint: initial?.primaryComplaint ?? "",
      height: initial?.height?.toString() ?? "",
      weight: initial?.weight?.toString() ?? "",
      sysBp: initial?.sysBp?.toString() ?? "",
      diaBp: initial?.diaBp?.toString() ?? "",
      pulse: initial?.pulse?.toString() ?? "",
      temperature: initial?.temperature?.toString() ?? "",
    },
  });

  // Mirror server-reported field errors onto the inputs. The server is the
  // final authority on bounds, so even if the client check is bypassed the
  // offending field still lights up with a precise message.
  useEffect(() => {
    if (!serverFieldErrors) return;
    for (const [field, message] of Object.entries(serverFieldErrors)) {
      if (message) setError(field as VitalField, { type: "server", message });
    }
  }, [serverFieldErrors, setError]);

  const submit = handleSubmit((v) =>
    onSubmit({
      // Always send the complaint so an explicit clear (empty string) is
      // honoured — server treats empty as "clear" while a null preserves it.
      primaryComplaint: v.primaryComplaint.trim(),
      height: toIntOrNull(v.height),
      weight: toIntOrNull(v.weight),
      sysBp: toIntOrNull(v.sysBp),
      diaBp: toIntOrNull(v.diaBp),
      pulse: toIntOrNull(v.pulse),
      temperature: toFloatOrNull(v.temperature),
    }),
  );

  // Per-field rules. Empty stays valid (vitals are optional); out-of-range and
  // the diastolic<systolic pair are the only failures we raise client-side.
  const rule = (field: VitalField) => ({
    validate: (value: string) => validateVital(field, value) ?? true,
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {errorMessage && <ErrorBanner>{errorMessage}</ErrorBanner>}

      {/* FEEDBACK §2: doctors need the *reason* for the visit before the call.
          Free-text, prominent, top of the form so the HW captures it first. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="primaryComplaint">Primary complaint</Label>
        <Textarea
          id="primaryComplaint"
          rows={3}
          placeholder="Why is the patient here today? e.g. cough for 3 days, infected wound on right hand…"
          disabled={disabled}
          aria-invalid={!!errors.primaryComplaint}
          {...register("primaryComplaint", {
            maxLength: {
              value: PRIMARY_COMPLAINT_MAX,
              message: `Keep the complaint under ${PRIMARY_COMPLAINT_MAX} characters.`,
            },
          })}
        />
        {errors.primaryComplaint && <FieldError message={errors.primaryComplaint.message} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Vital label="Height (cm)" id="height" disabled={disabled}
          error={errors.height?.message} {...register("height", rule("height"))} />
        <Vital label="Weight (kg)" id="weight" disabled={disabled}
          error={errors.weight?.message} {...register("weight", rule("weight"))} />
        <Vital label="Pulse (bpm)" id="pulse" disabled={disabled}
          error={errors.pulse?.message} {...register("pulse", rule("pulse"))} />
        <Vital label="Systolic BP (mmHg)" id="sysBp" disabled={disabled}
          error={errors.sysBp?.message}
          {...register("sysBp", {
            ...rule("sysBp"),
            // Re-check the pair when systolic changes so a now-valid ordering
            // clears the diastolic error (and vice-versa).
            onBlur: () => { if (getValues("diaBp").trim()) void trigger("diaBp"); },
          })} />
        <Vital label="Diastolic BP (mmHg)" id="diaBp" disabled={disabled}
          error={errors.diaBp?.message}
          {...register("diaBp", {
            validate: (value: string) =>
              validateVital("diaBp", value) ??
              validateBloodPressurePair(getValues("sysBp"), value) ??
              true,
          })} />
        <Vital label="Temperature (°C)" id="temperature" step="0.1" disabled={disabled}
          error={errors.temperature?.message} {...register("temperature", rule("temperature"))} />
      </div>
      {!disabled && (
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : initial ? "Update vitals" : "Save vitals"}
          </Button>
        </div>
      )}
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs leading-snug text-rose-600">{message}</p>;
}

// forwardRef is essential — RHF's `register()` returns a `ref` callback that
// must reach the underlying <input>. A plain function component swallows it
// silently, leaving every field unread on submit (PUT body was all-null).
const Vital = forwardRef<
  HTMLInputElement,
  {
    label: string;
    id: string;
    step?: string;
    disabled?: boolean;
    error?: string;
  } & React.InputHTMLAttributes<HTMLInputElement>
>(({ label, id, step, disabled, error, ...rest }, ref) => (
  <div className="flex flex-col gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      ref={ref}
      id={id}
      type="number"
      inputMode="decimal"
      step={step ?? "1"}
      disabled={disabled}
      aria-invalid={!!error}
      className={error ? "border-rose-300 focus-visible:ring-rose-400" : undefined}
      {...rest}
    />
    <FieldError message={error} />
  </div>
));
Vital.displayName = "Vital";
