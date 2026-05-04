"use client";

import { useState } from "react";
import { Loader2, CalendarPlus } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Label } from "@/components/primitives/input";
import { Select } from "@/components/primitives/select";
import { DoctorSlotPicker } from "@/components/doctor/doctor-slot-picker";
import { useBookQueueEntry, useDoctorList } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { appLocalToUtcIso } from "@/lib/format";
import type { Appointment, QueueEntry } from "@/types/api";

// "Book from queue" form. Pre-fills the preferred doctor and target date if
// the entry has them. POSTs to /queue/{qid}/book; the backend creates the
// appointment + flips the entry to 'booked' atomically.
export function QueueBookForm({
  entry,
  onBooked,
  onCancel,
}: {
  entry: QueueEntry;
  onBooked: (a: Appointment) => void;
  onCancel: () => void;
}) {
  const doctors = useDoctorList({ active: true });
  const book = useBookQueueEntry(entry.id);

  const [doctorId, setDoctorId] = useState<string>(
    entry.preferredDoctorId ? String(entry.preferredDoctorId) : "",
  );
  const [scheduledAt, setScheduledAt] = useState<string>(
    entry.targetDate ? `${entry.targetDate}T09:00` : "",
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorId || !scheduledAt) return;
    book.mutate(
      {
        doctorId: Number(doctorId),
        scheduledAt: appLocalToUtcIso(scheduledAt),
      },
      {
        onSuccess: (res) => onBooked(res.appointment),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Doctor</Label>
        <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">Select a doctor…</option>
          {(doctors.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              Dr. {d.givenName} {d.familyName}
              {entry.preferredDoctorId === d.id ? " · preferred" : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Scheduled time</Label>
        {doctorId ? (
          <DoctorSlotPicker
            doctorId={Number(doctorId)}
            value={scheduledAt}
            onChange={setScheduledAt}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-xs text-[var(--muted-foreground)]">
            Pick a doctor first to see their open slots.
          </p>
        )}
      </div>

      {book.error && <ErrorBanner>{explainError(book.error.error, book.error.message)}</ErrorBanner>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={book.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!doctorId || !scheduledAt || book.isPending}>
          {book.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
          {book.isPending ? "Booking…" : "Book appointment"}
        </Button>
      </div>
    </form>
  );
}
