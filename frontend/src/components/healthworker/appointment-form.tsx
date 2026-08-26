"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
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
import { useI18n } from "@/lib/i18n";
import { usePatient } from "@/lib/use-api";

const toIntOrZero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

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
  submitLabel,
}: {
  doctors: Doctor[];
  defaultPatientId?: number;
  defaultDoctorId?: number;
  defaultScheduledAt?: string;
  hidePatientPicker?: boolean;
  patientLabel?: string;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (v: { patientId: number; doctorId: number; scheduledAt: string }) => void;
  onCancel?: () => void;
  onPatientChange?: (patientId: number | undefined) => void;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const schema = useMemo(
    () =>
      z.object({
        patientId: z.preprocess(toIntOrZero, z.number().int().positive(t("forms.pickPatient"))),
        doctorId: z.preprocess(toIntOrZero, z.number().int().positive(t("forms.pickDoctor"))),
        scheduledAt: z.string().min(1, t("forms.pickDateTime")),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;

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

  register("patientId");
  register("scheduledAt");

  const watchedDoctorId = watch("doctorId");
  const watchedScheduledAt = watch("scheduledAt") ?? "";
  const doctorIdNum =
    typeof watchedDoctorId === "number" ? watchedDoctorId : Number(watchedDoctorId) || 0;

  const [picked, setPicked] = useState<Patient | null>(null);

  const prefillQ = usePatient(!hidePatientPicker && defaultPatientId ? defaultPatientId : null, {
    enabled: !hidePatientPicker && !!defaultPatientId && !picked,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately keyed to prefillQ.data alone — see block comment in git history: reacting to `picked`/onPatientChange identity changes would silently re-hydrate a chip the user just cleared.
  useEffect(() => {
    if (!picked && prefillQ.data) {
      setPicked(prefillQ.data.patient);
      onPatientChange?.(prefillQ.data.patient.id);
    }
  }, [prefillQ.data]);

  const submit = handleSubmit((v) =>
    onSubmit({
      patientId: v.patientId,
      doctorId: v.doctorId,
      scheduledAt: appLocalToUtcIso(v.scheduledAt),
    }),
  );

  const activeDoctors = doctors.filter((d) => d.active);
  const resolvedSubmitLabel = submitLabel ?? t("pages.healthworker.appointments.bookAppointment");

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {errorMessage && <ErrorBanner>{errorMessage}</ErrorBanner>}

      {hidePatientPicker && patientLabel ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-sm">
          <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            {t("forms.forPatient")}
          </span>
          <div className="mt-1 font-medium">{patientLabel}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>{t("forms.patient")}</Label>
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
        <Label htmlFor="doctorId">{t("forms.doctor")}</Label>
        <Select id="doctorId" {...register("doctorId")}>
          <option value="">{t("forms.selectDoctor")}</option>
          {activeDoctors.map((d) => (
            <option key={d.id} value={d.id}>
              {doctorName(d)}
            </option>
          ))}
        </Select>
        {errors.doctorId && <p className="text-xs text-rose-600">{errors.doctorId.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t("forms.scheduledTime")}</Label>
        {doctorIdNum > 0 ? (
          <DoctorSlotPicker
            doctorId={doctorIdNum}
            value={watchedScheduledAt}
            onChange={(v) => setValue("scheduledAt", v, { shouldValidate: true })}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-xs text-[var(--muted-foreground)]">
            {t("forms.pickDoctorForSlots")}
          </p>
        )}
        {errors.scheduledAt && (
          <p className="text-xs text-rose-600">{errors.scheduledAt.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? t("forms.booking") : resolvedSubmitLabel}
        </Button>
      </div>
    </form>
  );
}
