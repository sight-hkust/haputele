"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  HeartPulse,
  PhoneOff,
  PlayCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { Textarea } from "@/components/primitives/select";
import { StatusBadge } from "@/components/primitives/status-badge";
import { SignaturePad, type SignaturePadHandle } from "@/components/consent/signature-pad";
import { AttachmentsPanel } from "@/components/healthworker/attachments-panel";
import { MASTER_CONSENT_BODY, SESSION_CONSENT_BODY } from "@/components/healthworker/master-consent-text";
import { VitalsForm } from "@/components/healthworker/vitals-form";
import { MeetingModal } from "@/components/meeting/meeting-modal";
import { ApiError } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { parseVitalsValidationError } from "@/lib/vitals";
import {
  useCancelAppointment,
  useEndMeeting,
  useGetSessionConsent,
  useMeetingToken,
  useReConsent,
  useRecordSessionConsent,
  useStartMeeting,
  useUpsertPreconsult,
} from "@/lib/use-api";
import { fmtDateTime, fmtTime } from "@/lib/format";
import type { AppointmentDetail } from "@/types/api";

// Status helpers — derive what's actionable in the current state. The §11
// state machine is enforced server-side; we mirror it here so the UI doesn't
// surface buttons that would just 409.
const PRE_MEETING_STATES = new Set(["scheduled", "consent_pending", "data_collection"]);

