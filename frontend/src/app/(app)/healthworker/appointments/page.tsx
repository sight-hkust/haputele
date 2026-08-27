"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, CalendarClock, Inbox, Loader2, Plus, X } from "lucide-react";

import { AppointmentForm } from "@/components/healthworker/appointment-form";
import { AppointmentRow } from "@/components/healthworker/appointment-row";
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
import { appDayWindow, appToday, fullName } from "@/lib/format";
import type { CalendarAppointment, QueueEntry } from "@/types/api";

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

// Which list the rail's lower card is showing. Each keeps its own state while
// hidden, so switching tabs never discards a half-filled queue form.
type RailTab = "appointments" | "queue";

export default function AppointmentsWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <Workspace />
    </Suspense>
  );
}

function Workspace() {
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
  const [railTab, setRailTab] = useState<RailTab>("appointments");

  // Selecting a row in the appointments list rings that block and jumps the
  // calendar to it. Deliberately not a navigation: the calendar already opens
  // the detail page on click, so list = locate, calendar = open.
  const [focused, setFocused] = useState<{ id: number; at: string } | null>(null);

  // What's actually scheduled, soonest first. Anchored to the start of today
  // rather than "now" so this morning's appointment is still listed while it
  // is happening — that is exactly when staff go looking for it.
  const upcoming = useMemo(() => {
    const from = appDayWindow(appToday()).fromISO;
    return (apptList.data ?? [])
      .filter((a) => a.status !== "cancelled" && a.scheduledAt >= from)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [apptList.data]);

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
        label="Workspace"
        title="Calendar"
        highlight="& queue."
        subtitle="Calendar always visible. Pending queue and booking sit alongside — click 'Book this' on any queue entry to fill the booking card."
      />

      <Legend />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_32rem]">
        {/* Calendar (main) */}
        <div className="min-w-0">
          {apptList.error ? (
            <ApiErrorBanner error={apptList.error} onRetry={() => apptList.refetch()} />
          ) : apptList.isLoading ? (
            <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
          ) : (
            <AppointmentCalendar
              appointments={apptList.data ?? []}
              focusId={focused?.id ?? null}
              focusAt={focused?.at ?? null}
            />
          )}
        </div>

        {/* Side rail — Booking card on top, tabbed list below.
            Fixed height (not max-h) so the list below can flex into whatever
            space the booking card leaves; overflow-y-auto stays as a safety
            valve for the tall from-queue booking form. */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <div ref={bookingCardRef} className="lg:shrink-0">
            <BookingCard
              mode={bookingMode}
              setMode={setBookingMode}
              initialPatientId={initialPatientId ? Number(initialPatientId) : undefined}
              onBooked={(id) => router.push(`/healthworker/appointments/${id}`)}
              onBookQueueEntry={focusBookingCard}
              onQueueEntryBooked={() => queueQ.refetch()}
            />
          </div>
          <RailCard
            tab={railTab}
            setTab={setRailTab}
            appointments={upcoming}
            appointmentsLoading={apptList.isLoading}
            focusedId={focused?.id ?? null}
            onFocusAppointment={(a) => setFocused({ id: a.id, at: a.scheduledAt })}
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

// ── Rail card: Appointments | Queue ──────────────────────────────────
//
// One card, two lists. Queue keeps its sub-panel state while hidden, so an
// half-finished "Add to queue" form survives a look at the appointments tab.

function RailTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-[0.12em] transition-colors ${
        active
          ? "bg-[var(--card)] text-[var(--accent)] shadow-sm"
          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function RailCard({
  tab,
  setTab,
  appointments,
  appointmentsLoading,
  focusedId,
  onFocusAppointment,
  panel,
  setPanel,
  pending,
  loading,
  error,
  refetch,
  onBookEntry,
  activeBookingEntryId,
}: {
  tab: RailTab;
  setTab: (t: RailTab) => void;
  appointments: CalendarAppointment[];
  appointmentsLoading: boolean;
  focusedId: number | null;
  onFocusAppointment: (a: CalendarAppointment) => void;
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
  return (
    <Card className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-[var(--muted)] p-1">
          <RailTabButton active={tab === "appointments"} onClick={() => setTab("appointments")}>
            Appointments
          </RailTabButton>
          <RailTabButton active={tab === "queue"} onClick={() => setTab("queue")}>
            Queue
          </RailTabButton>
        </div>
        {tab === "queue" && panel.kind === "list" && (
          <Button size="sm" onClick={() => setPanel({ kind: "add" })}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        )}
      </div>

      <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {tab === "appointments"
          ? `${appointments.length} upcoming · soonest first`
          : `${pending.length} pending · urgent first`}
      </p>

      {tab === "appointments" ? (
        <AppointmentsPanel
          appointments={appointments}
          loading={appointmentsLoading}
          focusedId={focusedId}
          onFocus={onFocusAppointment}
        />
      ) : (
        <QueuePanelBody
          panel={panel}
          setPanel={setPanel}
          pending={pending}
          loading={loading}
          error={error}
          refetch={refetch}
          onBookEntry={onBookEntry}
          activeBookingEntryId={activeBookingEntryId}
        />
      )}
    </Card>
  );
}

function AppointmentsPanel({
  appointments,
  loading,
  focusedId,
  onFocus,
}: {
  appointments: CalendarAppointment[];
  loading: boolean;
  focusedId: number | null;
  onFocus: (a: CalendarAppointment) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-[var(--muted-foreground)]">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
      </div>
    );
  }
  if (appointments.length === 0) {
    return (
      <EmptyState
        Icon={CalendarClock}
        title="Nothing scheduled"
        description="No appointments booked from today onwards."
        className="py-6"
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2 lg:min-h-[12rem] lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:p-1">
      {appointments.map((a) => (
        <AppointmentRow
          key={a.id}
          appointment={a}
          selected={focusedId === a.id}
          onSelect={() => onFocus(a)}
        />
      ))}
    </ul>
  );
}

// The queue's own body, unchanged apart from losing the header the rail card
// now owns.
function QueuePanelBody({
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
  activeBookingEntryId?: number;
}) {
  return (
    <>
      {panel.kind === "add" ? (
        <SubFrame title="Add to queue" onBack={() => setPanel({ kind: "list" })}>
          <QueueEntryForm
            onCreated={() => {
              setPanel({ kind: "list" });
              refetch();
            }}
            onCancel={() => setPanel({ kind: "list" })}
          />
        </SubFrame>
      ) : panel.kind === "cancel" ? (
        <SubFrame title="Cancel this entry?" onBack={() => setPanel({ kind: "list" })}>
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
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : pending.length === 0 ? (
        <EmptyState
          Icon={Inbox}
          title="Queue is clear"
          description="No one is waiting to be scheduled."
          action={
            <Button size="sm" onClick={() => setPanel({ kind: "add" })}>
              <Plus className="h-4 w-4" />
              Add entry
            </Button>
          }
          className="py-6"
        />
      ) : (
        <ul className="flex flex-col gap-2 lg:min-h-[12rem] lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:p-1">
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
    </>
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
    : `Patient #${mode.kind === "from-queue" ? mode.entry.patientId : ""}`;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base tracking-[-0.01em]">
          {mode.kind === "from-queue" ? "Book queue entry" : "Book appointment"}
        </h2>
      </div>

      {mode.kind === "from-queue" && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 text-xs">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--accent)]">
              Booking from queue · #{mode.entry.id}
            </div>
            <div className="mt-0.5 font-medium">{queuePatientLabel}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMode({ kind: "fresh" })}
            aria-label="Switch to fresh booking"
            title="Switch to fresh booking"
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
        submitLabel={mode.kind === "from-queue" ? "Book from queue" : "Book appointment"}
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
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {title}
        </h3>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowDown className="h-4 w-4 rotate-90" /> Back
        </Button>
      </div>
      {children}
    </div>
  );
}

// ── Calendar legend ──────────────────────────────────────────────────

function Legend() {
  // The calendar collapses the 7 backend statuses into 3 buckets (plus a
  // muted cancelled). Modals still surface the precise status.
  const items: Array<{ key: string; label: string; swatch: string }> = [
    { key: "upcoming", label: "Upcoming", swatch: "bg-slate-200" },
    { key: "live", label: "Live", swatch: "bg-[var(--accent)]" },
    { key: "done", label: "Done", swatch: "bg-emerald-200" },
    { key: "cancelled", label: "Cancelled", swatch: "bg-slate-100 line-through text-slate-400" },
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
