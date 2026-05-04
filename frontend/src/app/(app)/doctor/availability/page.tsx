"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Copy, Loader2, Save } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
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
  useCurrentDoctor,
  useDeleteAvailabilityRange,
  useDoctorAvailability,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";

export default function DoctorAvailabilityPage() {
  const { doctor, isLoading: doctorLoading, error: doctorError } = useCurrentDoctor();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekLocal(new Date()));
  const range = useMemo(() => weekRangeUtc(weekStart), [weekStart]);

  const list = useDoctorAvailability(doctor?.id ?? null, range);
  const apptList = useAppointmentList({
    from: range.from,
    to: range.to,
    doctorId: doctor?.id,
  });

  const deleteRange = useDeleteAvailabilityRange(doctor?.id ?? 0);
  const bulkCreate = useBulkCreateAvailability(doctor?.id ?? 0);

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

  // Hydrate cells from server windows whenever the week changes / data lands.
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
    if (!doctor) return;
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

  if (doctorLoading) {
    return <div className="px-6 py-12 text-sm text-[var(--muted-foreground)]">Loading…</div>;
  }
  if (doctorError || !doctor) {
    return (
      <div className="px-6 py-12">
        <ErrorBanner>
          {doctorError ? explainError(doctorError.error) : "Doctor profile not found."}
        </ErrorBanner>
      </div>
    );
  }

  const weekLabel = `${format(weekStart, "d MMM")} – ${format(addDays(weekStart, 6), "d MMM yyyy")}`;
  const saving = deleteRange.isPending || bulkCreate.isPending;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <PageHeader
        label="Availability"
        title="My"
        highlight="availability"
        subtitle="Drag across cells to paint when you're reachable. Drag again over filled cells to erase. This is an advisory reference for the healthworker when booking — bookings outside these windows are still allowed, but will be discussed and confirmed with you first."
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{weekLabel}</CardTitle>
              {dirty && <CardDescription>Unsaved changes</CardDescription>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekStart((w) => addDays(w, -7))}
              >
                ← Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekStart(startOfWeekLocal(new Date()))}
              >
                This week
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekStart((w) => addDays(w, 7))}
              >
                Next →
              </Button>
              <CopyWeekButton
                doctorId={doctor.id}
                weekStart={weekStart}
                cells={cells}
                disabled={dirty || cells.size === 0}
              />
              <Button onClick={saveWeek} disabled={saving || !dirty}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save week"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(list.error || saveError) && (
            <div className="mb-4">
              <ErrorBanner>
                {saveError ?? (list.error && explainError(list.error.error, list.error.message))}
              </ErrorBanner>
            </div>
          )}
          <p className="mb-2 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
            <span
              aria-hidden
              className="inline-block h-3 w-5 rounded-sm border border-[var(--border)]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent 0, transparent 4px, rgba(15, 23, 42, 0.22) 4px, rgba(15, 23, 42, 0.22) 7px)",
              }}
            />
            Hatched cells already have a booked appointment — informational only, you can still paint over them.
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

// "Copy this week to..." action — replicates the visible week's pattern
// over the next N future weeks. Wipes those weeks first (atomic per-week
// via the range-delete endpoint) then bulk-creates the shifted windows.
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
        Copy week to…
      </Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Copy this week's pattern"
        description="Replicate the currently visible week's availability over the next N weeks. Existing windows in those target weeks will be replaced."
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
                {n} week{n === 1 ? "" : "s"}
              </button>
            ))}
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Will overwrite the {count} week{count === 1 ? "" : "s"} starting{" "}
            <span className="font-medium text-[var(--foreground)]">
              {format(addDays(weekStart, 7), "d MMM yyyy")}
            </span>
            .
          </p>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={run} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Copying…" : `Copy to ${count} week${count === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
