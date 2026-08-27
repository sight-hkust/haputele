"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, Inbox, Loader2, Plus, X } from "lucide-react";

import { AppointmentForm } from "@/components/healthworker/appointment-form";
import { AppointmentCalendar } from "@/components/healthworker/appointment-calendar";
import { CancelQueueEntryForm } from "@/components/healthworker/cancel-queue-entry-form";
import { PatientContext } from "@/components/healthworker/patient-context";
import { QueueEntryForm } from "@/components/healthworker/queue-entry-form";
import { QueueRow } from "@/components/healthworker/queue-row";
import type { ApiError } from "@/lib/api";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import {
  useAppointmentList,
  useBookQueueEntry,
  useCreateAppointment,
  useDoctorList,
  usePatient,
  useQueueEntry,
  useQueueList,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { fullName } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { QueueEntry } from "@/types/api";

// Wide window: ±60 days. Healthworker calendar shows everything in their
// rolling 4-month vicinity.
const RANGE_DAYS = 60;

// Booking card has two modes:
//   - "fresh": HW picks patient + doctor + slot freely → POST /appointments
//   - "from-queue": locked to the queue entry's patient, doctor + slot
//     pre-filled, submit calls POST /queue/{qid}/book (atomic appt + entry)
type BookingMode = { kind: "fresh" } | { kind: "from-queue"; entry: QueueEntry };

// Queue card sub-states. The book sub-state is no longer here — booking is
// handled by the booking card via mode switching, both visible at once.
type QueuePanel = { kind: "list" } | { kind: "add" } | { kind: "cancel"; entry: QueueEntry };

export default function AppointmentsWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <Workspace />
    </Suspense>
  );
}