export function AppointmentCockpit({ data }: { data: AppointmentDetail }) {
  const { appointment, patient, masterConsentStatus, preconsult, consultation } = data;
  const aptId = appointment.id;

  const sessionConsentQ = useGetSessionConsent(aptId);
  const sessionConsent = sessionConsentQ.data ?? null;
  const sessionConsented = !!(sessionConsent?.agreed && !sessionConsent.revokedAt);
  // Distinguish "not consented" from "still loading the consent status" — a
  // consent_pending appointment always already has consent, so we mustn't flash
  // the "record consent first" notice before the query resolves.
  const sessionConsentResolved = !sessionConsentQ.isPending;

  return (
    <div className="flex flex-col gap-6">
      {/* Master-consent gate — always shown so it's never out of sight. */}
      <MasterConsentGate
        status={masterConsentStatus}
        patientId={appointment.patientId}
        patientName={patient ? `${patient.given} ${patient.family}` : ""}
        masterIsRevocable={!!patient?.masterConsentId}
      />

      {/* Session consent — surfaces during pre-meeting states; collapses once captured */}
      {PRE_MEETING_STATES.has(appointment.status) && (
        <SessionConsentStep
          appointmentId={aptId}
          consented={sessionConsented}
          consentTime={sessionConsent?.capturedAt ?? null}
          masterAvailable={masterConsentStatus === "ok"}
        />
      )}

      {/* Vitals — editable in consent_pending / data_collection; read-only after */}
      <VitalsStep
        appointmentId={aptId}
        editable={appointment.status === "consent_pending" || appointment.status === "data_collection"}
        sessionConsented={sessionConsented}
        sessionConsentResolved={sessionConsentResolved}
        preconsult={preconsult}
        currentStatus={appointment.status}
      />

      {/* Photo attachments — FEEDBACK §3. Available pre-meeting through awaiting_notes. */}
      <AttachmentsPanel
        appointmentId={aptId}
        status={appointment.status}
      />

      {/* Meeting — start in data_collection, end in in_progress */}
      <MeetingStep appointmentId={aptId} status={appointment.status} />

      {/* Awaiting-doctor banner */}
      {appointment.status === "awaiting_notes" && (
        <Card variant="elevated" className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-violet-100 p-2">
              <FileText className="h-5 w-5 text-violet-700" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.01em]">Awaiting doctor&rsquo;s notes</h3>
              <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
                The meeting has ended. The assigned doctor is writing up the consultation. The
                prescription will be available here once they sign and submit.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Prescription PDF — completed only */}
      {appointment.status === "completed" && consultation && (
        <PrescriptionViewer appointmentId={aptId} />
      )}

      {/* Cancel — anywhere except completed/cancelled */}
      {appointment.status !== "completed" && appointment.status !== "cancelled" && (
        <CancelAction
          appointmentId={aptId}
          status={appointment.status}
          doctorId={appointment.doctorId}
          scheduledAt={appointment.scheduledAt}
        />
      )}

      {/* Cancelled banner */}
      {appointment.status === "cancelled" && (
        <Card className="border-rose-200 bg-rose-50/40 p-6">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 text-rose-600" />
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.01em]">Appointment cancelled</h3>
              {appointment.cancellationReason && (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Reason: {appointment.cancellationReason}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Sub-steps ────────────────────────────────────────────────────────

function MasterConsentGate({
  status,
  patientId,
  patientName,
  masterIsRevocable,
}: {
  status: "ok" | "needs_reconsent";
  patientId: number;
  patientName: string;
  masterIsRevocable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const reConsent = useReConsent(patientId);

  const closeAndReset = () => {
    setOpen(false);
    padRef.current?.clear();
    setSignatureEmpty(true);
  };

  const submitAgreed = () => {
    const sig = padRef.current?.toDataURL() ?? null;
    if (!sig) return;
    reConsent.mutate(
      { agreed: true, signatureImage: sig },
      { onSuccess: closeAndReset },
    );
  };

  if (status === "ok") {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="flex-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              Master consent
            </span>
            <p className="text-sm font-medium">Active for {patientName || "this patient"}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
          <div className="flex-1">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-amber-900">
              Master consent needs to be re-recorded
            </h3>
            <p className="mt-1 text-sm text-amber-800/80">
              {masterIsRevocable
                ? "The patient's previous consent has been revoked, or the existing record is unsigned. Re-record with a signature before any new data is collected."
                : "No active master consent on this patient. Re-record with a signature before any new data is collected."}
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            Re-record
          </Button>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => !reConsent.isPending && closeAndReset()}
        title="Re-record master consent"
        description="Read the consent text aloud and ask the patient to sign."
      >
        <p className="mb-4 max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm leading-relaxed text-[var(--muted-foreground)]">
          {MASTER_CONSENT_BODY}
        </p>
        <SignaturePad
          ref={padRef}
          onChange={setSignatureEmpty}
          disabled={reConsent.isPending}
          label="Patient signature"
        />
        {reConsent.error && (
          <ErrorBanner className="mt-3">
            {explainError(reConsent.error.error)}
          </ErrorBanner>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={closeAndReset} disabled={reConsent.isPending}>
            Patient declined
          </Button>
          <Button onClick={submitAgreed} disabled={reConsent.isPending || signatureEmpty}>
            {reConsent.isPending ? "Saving…" : "Patient agreed"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function SessionConsentStep({
  appointmentId,
  consented,
  consentTime,
  masterAvailable,
}: {
  appointmentId: number;
  consented: boolean;
  consentTime: string | null;
  masterAvailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const recordConsent = useRecordSessionConsent(appointmentId);

  const closeAndReset = () => {
    setOpen(false);
    padRef.current?.clear();
    setSignatureEmpty(true);
  };

  const submitAgreed = () => {
    const sig = padRef.current?.toDataURL() ?? null;
    if (!sig) return;
    recordConsent.mutate(
      { agreed: true, signatureImage: sig },
      { onSuccess: closeAndReset },
    );
  };

  const submitDeclined = () => {
    recordConsent.mutate({ agreed: false }, { onSuccess: closeAndReset });
  };

  if (consented) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="flex-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              Session consent
            </span>
            <p className="text-sm font-medium">
              Patient consented{consentTime ? ` at ${fmtTime(consentTime)}` : ""}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card variant="elevated" className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-2 shadow-accent">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">Capture session consent</h3>
            <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
              Read the consent statement to the patient and capture their signature before entering vitals.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => setOpen(true)} disabled={!masterAvailable}>
                Record consent
              </Button>
              {!masterAvailable && (
                <span className="self-center font-mono text-[11px] uppercase tracking-[0.12em] text-amber-700">
                  Master consent required first
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => !recordConsent.isPending && closeAndReset()}
        title="Record session consent"
      >
        <p className="mb-4 max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm leading-relaxed text-[var(--muted-foreground)]">
          {SESSION_CONSENT_BODY}
        </p>
        <SignaturePad
          ref={padRef}
          onChange={setSignatureEmpty}
          disabled={recordConsent.isPending}
          label="Patient signature"
        />
        {recordConsent.error && (
          <ErrorBanner className="mt-3">
            {explainError(recordConsent.error.error)}
          </ErrorBanner>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={submitDeclined} disabled={recordConsent.isPending}>
            Patient declined
          </Button>
          <Button
            onClick={submitAgreed}
            disabled={recordConsent.isPending || signatureEmpty}
          >
            {recordConsent.isPending ? "Saving…" : "Patient agreed"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function VitalsStep({
  appointmentId,
  editable,
  sessionConsented,
  sessionConsentResolved,
  preconsult,
  currentStatus,
}: {
  appointmentId: number;
  editable: boolean;
  sessionConsented: boolean;
  sessionConsentResolved: boolean;
  preconsult: AppointmentDetail["preconsult"];
  currentStatus: string;
}) {
  const upsert = useUpsertPreconsult(appointmentId);

  // Briefly confirm a successful save so the HW knows the vitals were stored —
  // there's no other signal once the form re-renders with the same values.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!upsert.isSuccess) return;
    setSavedAt(fmtTime(new Date().toISOString()));
    const t = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [upsert.isSuccess, upsert.data]);

  // Split the mutation error: a 422 maps onto individual inputs; any other
  // conflict (locked, consent revoked mid-flow) becomes a single clear banner.
  // Memoised on the error instance so `fieldErrors` keeps a stable identity
  // while the error is unchanged — otherwise the form's setError effect would
  // re-fire every render and re-flag a field the HW is mid-way through fixing.
  // Kept above the early return below so the hook order is stable every render.
  const err = upsert.error as ApiError | null;
  const { fieldErrors, banner } = useMemo(() => {
    if (!err) return { fieldErrors: undefined, banner: null as string | null };
    if (err.status === 422) {
      const p = parseVitalsValidationError(err);
      const b =
        p.formError ??
        (Object.keys(p.fieldErrors).length === 0 ? explainError(err.error) : null);
      return { fieldErrors: p.fieldErrors, banner: b };
    }
    return { fieldErrors: undefined, banner: explainError(err.error) };
  }, [err]);

  if (currentStatus === "cancelled") return null;

  const showLockedNotice = !editable && !!preconsult;
  // Only once we know consent is genuinely absent — not merely still loading.
  const showWaitNotice = editable && sessionConsentResolved && !sessionConsented;

  return (
    <Card variant="elevated" className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-[var(--accent)]/10 p-2">
          <HeartPulse className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em]">Preconsult vitals</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {showLockedNotice
              ? "Locked — the meeting has started or already concluded."
              : showWaitNotice
                ? "Session consent is needed before vitals can be entered."
                : preconsult
                  ? "Update before the meeting starts."
                  : "Capture height, weight, BP, pulse, temperature."}
          </p>
        </div>
      </div>

      {/* Gating is stated up front, in colour, so the HW understands *why* the
          form is read-only rather than finding a dead Save button. */}
      {showWaitNotice && (
        <ErrorBanner tone="amber" className="mb-4">
          Record the patient&rsquo;s session consent above before entering vitals.
        </ErrorBanner>
      )}
      {showLockedNotice && (
        <ErrorBanner tone="amber" className="mb-4">
          These vitals are locked — the meeting has started or concluded, so they can no longer be
          edited.
        </ErrorBanner>
      )}
      {savedAt && (
        <div
          role="status"
          className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Vitals saved at {savedAt}.</span>
        </div>
      )}

      <VitalsForm
        initial={preconsult ?? null}
        submitting={upsert.isPending}
        disabled={!editable || !sessionConsented}
        errorMessage={banner}
        serverFieldErrors={fieldErrors}
        onSubmit={(v) => upsert.mutate(v)}
      />
    </Card>
  );
}

function MeetingStep({
  appointmentId,
  status,
}: {
  appointmentId: number;
  status: string;
}) {
  const startMeeting = useStartMeeting(appointmentId);
  const endMeeting = useEndMeeting(appointmentId);
  const meetingToken = useMeetingToken(appointmentId);
  const [creds, setCreds] = useState<{ token: string; serverUrl: string } | null>(null);

  if (status !== "data_collection" && status !== "in_progress") return null;

  const handleStart = () =>
    startMeeting.mutate(undefined, {
      onSuccess: (res) => setCreds({ token: res.token, serverUrl: res.serverUrl }),
    });

  const handleReopen = () =>
    meetingToken.mutate(undefined, {
      onSuccess: (res) => setCreds({ token: res.token, serverUrl: res.serverUrl }),
    });

  const apiError = (startMeeting.error ?? endMeeting.error ?? meetingToken.error) as ApiError | null;

  return (
    <>
      <Card variant="elevated" className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-2 shadow-accent">
            {status === "in_progress" ? (
              <PhoneOff className="h-5 w-5 text-white" />
            ) : (
              <PlayCircle className="h-5 w-5 text-white" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">
              {status === "in_progress" ? "Meeting in progress" : "Start the meeting"}
            </h3>
            <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
              {status === "in_progress"
                ? "End the meeting once the doctor signals they're done. Marks the appointment ready for notes."
                : "Opens the consultation video call and moves the appointment to “in progress”."}
            </p>
            {apiError && (
              <ErrorBanner className="mt-3">{explainError(apiError.error)}</ErrorBanner>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {status === "data_collection" && (
                <Button onClick={handleStart} disabled={startMeeting.isPending}>
                  <PlayCircle className="h-4 w-4" />
                  {startMeeting.isPending ? "Starting…" : "Start meeting"}
                </Button>
              )}
              {status === "in_progress" && (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleReopen}
                    disabled={meetingToken.isPending || !!creds}
                  >
                    <PlayCircle className="h-4 w-4" />
                    {meetingToken.isPending ? "Reconnecting…" : "Re-open call"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => endMeeting.mutate()}
                    disabled={endMeeting.isPending}
                  >
                    <PhoneOff className="h-4 w-4" />
                    {endMeeting.isPending ? "Ending…" : "End meeting"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>
      {creds && (
        <MeetingModal
          token={creds.token}
          serverUrl={creds.serverUrl}
          onClose={() => setCreds(null)}
        />
      )}
    </>
  );
}

function PrescriptionViewer({ appointmentId }: { appointmentId: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hand-rolled fetch so we can manage the object URL lifecycle (revoke
  // on unmount) — usePrescriptionPdf would keep the blob in the cache.
  // GET, so the session cookie alone authorises this; no CSRF echo.
  useEffect(() => {
    let revoked = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "/api"}/appointments/${appointmentId}/summary.pdf`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`pdf_${res.status}`);
        const blob = await res.blob();
        if (revoked) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } catch {
        if (!revoked) setError("Could not load the prescription PDF.");
      }
    })();
    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [appointmentId]);

  return (
    <Card variant="elevated" className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2">
            <FileText className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-[-0.01em]">Prescription</h3>
            <p className="text-xs text-[var(--muted-foreground)]">Signed and locked. §1.7 compliant.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {url && (
            <>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-medium hover:border-[var(--accent)]/30 hover:bg-[var(--muted)]/60"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
              <a
                href={url}
                download={`prescription-${appointmentId}.pdf`}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] px-4 text-sm font-medium text-white shadow-sm hover:shadow-accent-lg"
              >
                Download
              </a>
            </>
          )}
        </div>
      </div>
      <div className="bg-[var(--muted)]/30">
        {error ? (
          <div className="p-8 text-center text-sm text-rose-600">{error}</div>
        ) : url ? (
          <iframe src={url} className="h-[680px] w-full" title={`Prescription for appointment ${appointmentId}`} />
        ) : (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            Loading prescription…
          </div>
        )}
      </div>
    </Card>
  );
}

function CancelAction({
  appointmentId,
  status,
  doctorId,
  scheduledAt,
}: {
  appointmentId: number;
  status: string;
  doctorId: number;
  scheduledAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // Opt-in: when checked, the cancel call also creates a fresh queue entry
  // so this patient stays visible in the backlog and the HW can re-book later.
  const [requeue, setRequeue] = useState(false);
  const [rqNotes, setRqNotes] = useState("");
  const [rqPriority, setRqPriority] = useState<"routine" | "urgent">("routine");
  // Default the new entry's preferred doctor + target date to the cancelled
  // appointment's values — typically what the HW wants.
  const targetDateDefault = scheduledAt.slice(0, 10);
  const [rqTargetDate, setRqTargetDate] = useState<string>(targetDateDefault);
  const cancel = useCancelAppointment(appointmentId);

  const submit = () =>
    cancel.mutate(
      {
        reason: reason.trim() || undefined,
        requeue: requeue
          ? {
              source: "walk_in",
              priority: rqPriority,
              preferredDoctorId: doctorId,
              targetDate: rqTargetDate || null,
              notes: rqNotes.trim() || null,
            }
          : undefined,
      },
      { onSuccess: () => setOpen(false) },
    );

  return (
    <>
      <div className="flex justify-end pt-2 text-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)] underline-offset-4 transition-colors hover:text-rose-600 hover:underline"
        >
          Cancel this appointment
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => !cancel.isPending && setOpen(false)}
        title="Cancel this appointment?"
        description={
          status === "in_progress"
            ? "The meeting is currently in progress. Cancelling will not retroactively void any vitals already captured."
            : "This action will move the appointment to cancelled. It can't be reopened."
        }
      >
        <div className="flex flex-col gap-3">
          <label className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            Reason (optional)
          </label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Patient requested reschedule"
          />

          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requeue}
              onChange={(e) => setRequeue(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] focus-visible:ring-[var(--ring)]"
            />
            <span>Add a new queue entry for this patient</span>
          </label>
          {requeue && (
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                    Priority
                  </span>
                  <select
                    value={rqPriority}
                    onChange={(e) => setRqPriority(e.target.value as "routine" | "urgent")}
                    className="h-10 rounded-lg border border-[var(--border)] bg-transparent px-3 text-sm"
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                    Target week
                  </span>
                  <input
                    type="date"
                    value={rqTargetDate}
                    onChange={(e) => setRqTargetDate(e.target.value)}
                    className="h-10 rounded-lg border border-[var(--border)] bg-transparent px-3 text-sm"
                  />
                </div>
              </div>
              <Textarea
                rows={2}
                value={rqNotes}
                onChange={(e) => setRqNotes(e.target.value)}
                placeholder="Notes for the new entry — e.g. 'wants to reschedule next week'"
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Will be added with the same doctor as preferred. The original entry (if any) is auto-closed.
              </p>
            </div>
          )}

          {cancel.error && (
            <ErrorBanner>{explainError((cancel.error as ApiError).error)}</ErrorBanner>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={cancel.isPending}>
              Keep appointment
            </Button>
            <Button variant="destructive" onClick={submit} disabled={cancel.isPending}>
              {cancel.isPending
                ? "Cancelling…"
                : requeue
                  ? "Cancel and re-queue"
                  : "Cancel appointment"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// Header component — re-exported so the page can show patient/doctor up top
export function CockpitHeader({
  data,
  doctorName,
}: {
  data: AppointmentDetail;
  doctorName: string;
}) {
  const { appointment, patient } = data;
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            Appointment #{appointment.id}
          </span>
          <h2 className="mt-1 font-display text-2xl tracking-[-0.01em]">
            {patient ? `${patient.given} ${patient.family}` : "Patient"}
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">{doctorName}</p>
          <p className="mt-2 font-mono text-xs text-[var(--muted-foreground)]">
            Scheduled · {fmtDateTime(appointment.scheduledAt)}
          </p>
        </div>
        <StatusBadge status={appointment.status} className="self-start" />
      </div>
    </Card>
  );
}
