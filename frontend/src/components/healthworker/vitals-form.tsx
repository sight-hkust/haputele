"use client";

import { forwardRef } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Textarea } from "@/components/primitives/select";
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
  disabled,
  onSubmit,
}: {
  initial?: Preconsult | null;
  submitting: boolean;
  errorMessage?: string | null;
  disabled?: boolean;
  onSubmit: (v: PreconsultRequest) => void;
}) {
  const { register, handleSubmit } = useForm<VitalsValues>({
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

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
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
          {...register("primaryComplaint")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Vital label="Height (cm)" id="height" {...register("height")} disabled={disabled} />
        <Vital label="Weight (kg)" id="weight" {...register("weight")} disabled={disabled} />
        <Vital label="Pulse (bpm)" id="pulse" {...register("pulse")} disabled={disabled} />
        <Vital label="Systolic BP (mmHg)" id="sysBp" {...register("sysBp")} disabled={disabled} />
        <Vital label="Diastolic BP (mmHg)" id="diaBp" {...register("diaBp")} disabled={disabled} />
        <Vital label="Temperature (°C)" id="temperature" step="0.1" {...register("temperature")} disabled={disabled} />
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
  } & React.InputHTMLAttributes<HTMLInputElement>
>(({ label, id, step, disabled, ...rest }, ref) => (
  <div className="flex flex-col gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Input ref={ref} id={id} type="number" inputMode="decimal" step={step ?? "1"} disabled={disabled} {...rest} />
  </div>
));
Vital.displayName = "Vital";
