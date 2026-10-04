"use client";

import Link from "next/link";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { doctorName, fmtDateTime, fmtTargetWeek } from "@/lib/format";
import { useAppointment, useDoctorList, useQueueList } from "@/lib/use-api";
import type { Consultation } from "@/types/api";

type Role = "doctor" | "healthworker";

export function FollowUpSummary({
  consultation,
  viewerRole: role,
}: {
  consultation: Consultation;
  viewerRole: Role;
}) {
  const { followUpAppointmentId, followUpWeeks, followUpDate } = consultation;
  const unknown =
    followUpAppointmentId === undefined ||
    followUpWeeks === undefined ||
    followUpDate === undefined;

  return (
    <Card className="min-w-0 p-4" aria-label="Follow-up receipt">
      <h3 className="text-lg font-semibold">Follow-up</h3>
      <div className="mt-2 space-y-2 text-sm">
        {followUpAppointmentId ? (
          <BookedFollowUp appointmentId={followUpAppointmentId} viewerRole={role} />
        ) : followUpWeeks ? (
          <>
            <p className="font-medium">
              Requested in {followUpWeeks} {followUpWeeks === 1 ? "week" : "weeks"}
              {followUpDate ? ` · ${fmtTargetWeek(followUpDate)}` : ""}.
            </p>
            {role === "healthworker" ? (
              <QueuedFollowUp consultation={consultation} />
            ) : (
              <p className="text-[var(--muted-foreground)]">
                Healthworker booking requested. The healthworker owns choosing and confirming the
                appointment; current booking status is not available in this view.
              </p>
            )}
          </>
        ) : followUpDate ? (
          <p>Target: {fmtTargetWeek(followUpDate)}. Booking details are not recorded.</p>
        ) : unknown ? (
          <p className="text-[var(--muted-foreground)]">
            Follow-up information is unavailable in this record.
          </p>
        ) : (
          <p className="text-[var(--muted-foreground)]">No follow-up requested.</p>
        )}
      </div>
    </Card>
  );
}

function BookedFollowUp({
  appointmentId,
  viewerRole: role,
}: {
  appointmentId: number;
  viewerRole: Role;
}) {
  const appointment = useAppointment(appointmentId);
  const doctors = useDoctorList();
  const doctor = doctors.data?.find((item) => item.id === appointment.data?.appointment.doctorId);
  const linked = appointment.data?.appointment;

  return (
    <div className="space-y-2">
      {linked ? (
        <>
          <p className="font-medium">
            {fmtDateTime(linked.scheduledAt)} ·{" "}
            {doctor ? doctorName(doctor) : `Doctor #${linked.doctorId}`}
          </p>
          <p className="text-[var(--muted-foreground)]">
            {linked.status === "cancelled"
              ? "This follow-up appointment was cancelled."
              : linked.status === "completed"
                ? "Follow-up appointment completed."
                : "Appointment booked."}
          </p>
        </>
      ) : !appointment.error ? (
        <p className="text-[var(--muted-foreground)]">Loading booked appointment…</p>
      ) : null}
      {appointment.error && (
        <ApiErrorBanner error={appointment.error} onRetry={() => appointment.refetch()} />
      )}
      <Link
        href={`/${role}/appointments/${appointmentId}`}
        className="inline-flex min-h-11 items-center font-medium text-[var(--accent)] underline underline-offset-4"
      >
        View follow-up appointment #{appointmentId}
      </Link>
    </div>
  );
}

function QueuedFollowUp({ consultation }: { consultation: Consultation }) {
  const original = useAppointment(consultation.appointmentId);
  if (!original.data) {
    return original.error ? (
      <ApiErrorBanner error={original.error} onRetry={() => original.refetch()} />
    ) : (
      <p className="text-[var(--muted-foreground)]">Checking booking request…</p>
    );
  }
  return (
    <QueueReceipt
      consultationId={consultation.id}
      patientId={original.data.appointment.patientId}
    />
  );
}

function QueueReceipt({
  consultationId,
  patientId,
}: {
  consultationId: number;
  patientId: number;
}) {
  const queue = useQueueList({ source: "follow_up", patientId });
  const entry = queue.data?.find(
    (item) => item.sourceMeta?.sourceConsultationId === consultationId,
  );
  if (queue.error && !queue.data)
    return <ApiErrorBanner error={queue.error} onRetry={() => queue.refetch()} />;
  if (!queue.data)
    return <p className="text-[var(--muted-foreground)]">Checking booking request…</p>;

  return (
    <div className="space-y-2">
      {queue.error && <ApiErrorBanner error={queue.error} onRetry={() => queue.refetch()} />}
      {entry?.status === "booked" && entry.appointmentId ? (
        <BookedFollowUp appointmentId={entry.appointmentId} viewerRole="healthworker" />
      ) : entry?.status === "pending" ? (
        <>
          <p className="text-[var(--muted-foreground)]">
            Pending booking — you own arranging and confirming the next visit with the patient.
          </p>
          <Link
            href={`/healthworker/appointments?bookFromQueue=${entry.id}`}
            className="inline-flex min-h-11 items-center font-medium text-[var(--accent)] underline underline-offset-4"
          >
            Book from follow-up queue
          </Link>
        </>
      ) : (
        <>
          <p className="text-[var(--muted-foreground)]">
            {entry?.status === "cancelled"
              ? "The booking request was cancelled."
              : "The request is recorded; current booking details are unavailable."}
          </p>
          <Link
            href="/healthworker/queue"
            className="inline-flex min-h-11 items-center font-medium text-[var(--accent)] underline underline-offset-4"
          >
            Review follow-up queue
          </Link>
        </>
      )}
      <Button variant="ghost" size="sm" onClick={() => queue.refetch()} disabled={queue.isFetching}>
        {queue.isFetching ? "Checking…" : "Refresh booking status"}
      </Button>
    </div>
  );
}
