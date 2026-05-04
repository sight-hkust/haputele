"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { PatientPicker } from "@/components/healthworker/patient-picker";
import { ApiError } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { fmtTargetWeek, fullName } from "@/lib/format";
import { useCreateQueueEntry, useDoctorList } from "@/lib/use-api";
import type {
  Patient,
  QueueEntry,
  QueueEntryCreateRequest,
  QueuePriority,
} from "@/types/api";

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
        <Label>Patient</Label>
        <PatientPicker
          picked={picked}
          onPick={setPicked}
          onClear={() => setPicked(null)}
        />
        {!picked && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Patient must be registered first (with master consent).
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source">
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value as "walk_in" | "screening")}
          >
            <option value="walk_in">Walk-in</option>
            <option value="screening">Screening flag</option>
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as QueuePriority)}
          >
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
        <Field label="Preferred doctor (optional)">
          <Select
            value={preferredDoctorId}
            onChange={(e) => setPreferredDoctorId(e.target.value)}
          >
            <option value="">Any doctor</option>
            {(doctors.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                Dr. {d.givenName} {d.familyName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target week (optional)">
          <Input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Pick any day in the target week — we&rsquo;ll snap to that week&rsquo;s Monday.
          </p>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            source === "walk_in"
              ? "What did the patient ask for? (e.g. 'wants morning slot in 2 weeks')"
              : "Reason from the screening team (e.g. 'elevated BP, refer urgently'). If there's a hard deadline, mention it here."
          }
        />
      </Field>

      {otherError && <ErrorBanner>{otherError}</ErrorBanner>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={create.isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!picked || create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {create.isPending ? "Adding…" : "Add to queue"}
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
  return (
    <div className="flex flex-col gap-4">
      <ErrorBanner tone="amber">
        This patient already has {existing.length} pending entry from this source.
      </ErrorBanner>
      <ul className="flex flex-col gap-2">
        {existing.map((e) => (
          <li
            key={e.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{e.source === "walk_in" ? "Walk-in" : e.source === "screening" ? "Screening" : "Follow-up"}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                #{e.id} · {e.priority}
              </span>
            </div>
            {e.targetDate && (
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                {fmtTargetWeek(e.targetDate)}
              </div>
            )}
            {e.notes && <div className="mt-1 text-xs text-[var(--muted-foreground)]">{e.notes}</div>}
          </li>
        ))}
      </ul>
      <p className="text-sm text-[var(--muted-foreground)]">
        If the new entry is for a different reason, you can still add it. Otherwise, book or update the existing one.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Back
        </Button>
        <Button onClick={onConfirmAdd} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add as a separate entry
        </Button>
      </div>
    </div>
  );
}

// Tiny helper used by the page when summarising a queue entry inline.
export function QueueEntryPatientName(p: Patient | null | undefined) {
  return p ? fullName(p) : "Unknown patient";
}
