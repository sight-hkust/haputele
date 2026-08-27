"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Copy, Loader2, Save } from "lucide-react";

import { Button } from "@/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/primitives/card";
import { ApiErrorBanner, ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { Select } from "@/components/primitives/select";
import { WeekGrid, type CellKey } from "@/components/doctor/week-grid";
import {
  appointmentsToCells,
  cellsToWindows,
  shiftWindowsByWeeks,
  startOfWeekLocal,
  weekRangeUtc,
  windowsToCells,
} from "@/components/doctor/availability-grid-utils";
import {
  useAppointmentList,
  useBulkCreateAvailability,
  useDeleteAvailabilityRange,
  useDoctorAvailability,
  useDoctorList,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { formatWeekSpan } from "@/lib/date-locale";
import { useI18n } from "@/lib/i18n";

export default function HealthworkerAvailabilityPage() {
  const { t } = useI18n();
  const doctors = useDoctorList({ active: true });
  const [doctorId, setDoctorId] = useState<number | null>(null);

  // Auto-select the first active doctor on first load so the page is useful
  // immediately. The HW can still switch via the dropdown.
  useEffect(() => {
    if (doctorId === null && doctors.data && doctors.data.length > 0) {
      setDoctorId(doctors.data[0].id);
    }
  }, [doctors.data, doctorId]);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekLocal(new Date()));
  const range = useMemo(() => weekRangeUtc(weekStart), [weekStart]);

  const list = useDoctorAvailability(doctorId, range);
  const apptList = useAppointmentList({
    from: range.from,
    to: range.to,
    doctorId: doctorId ?? undefined,
  });

  const deleteRange = useDeleteAvailabilityRange(doctorId ?? 0);
  const bulkCreate = useBulkCreateAvailability(doctorId ?? 0);

  const bookedCells = useMemo(
    () =>
      appointmentsToCells(
        (apptList.data ?? []).filter((a) => a.status !== "cancelled"),
        weekStart,
      ),
    [apptList.data, weekStart],
  );

  const [cells, setCells] = useState<Set<CellKey>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hydrate cells from server windows whenever data lands. Doctor switches
  // change the queryKey, which produces a fresh list.data and re-fires this
  // effect — no separate reset needed.
  useEffect(() => {
    if (list.data) {
      setCells(windowsToCells(list.data, weekStart));
      setDirty(false);
      setSaveError(null);
    }
  }, [list.data, weekStart]);

  const onChange = (next: Set<CellKey>) => {
    setCells(next);
    setDirty(true);
  };

  const saveWeek = async () => {
    if (!doctorId) return;
    setSaveError(null);
    try {
      await deleteRange.mutateAsync(range);
      const windows = cellsToWindows(cells, weekStart);
      if (windows.length > 0) {
        await bulkCreate.mutateAsync({ windows });
      }
      await list.refetch();
      setDirty(false);
    } catch (e: unknown) {
      const err = e as { error?: string; message?: string };
      setSaveError(explainError(err.error ?? "request_failed", err.message));
    }
  };

  if (doctors.isLoading) {
    return (
      <div className="px-6 py-12 text-sm text-[var(--muted-foreground)]">{t("common.loading")}</div>
    );
  }
  if (doctors.error) {
    return (
      <div className="px-6 py-12">
        <ApiErrorBanner error={doctors.error} onRetry={() => doctors.refetch()} />
      </div>
    );
  }
  if ((doctors.data ?? []).length === 0) {
    return (
      <div className="px-6 py-12 text-sm text-[var(--muted-foreground)]">
        {t("pages.healthworker.availability.noActiveDoctors")}
      </div>
    );
  }

  const weekLabel = formatWeekSpan(weekStart, addDays(weekStart, 6));
  const saving = deleteRange.isPending || bulkCreate.isPending;
  const selectedDoctor = doctors.data?.find((d) => d.id === doctorId) ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <PageHeader
        label={t("pages.healthworker.availability.label")}
        title={t("pages.healthworker.availability.title")}
        highlight={t("pages.healthworker.availability.highlight")}
        subtitle={t("pages.healthworker.availability.subtitle")}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={doctorId ?? ""}
                onChange={(e) => setDoctorId(Number(e.target.value))}
                className="sm:max-w-xs"
                aria-label={t("pages.healthworker.availability.selectDoctor")}
              >
                {doctors.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.givenName} {d.familyName}
                  </option>
                ))}
              </Select>
              <div>
                <CardTitle>{weekLabel}</CardTitle>
                {dirty && (
                  <CardDescription>{t("pages.healthworker.availability.unsavedChanges")}</CardDescription>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekStart((w) => addDays(w, -7))}
              >
                {t("pages.healthworker.availability.prev")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekStart(startOfWeekLocal(new Date()))}
              >
                {t("pages.healthworker.availability.thisWeek")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekStart((w) => addDays(w, 7))}
              >
                {t("pages.healthworker.availability.next")}
              </Button>
              <CopyWeekButton
                doctorId={doctorId ?? 0}
                weekStart={weekStart}
                cells={cells}
                disabled={!doctorId || dirty || cells.size === 0}
              />
              <Button onClick={saveWeek} disabled={saving || !dirty || !doctorId}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? t("pages.healthworker.availability.saving") : t("pages.healthworker.availability.saveWeek")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(saveError || list.error) && (
            <div className="mb-4 flex flex-col gap-3">
              {saveError && <ErrorBanner>{saveError}</ErrorBanner>}
              <ApiErrorBanner error={list.error} onRetry={() => list.refetch()} />
            </div>
          )}
          {selectedDoctor && (
            <p className="mb-2 text-xs text-[var(--muted-foreground)]">
              {t("pages.healthworker.availability.editingFor")}{" "}
              <span className="font-medium text-[var(--foreground)]">
                {t("pages.healthworker.availability.doctorPrefix")} {selectedDoctor.givenName}{" "}
                {selectedDoctor.familyName}
              </span>
              .
            </p>
          )}
          <p className="mb-2 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span
              aria-hidden
              className="inline-block h-3 w-5 rounded-sm border border-[var(--border)]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent 0, transparent 4px, rgba(15, 23, 42, 0.22) 4px, rgba(15, 23, 42, 0.22) 7px)",
              }}
            />
            {t("pages.healthworker.availability.hatchedHint")}
          </p>
          <WeekGrid
            weekStart={weekStart}
            cells={cells}
            bookedCells={bookedCells}
            onChange={onChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CopyWeekButton({
  doctorId,
  weekStart,
  cells,
  disabled,
}: {
  doctorId: number;
  weekStart: Date;
  cells: Set<CellKey>;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteRange = useDeleteAvailabilityRange(doctorId);
  const bulkCreate = useBulkCreateAvailability(doctorId);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const baseWindows = cellsToWindows(cells, weekStart);
      for (let i = 1; i <= count; i++) {
        const targetWeekStart = addDays(weekStart, 7 * i);
        const targetRange = weekRangeUtc(targetWeekStart);
        await deleteRange.mutateAsync(targetRange);
        const shifted = shiftWindowsByWeeks(baseWindows, i);
        if (shifted.length > 0) await bulkCreate.mutateAsync({ windows: shifted });
      }
      setOpen(false);
    } catch (e: unknown) {
      const err = e as { error?: string; message?: string };
      setError(explainError(err.error ?? "request_failed", err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Copy className="h-4 w-4" />
        {t("pages.healthworker.availability.copyWeekTo")}
      </Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={t("pages.healthworker.availability.copyModalTitle")}
        description={t("pages.healthworker.availability.copyModalDescription")}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {[1, 2, 4, 8, 12].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={
                  "rounded-xl border px-3 py-1.5 text-xs font-medium transition-all " +
                  (count === n
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)]/30")
                }
              >
                {n === 1
                  ? t("pages.healthworker.availability.weekCount", { n })
                  : t("pages.healthworker.availability.weekCountPlural", { n })}
              </button>
            ))}
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("pages.healthworker.availability.willOverwrite", {
              count,
              date: format(addDays(weekStart, 7), "d MMM yyyy"),
            })}
          </p>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={run} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy
                ? t("pages.healthworker.availability.copying")
                : t("pages.healthworker.availability.copyToWeeks", { count })}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
