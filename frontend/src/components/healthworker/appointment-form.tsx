"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Label } from "@/components/primitives/input";
import { Select } from "@/components/primitives/select";
import { DoctorSlotPicker } from "@/components/doctor/doctor-slot-picker";
import { PatientPicker } from "@/components/healthworker/patient-picker";
import type { Doctor, Patient } from "@/types/api";
import { appLocalToUtcIso, doctorName } from "@/lib/format";
import { usePatient } from "@/lib/use-api";

// Normalize undefined/empty/NaN to 0 so the .positive() check produces the
// friendly "Pick a …" message instead of Zod's raw "Expected number, received
// nan" — happens when the picker is cleared (setValue with undefined) or the
// doctor select is left on its empty option.
const toIntOrZero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const schema = z.object({
  patientId: z.preprocess(toIntOrZero, z.number().int().positive("Pick a patient")),
  doctorId: z.preprocess(toIntOrZero, z.number().int().positive("Pick a doctor")),
  scheduledAt: z.string().min(1, "Pick a date and time"),
});

type Values = z.infer<typeof schema>;

export function AppointmentForm({
  doctors,
  defaultPatientId,
  defaultDoctorId,
  defaultScheduledAt,
  hidePatientPicker = false,
  patientLabel,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
  onPatientChange,
  submitLabel = "Book appointment",
}: {
  doctors: Doctor[];
  defaultPatientId?: number;
  /** Pre-fill the doctor select — used when booking from a queue entry that
      has a preferredDoctorId. */
  defaultDoctorId?: number;
  /** Pre-fill the slot picker — datetime-local string. */
  defaultScheduledAt?: string;
  hidePatientPicker?: boolean;
  patientLabel?: string;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (v: { patientId: number; doctorId: number; scheduledAt: string }) => void;
  onCancel?: () => void;
  /** Fires whenever the picker's selection changes — page uses this to drive
      the patient-context panel (existing appointments + queue). */
  onPatientChange?: (patientId: number | undefined) => void;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      patientId: defaultPatientId ?? (undefined as unknown as number),
      doctorId: defaultDoctorId ?? (undefined as unknown as number),
      scheduledAt: defaultScheduledAt ?? "",
    },
  });

  // Hidden fields that the slot picker writes to via setValue.
  register("patientId");
  register("scheduledAt");

  const watchedDoctorId = watch("doctorId");
  const watchedScheduledAt = watch("scheduledAt") ?? "";
  const doctorIdNum =
    typeof watchedDoctorId === "number"
      ? watchedDoctorId
      : Number(watchedDoctorId) || 0;

  // When the picker is in use (no preselected patient), we track the chosen
  // patient locally for the chip display.
  const [picked, setPicked] = useState<Patient | null>(null);

  // Hydrate the picker chip when the form arrives with a `defaultPatientId`
  // (e.g. "Book" from a patient profile). The form value is already seeded by
  // useForm; this is purely so the UI shows the patient instead of an empty
  // search box. Only runs when the picker is visible (not from-queue mode).
  //
  // Keep the queryKey stable across `picked` toggles — gating the id on
  // `!picked` would flip the query in/out of cache, making `prefillQ.data` go
  // PATIENT → undefined → PATIENT when the user clicks "Change" and re-fire
  // the hydrate effect, which would silently re-hydrate the chip the user
  // just cleared. Using `enabled` alone is identity-stable.
  const prefillQ = usePatient(
    !hidePatientPicker && defaultPatientId ? defaultPatientId : null,
    { enabled: !hidePatientPicker && !!defaultPatientId && !picked },
  );
  useEffect(() => {
    if (!picked && prefillQ.data) {
      setPicked(prefillQ.data.patient);
      onPatientChange?.(prefillQ.data.patient.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillQ.data]);

  const submit = handleSubmit((v) =>
    onSubmit({
      patientId: v.patientId,
      doctorId: v.doctorId,
      // The datetime-local input value is interpreted as APP_TIMEZONE (Sri
      // Lanka) regardless of the browser's tz, so what the healthworker
      // types is exactly what gets stored.
      scheduledAt: appLocalToUtcIso(v.scheduledAt),
    }),
  );

  const activeDoctors = doctors.filter((d) => d.active);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {errorMessage && <ErrorBanner>{errorMessage}</ErrorBanner>}

      {hidePatientPicker && patientLabel ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            For patient
          </span>
          <div className="mt-1 font-medium">{patientLabel}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Patient</Label>
          <PatientPicker
            picked={picked}
            onPick={(p) => {
              setPicked(p);
              setValue("patientId", p.id, { shouldValidate: true });
              onPatientChange?.(p.id);
            }}
            onClear={() => {
              setPicked(null);
              setValue("patientId", undefined as unknown as number, { shouldValidate: true });
              onPatientChange?.(undefined);
            }}
          />
          {errors.patientId && <p className="text-xs text-rose-600">{errors.patientId.message}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="doctorId">Doctor</Label>
        <Select id="doctorId" {...register("doctorId")}>
          <option value="">Select a doctor…</option>
          {activeDoctors.map((d) => (
            <option key={d.id} value={d.id}>
              {doctorName(d)}
            </option>
          ))}
        </Select>
        {errors.doctorId && <p className="text-xs text-rose-600">{errors.doctorId.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Scheduled time</Label>
        {doctorIdNum > 0 ? (
          <DoctorSlotPicker
            doctorId={doctorIdNum}
            value={watchedScheduledAt}
            onChange={(v) => setValue("scheduledAt", v, { shouldValidate: true })}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-xs text-[var(--muted-foreground)]">
            Pick a doctor first to see their open slots.
          </p>
        )}
        {errors.scheduledAt && (
          <p className="text-xs text-rose-600">{errors.scheduledAt.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Booking…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
