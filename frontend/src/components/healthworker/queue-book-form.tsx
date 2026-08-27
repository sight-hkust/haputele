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
import { appLocalToUtcIso, doctorName } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
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
        <Label>{t("forms.doctor")}</Label>
        <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">{t("forms.selectDoctor")}</option>
          {(doctors.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {doctorName(d)}
              {entry.preferredDoctorId === d.id ? t("queue.preferredSuffix") : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t("forms.scheduledTime")}</Label>
        {doctorId ? (
          <DoctorSlotPicker
            doctorId={Number(doctorId)}
            value={scheduledAt}
            onChange={setScheduledAt}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-xs text-[var(--muted-foreground)]">
            {t("forms.pickDoctorForSlots")}
          </p>
        )}
      </div>

      {book.error && (
        <ErrorBanner>{explainError(book.error.error, book.error.message)}</ErrorBanner>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={book.isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!doctorId || !scheduledAt || book.isPending}>
          {book.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarPlus className="h-4 w-4" />
          )}
          {book.isPending ? t("forms.booking") : t("pages.healthworker.appointments.bookAppointment")}
        </Button>
      </div>
    </form>
  );
}
