"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { DatePicker } from "@/components/primitives/date-picker";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { PatientPicker } from "@/components/healthworker/patient-picker";
import type { ApiError } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { doctorName, fmtTargetWeek, fullName } from "@/lib/format";
import { getActiveLocale, translate, useI18n } from "@/lib/i18n";
import { useCreateQueueEntry, useDoctorList } from "@/lib/use-api";
import type { Patient, QueueEntry, QueueEntryCreateRequest, QueuePriority } from "@/types/api";

// HW intake form for adding a queue entry. Walk-in or screening source
// (follow-up entries are server-generated only). Handles the soft
// duplicate_pending response by surfacing the existing entries — caller
// re-submits with `force: true` after confirmation.
export function QueueEntryForm({
  defaultPatient,
  onCreated,
  onCancel,
}: {
  defaultPatient?: Patient;
  onCreated: (entry: QueueEntry) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<Patient | null>(defaultPatient ?? null);
  const [source, setSource] = useState<"walk_in" | "screening">("walk_in");
  const [priority, setPriority] = useState<QueuePriority>("routine");
  const [preferredDoctorId, setPreferredDoctorId] = useState<string>("");
  const [targetDate, setTargetDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [duplicates, setDuplicates] = useState<QueueEntry[] | null>(null);

  const doctors = useDoctorList({ active: true });
  const create = useCreateQueueEntry();

  const buildPayload = (force: boolean): QueueEntryCreateRequest | null => {
    if (!picked) return null;
    return {
      patientId: picked.id,
      source,
      priority,
      preferredDoctorId: preferredDoctorId ? Number(preferredDoctorId) : null,
      targetDate: targetDate || null,
      notes: notes.trim() || null,
      force,
    };
  };

  const submit = (force: boolean) => {
    const payload = buildPayload(force);
    if (!payload) return;
    create.mutate(payload, {
      onSuccess: (entry) => onCreated(entry),
      onError: (err: ApiError) => {
        if (err.error === "duplicate_pending" && err.detail?.existing) {
          setDuplicates(err.detail.existing as QueueEntry[]);
        }
      },
    });
  };

  if (duplicates) {
    return (
      <DuplicateConfirm
        existing={duplicates}
        onCancel={() => setDuplicates(null)}
        onConfirmAdd={() => {
          setDuplicates(null);
          submit(true);
        }}
        pending={create.isPending}
      />
    );
  }

  const otherError =
    create.error && create.error.error !== "duplicate_pending"
      ? explainError(create.error.error, create.error.message)
      : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label>{t("forms.patient")}</Label>
        <PatientPicker picked={picked} onPick={setPicked} onClear={() => setPicked(null)} />
        {!picked && (
          <p className="text-xs text-[var(--muted-foreground)]">
            {t("queue.registerPatientFirst")}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("queue.source")}>
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value as "walk_in" | "screening")}
          >
            <option value="walk_in">{t("queue.walkIn")}</option>
            <option value="screening">{t("queue.screeningFlag")}</option>
          </Select>
        </Field>
        <Field label={t("common.priority")}>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as QueuePriority)}>
            <option value="routine">{t("queue.routine")}</option>
            <option value="urgent">{t("queue.urgent")}</option>
          </Select>
        </Field>
        <Field label={t("queue.preferredDoctorOptional")}>
          <Select value={preferredDoctorId} onChange={(e) => setPreferredDoctorId(e.target.value)}>
            <option value="">{t("queue.anyDoctor")}</option>
            {(doctors.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {doctorName(d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("queue.targetWeekOptional")}>
          <DatePicker
            mode="week"
            align="end"
            value={targetDate}
            onChange={setTargetDate}
            placeholder={t("forms.chooseTargetWeek")}
            ariaLabel={t("forms.targetWeek")}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            {t("queue.targetWeekHint")}
          </p>
        </Field>
      </div>

      <Field label={t("common.notes")}>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            source === "walk_in"
              ? t("queue.notesWalkInPlaceholder")
              : t("queue.notesScreeningPlaceholder")
          }
        />
      </Field>

      {otherError && <ErrorBanner>{otherError}</ErrorBanner>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={!picked || create.isPending}>
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {create.isPending ? t("queue.adding") : t("pages.healthworker.appointments.addToQueue")}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// Soft duplicate-pending confirmation. Backend already returned the existing
// entries in the 409 body; render them so HW sees what's already there before
// deciding to add another.
function DuplicateConfirm({
  existing,
  onCancel,
  onConfirmAdd,
  pending,
}: {
  existing: QueueEntry[];
  onCancel: () => void;
  onConfirmAdd: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <ErrorBanner tone="amber">
        {t("queue.duplicatePending", {
          n: existing.length,
          entry:
            existing.length === 1 ? t("queue.duplicateEntry") : t("queue.duplicateEntries"),
        })}
      </ErrorBanner>
      <ul className="flex flex-col gap-2">
        {existing.map((e) => (
          <li
            key={e.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {e.source === "walk_in"
                  ? t("queue.walkIn")
                  : e.source === "screening"
                    ? t("queue.screening")
                    : t("queue.followUp")}
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                #{e.id} · {e.priority === "urgent" ? t("queue.urgent") : t("queue.routine")}
              </span>
            </div>
            {e.targetDate && (
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                {fmtTargetWeek(e.targetDate)}
              </div>
            )}
            {e.notes && (
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">{e.notes}</div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-[var(--muted-foreground)]">{t("queue.duplicateHint")}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {t("common.back")}
        </Button>
        <Button onClick={onConfirmAdd} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("queue.addSeparateEntry")}
        </Button>
      </div>
    </div>
  );
}

// Tiny helper used by the page when summarising a queue entry inline.
export function QueueEntryPatientName(p: Patient | null | undefined) {
  return p ? fullName(p) : translate(getActiveLocale(), "queue.unknownPatient");
}
