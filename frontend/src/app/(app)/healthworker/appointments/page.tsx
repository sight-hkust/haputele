"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, Inbox, Loader2, Plus, X } from "lucide-react";

import { AppointmentForm } from "@/components/healthworker/appointment-form";
import { AppointmentWorklist } from "@/components/healthworker/appointment-worklist";
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
import type { QueueEntry } from "@/types/api";

type BookingMode = { kind: "fresh" } | { kind: "from-queue"; entry: QueueEntry };

type QueuePanel = { kind: "list" } | { kind: "add" } | { kind: "cancel"; entry: QueueEntry };

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
  // Keep overdue encounters reachable; planning is not the retrieval cutoff.
  const apptList = useAppointmentList({});
  const queueQ = useQueueList({ status: "pending" });
  const [view, setView] = useState<"worklist" | "calendar" | "queue">("worklist");
  const [bookingMode, setBookingMode] = useState<BookingMode>({ kind: "fresh" });
  const [queuePanel, setQueuePanel] = useState<QueuePanel>({ kind: "list" });
  const [bookingOpened, setBookingOpened] = useState(!!initialPatientId || !!bookFromQueueParam);
  const [bookingVisible, setBookingVisible] = useState(!!initialPatientId || !!bookFromQueueParam);
  useEffect(() => {
    if (initialPatientId) {
      setBookingMode({ kind: "fresh" });
      setBookingOpened(true);
      setBookingVisible(true);
    }
  }, [initialPatientId]);
  const bookingCardRef = useRef<HTMLDivElement>(null);
  const focusBookingCard = (entry: QueueEntry) => {
    setBookingMode({ kind: "from-queue", entry });
    setBookingOpened(true);
    setBookingVisible(true);
    requestAnimationFrame(() => bookingCardRef.current?.scrollIntoView({ block: "start" }));
  };

  const queueEntryQ = useQueueEntry(bookFromQueueParam ? Number(bookFromQueueParam) : null);
  const [consumedQueueParam, setConsumedQueueParam] = useState<string | null>(null);
  useEffect(() => {
    if (bookFromQueueParam && consumedQueueParam !== bookFromQueueParam && queueEntryQ.data) {
      setBookingMode({ kind: "from-queue", entry: queueEntryQ.data });
      setBookingOpened(true);
      setBookingVisible(true);
      setConsumedQueueParam(bookFromQueueParam);
      requestAnimationFrame(() => bookingCardRef.current?.scrollIntoView({ block: "start" }));
    }
  }, [queueEntryQ.data, bookFromQueueParam, consumedQueueParam]);

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Prepare today's patients and schedule those waiting.
          </p>
        </div>
        <Button
          onClick={() => {
            setBookingOpened(true);
            setBookingVisible(!bookingVisible);
          }}
        >
          {bookingVisible ? (
            <X className="h-4 w-4" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {bookingVisible ? "Hide booking" : "Book appointment"}
        </Button>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Appointment workspace views">
        <Button
          variant={view === "worklist" ? "primary" : "secondary"}
          aria-pressed={view === "worklist"}
          onClick={() => setView("worklist")}
        >
          Today worklist
        </Button>
        <Button
          variant={view === "queue" ? "primary" : "secondary"}
          aria-pressed={view === "queue"}
          onClick={() => setView("queue")}
        >
          Pending queue
          {queueQ.error
            ? " · unavailable"
            : queueQ.isLoading
              ? " · loading"
              : queueQ.data
                ? ` (${queueQ.data.length})`
                : ""}
        </Button>
        <Button
          variant={view === "calendar" ? "primary" : "secondary"}
          aria-pressed={view === "calendar"}
          onClick={() => setView("calendar")}
        >
          Planning calendar
        </Button>
      </nav>
      {bookFromQueueParam && !queueEntryQ.data && (
        <div>
          <ApiErrorBanner error={queueEntryQ.error} onRetry={() => queueEntryQ.refetch()} />
          {queueEntryQ.isLoading && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Loading queue entry for booking…
            </p>
          )}
        </div>
      )}
      <div
        className={`grid min-w-0 gap-4 ${bookingVisible ? "xl:grid-cols-[minmax(0,1fr)_28rem]" : ""}`}
      >
        <div className="min-w-0">
          <div hidden={view !== "worklist"}>
            <AppointmentWorklist
              appointments={apptList.data}
              loading={apptList.isLoading}
              fetching={apptList.isFetching}
              error={apptList.error}
              updatedAt={apptList.dataUpdatedAt}
              onRefresh={() => apptList.refetch()}
              viewerRole="healthworker"
            />
          </div>
          <div hidden={view !== "queue"}>
            <Card className="flex flex-col gap-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Pending queue</h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={queueQ.isFetching}
                    onClick={() => queueQ.refetch()}
                  >
                    {queueQ.isFetching ? "Refreshing…" : "Refresh"}
                  </Button>
                  {queuePanel.kind === "list" && (
                    <Button onClick={() => setQueuePanel({ kind: "add" })}>
                      <Plus className="h-4 w-4" aria-hidden />
                      Add to queue
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-[var(--muted-foreground)]" role="status">
                {queueQ.error
                  ? queueQ.data
                    ? "Refresh failed · showing last loaded queue"
                    : "Queue unavailable"
                  : queueQ.isLoading
                    ? "Loading queue…"
                    : `${queueQ.data?.length ?? "—"} pending · urgent first`}
              </p>
              <QueuePanelBody
                panel={queuePanel}
                setPanel={setQueuePanel}
                pending={queueQ.data ?? []}
                loading={queueQ.isLoading}
                error={queueQ.error}
                hasData={queueQ.data !== undefined}
                refetch={() => queueQ.refetch()}
                onBookEntry={focusBookingCard}
              />
            </Card>
          </div>
          {view === "calendar" && (
            <section className="flex min-w-0 flex-col gap-3" aria-label="Planning calendar">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Plan by day, week, month or agenda.
                  {apptList.error && apptList.data ? " Showing last loaded appointments." : ""}
                </p>
                <Button
                  variant="secondary"
                  disabled={apptList.isFetching}
                  onClick={() => apptList.refetch()}
                >
                  {apptList.isFetching ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
              <ApiErrorBanner error={apptList.error} onRetry={() => apptList.refetch()} />
              {apptList.isLoading && !apptList.data ? (
                <Card className="p-4 text-sm text-[var(--muted-foreground)]">
                  Loading appointments…
                </Card>
              ) : apptList.data ? (
                <AppointmentCalendar appointments={apptList.data} />
              ) : null}
            </section>
          )}
        </div>
        <div
          ref={bookingCardRef}
          hidden={!bookingVisible}
          className="order-first min-w-0 xl:order-last"
        >
          {bookingOpened && (!bookFromQueueParam || consumedQueueParam === bookFromQueueParam) && (
            <BookingCard
              key={initialPatientId ?? "fresh"}
              mode={bookingMode}
              setMode={setBookingMode}
              initialPatientId={initialPatientId ? Number(initialPatientId) : undefined}
              onBooked={(id) => router.push(`/healthworker/appointments/${id}`)}
              onBookQueueEntry={focusBookingCard}
              onQueueEntryBooked={() => queueQ.refetch()}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function QueuePanelBody({
  panel,
  setPanel,
  pending,
  loading,
  error,
  hasData,
  refetch,
  onBookEntry,
}: {
  panel: QueuePanel;
  setPanel: (p: QueuePanel) => void;
  pending: QueueEntry[];
  loading: boolean;
  error: ApiError | null | undefined;
  hasData: boolean;
  refetch: () => void;
  onBookEntry: (entry: QueueEntry) => void;
}) {
  return (
    <>
      <ApiErrorBanner error={error} onRetry={refetch} />
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
      ) : error && !hasData ? null : loading && !hasData ? (
        <div className="flex items-center gap-2 py-4 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : pending.length === 0 && error ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Refresh to confirm the queue's current state.
        </p>
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
        <ul className="flex flex-col gap-2">
          {pending.map((e) => (
            <QueueRow
              key={e.id}
              entry={e}
              compact
              onBook={() => onBookEntry(e)}
              onCancel={() => setPanel({ kind: "cancel", entry: e })}
            />
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
        <h2 className="text-lg font-semibold">
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

      <ApiErrorBanner error={doctors.error} onRetry={() => doctors.refetch()} />
      {doctors.isLoading && (
        <p className="text-sm text-[var(--muted-foreground)]">Loading doctors…</p>
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