function Workspace() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const initialPatientId = sp.get("patientId");
  const bookFromQueueParam = sp.get("bookFromQueue");

  // Calendar window
  const { from, to } = useMemo(() => {
    const now = Date.now();
    return {
      from: new Date(now - RANGE_DAYS * 86_400_000).toISOString(),
      to: new Date(now + RANGE_DAYS * 86_400_000).toISOString(),
    };
  }, []);
  const apptList = useAppointmentList({ from, to });

  const queueQ = useQueueList({ status: "pending" });
  const pending = queueQ.data ?? [];

  // Booking card mode + queue card sub-state, both lifted to workspace level
  // so "Book this" on a queue row can flip the booking card without losing
  // anything in the queue card.
  const [bookingMode, setBookingMode] = useState<BookingMode>({ kind: "fresh" });
  const [queuePanel, setQueuePanel] = useState<QueuePanel>({ kind: "list" });

  // When "Book this" fires from a queue row OR from the patient-context panel,
  // we want the booking card scrolled into view.
  const bookingCardRef = useRef<HTMLDivElement>(null);
  const focusBookingCard = (entry: QueueEntry) => {
    setBookingMode({ kind: "from-queue", entry });
    requestAnimationFrame(() =>
      bookingCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  // Cross-page deep-link: /healthworker/queue's "Book" button forwards here
  // with `?bookFromQueue=N`. Fetch the entry, then mount it into the booking
  // card the same way an in-workspace click would. Consume the param once so
  // user-driven mode changes afterwards aren't overwritten.
  const queueEntryQ = useQueueEntry(bookFromQueueParam ? Number(bookFromQueueParam) : null);
  const [consumedQueueParam, setConsumedQueueParam] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: guarded one-shot deep-link consumer — focusBookingCard/router identities change per render and the consumedQueueParam flag makes refires no-ops.
  useEffect(() => {
    if (!consumedQueueParam && queueEntryQ.data) {
      focusBookingCard(queueEntryQ.data);
      setConsumedQueueParam(true);
      // Strip the param so a refresh doesn't keep re-entering from-queue mode.
      router.replace("/healthworker/appointments");
    }
  }, [queueEntryQ.data, consumedQueueParam]);

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6 px-6 py-8">
      <PageHeader
        label={t("pages.healthworker.appointments.label")}
        title={t("pages.healthworker.appointments.title")}
        highlight={t("pages.healthworker.appointments.highlight")}
        subtitle={t("pages.healthworker.appointments.subtitle")}
      />

      <Legend />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_32rem]">
        {/* Calendar (main) */}
        <div className="min-w-0">
          {apptList.error ? (
            <ApiErrorBanner error={apptList.error} onRetry={() => apptList.refetch()} />
          ) : (
            <AppointmentCalendar appointments={apptList.data ?? []} />
          )}
        </div>

        {/* Side rail — Booking card on top, Queue card below */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div ref={bookingCardRef}>
            <BookingCard
              mode={bookingMode}
              setMode={setBookingMode}
              initialPatientId={initialPatientId ? Number(initialPatientId) : undefined}
              onBooked={(id) => router.push(`/healthworker/appointments/${id}`)}
              onBookQueueEntry={focusBookingCard}
              onQueueEntryBooked={() => queueQ.refetch()}
            />
          </div>
          <QueueCard
            panel={queuePanel}
            setPanel={setQueuePanel}
            pending={pending}
            loading={queueQ.isLoading}
            error={queueQ.error}
            refetch={() => queueQ.refetch()}
            onBookEntry={focusBookingCard}
            activeBookingEntryId={
              bookingMode.kind === "from-queue" ? bookingMode.entry.id : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

// ── Queue card ───────────────────────────────────────────────────────

function QueueCard({
  panel,
  setPanel,
  pending,
  loading,
  error,
  refetch,
  onBookEntry,
  activeBookingEntryId,
}: {
  panel: QueuePanel;
  setPanel: (p: QueuePanel) => void;
  pending: QueueEntry[];
  loading: boolean;
  error: ApiError | null | undefined;
  refetch: () => void;
  onBookEntry: (entry: QueueEntry) => void;
  /** Highlight the row currently being booked in the booking card. */
  activeBookingEntryId?: number;
}) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base tracking-[-0.01em]">
            {t("pages.healthworker.appointments.queueTitle")}
          </h2>
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            {t("pages.healthworker.appointments.queuePending", { count: pending.length })}
          </p>
        </div>
        {panel.kind === "list" && (
          <Button size="sm" onClick={() => setPanel({ kind: "add" })}>
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
        )}
      </div>

      {panel.kind === "add" ? (
        <SubFrame title={t("pages.healthworker.appointments.addToQueue")} onBack={() => setPanel({ kind: "list" })}>
          <QueueEntryForm
            onCreated={() => {
              setPanel({ kind: "list" });
              refetch();
            }}
            onCancel={() => setPanel({ kind: "list" })}
          />
        </SubFrame>
      ) : panel.kind === "cancel" ? (
        <SubFrame title={t("pages.healthworker.appointments.cancelEntry")} onBack={() => setPanel({ kind: "list" })}>
          <CancelQueueEntryForm
            entry={panel.entry}
            onCancelled={() => {
              setPanel({ kind: "list" });
              refetch();
            }}
            onClose={() => setPanel({ kind: "list" })}
          />
        </SubFrame>
      ) : error ? (
        <ApiErrorBanner error={error} onRetry={refetch} />
      ) : loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-[var(--muted-foreground)]">
          <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}
        </div>
      ) : pending.length === 0 ? (
        <EmptyState
          Icon={Inbox}
          title={t("pages.healthworker.appointments.queueClearTitle")}
          description={t("pages.healthworker.appointments.queueClearDescription")}
          action={
            <Button size="sm" onClick={() => setPanel({ kind: "add" })}>
              <Plus className="h-4 w-4" />
              {t("pages.healthworker.appointments.addEntry")}
            </Button>
          }
          className="py-6"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((e) => (
            <div
              key={e.id}
              className={
                activeBookingEntryId === e.id
                  ? "rounded-2xl ring-2 ring-[var(--accent)] ring-offset-1"
                  : ""
              }
            >
              <QueueRow
                entry={e}
                compact
                onBook={() => onBookEntry(e)}
                onCancel={() => setPanel({ kind: "cancel", entry: e })}
              />
            </div>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Booking card ─────────────────────────────────────────────────────

function BookingCard({
  mode,
  setMode,
  initialPatientId,
  onBooked,
  onBookQueueEntry,
  onQueueEntryBooked,
}: {
  mode: BookingMode;
  setMode: (m: BookingMode) => void;
  initialPatientId?: number;
  onBooked: (appointmentId: number) => void;
  onBookQueueEntry: (entry: QueueEntry) => void;
  /** Fires when a from-queue booking succeeds — workspace refetches the queue. */
  onQueueEntryBooked: () => void;
}) {
  const { t } = useI18n();
  const doctors = useDoctorList({ active: true });
  const create = useCreateAppointment();
  const isFromQueue = mode.kind === "from-queue";
  // Always create the hook — it's keyed by id but only called in from-queue mode.
  const book = useBookQueueEntry(isFromQueue ? mode.entry.id : 0);

  // When in from-queue mode, lock the patient and look up its name for the chip.
  const queuePatientQ = usePatient(isFromQueue ? mode.entry.patientId : null, {
    enabled: isFromQueue,
  });

  // Patient context (existing appointments + queue entries) — only meaningful
  // in fresh mode where the HW is choosing a patient. In from-queue mode we
  // don't show it (the queue entry is already the context).
  const [activePatientId, setActivePatientId] = useState<number | undefined>(initialPatientId);
  const submitError = create.error ?? book.error;
  const error = submitError ? explainError(submitError.error) : null;
  const submitting = create.isPending || book.isPending;

  const handleSubmit = (v: { patientId: number; doctorId: number; scheduledAt: string }) => {
    if (mode.kind === "from-queue") {
      // patientId from the queue entry is implicit on the server side.
      book.mutate(
        { doctorId: v.doctorId, scheduledAt: v.scheduledAt },
        {
          onSuccess: (res) => {
            setMode({ kind: "fresh" });
            onQueueEntryBooked();
            onBooked(res.appointment.id);
          },
        },
      );
    } else {
      create.mutate(v, { onSuccess: (appt) => onBooked(appt.id) });
    }
  };

  // Pre-fill values for from-queue mode. AppointmentForm reads these on mount;
  // we use a `key` so switching between fresh ↔ from-queue remounts the form.
  const formKey = mode.kind === "from-queue" ? `q-${mode.entry.id}` : "fresh";
  const defaultPatientId = mode.kind === "from-queue" ? mode.entry.patientId : initialPatientId;
  const defaultDoctorId =
    mode.kind === "from-queue" ? (mode.entry.preferredDoctorId ?? undefined) : undefined;
  const defaultScheduledAt =
    mode.kind === "from-queue" && mode.entry.targetDate
      ? `${mode.entry.targetDate}T09:00`
      : undefined;
  const queuePatientLabel = queuePatientQ.data
    ? `${fullName(queuePatientQ.data.patient)} · #${queuePatientQ.data.patient.id}`
    : t("forms.patientId", {
        id: mode.kind === "from-queue" ? mode.entry.patientId : "",
      });

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base tracking-[-0.01em]">
          {mode.kind === "from-queue"
            ? t("pages.healthworker.appointments.bookQueueEntry")
            : t("pages.healthworker.appointments.bookAppointment")}
        </h2>
      </div>

      {mode.kind === "from-queue" && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 text-xs">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--accent)]">
              {t("pages.healthworker.appointments.bookingFromQueue", { id: mode.entry.id })}
            </div>
            <div className="mt-0.5 font-medium">{queuePatientLabel}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMode({ kind: "fresh" })}
            aria-label={t("pages.healthworker.appointments.switchToFreshBooking")}
            title={t("pages.healthworker.appointments.switchToFreshBooking")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <AppointmentForm
        key={formKey}
        doctors={doctors.data ?? []}
        defaultPatientId={defaultPatientId}
        defaultDoctorId={defaultDoctorId}
        defaultScheduledAt={defaultScheduledAt}
        hidePatientPicker={mode.kind === "from-queue"}
        patientLabel={mode.kind === "from-queue" ? queuePatientLabel : undefined}
        submitting={submitting}
        errorMessage={error}
        onSubmit={handleSubmit}
        onPatientChange={mode.kind === "fresh" ? (id) => setActivePatientId(id) : undefined}
        submitLabel={
          mode.kind === "from-queue"
            ? t("pages.healthworker.appointments.bookFromQueue")
            : t("pages.healthworker.appointments.bookAppointment")
        }
      />

      {mode.kind === "fresh" && activePatientId && (
        <PatientContext patientId={activePatientId} onBookQueueEntry={onBookQueueEntry} />
      )}
    </Card>
  );
}

// ── Shared sub-frame ─────────────────────────────────────────────────

function SubFrame({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {title}
        </h3>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowDown className="h-4 w-4 rotate-90" /> {t("pages.healthworker.appointments.backToList")}
        </Button>
      </div>
      {children}
    </div>
  );
}

// ── Calendar legend ──────────────────────────────────────────────────

function Legend() {
  const { t } = useI18n();
  // The calendar collapses the 7 backend statuses into 3 buckets (plus a
  // muted cancelled). Modals still surface the precise status.
  const items: Array<{ key: string; label: string; swatch: string }> = [
    {
      key: "upcoming",
      label: t("pages.healthworker.appointments.upcoming"),
      swatch: "bg-slate-200",
    },
    { key: "live", label: t("pages.healthworker.appointments.live"), swatch: "bg-[var(--accent)]" },
    { key: "done", label: t("pages.healthworker.appointments.done"), swatch: "bg-emerald-200" },
    {
      key: "cancelled",
      label: t("pages.healthworker.appointments.cancelled"),
      swatch: "bg-slate-100 line-through text-slate-400",
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--muted-foreground)]">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-2">
          <span className={`h-2 w-3 rounded-sm ${it.swatch}`} />
          <span className="font-mono uppercase tracking-[0.12em]">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
