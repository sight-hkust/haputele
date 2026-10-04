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
  RotateCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { FollowUpSummary } from "@/components/clinical/follow-up-summary";
import { PatientSafetyStrip } from "@/components/clinical/patient-safety-strip";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { DatePicker } from "@/components/primitives/date-picker";
import { ApiErrorBanner, ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { Textarea } from "@/components/primitives/select";
import { StatusBadge } from "@/components/primitives/status-badge";
import { SignaturePad, type SignaturePadHandle } from "@/components/consent/signature-pad";
import { AttachmentsPanel } from "@/components/healthworker/attachments-panel";
import {
  MASTER_CONSENT_BODY,
  SESSION_CONSENT_BODY,
} from "@/components/healthworker/master-consent-text";
import { MeetingModal } from "@/components/meeting/meeting-modal";
import { VitalsForm } from "@/components/healthworker/vitals-form";
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
  // Failed initial lookup is unknown, not an absent consent record.
  const sessionConsentResolved = sessionConsentQ.isSuccess || sessionConsentQ.dataUpdatedAt > 0;

  const preparing = PRE_MEETING_STATES.has(appointment.status);
  const needsMasterConsent = masterConsentStatus !== "ok";
  const needsSessionConsent = preparing && sessionConsentResolved && !sessionConsented;
  const needsVitals = appointment.status === "consent_pending";
  const masterGate = (
    <MasterConsentGate
      status={masterConsentStatus}
      patientId={appointment.patientId}
      patientName={patient ? `${patient.given} ${patient.family}` : ""}
      masterIsRevocable={!!patient?.masterConsentId}
    />
  );
  const vitals = (
    <VitalsStep
      appointmentId={aptId}
      editable={
        appointment.status === "consent_pending" || appointment.status === "data_collection"
      }
      sessionConsented={sessionConsented}
      sessionConsentResolved={sessionConsentResolved}
      preconsult={preconsult}
      currentStatus={appointment.status}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {preparing && needsMasterConsent && masterGate}
      {sessionConsentQ.error && (
        <ApiErrorBanner error={sessionConsentQ.error} onRetry={() => sessionConsentQ.refetch()} />
      )}
      {preparing && !sessionConsentResolved && (
        <Card className="p-4 text-sm text-[var(--muted-foreground)]">
          Checking the patient's session consent…
        </Card>
      )}
      {needsSessionConsent && (
        <SessionConsentStep appointmentId={aptId} masterAvailable={!needsMasterConsent} />
      )}
      {needsVitals && !needsSessionConsent && sessionConsentResolved && vitals}

      <MeetingStep
        appointmentId={aptId}
        status={appointment.status}
        canStart={!needsMasterConsent && sessionConsented && !!preconsult}
      />

      {appointment.status === "awaiting_notes" && (
        <Card variant="elevated" className="p-4">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
            <div>
              <h3 className="text-xl font-semibold">Doctor owns the next step</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                The call is finished. The assigned doctor must finish and sign the consultation.
                Your next task is to deliver the prescription and confirm follow-up once it appears
                here. This view checks for updates automatically.
              </p>
            </div>
          </div>
        </Card>
      )}

      {appointment.status === "completed" && consultation && (
        <>
          <PrescriptionViewer appointmentId={aptId} />
          <FollowUpSummary consultation={consultation} viewerRole="healthworker" />
        </>
      )}

      {appointment.status === "cancelled" && (
        <Card className="border-rose-200 bg-rose-50/40 p-4">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <h3 className="text-xl font-semibold">Appointment cancelled</h3>
              {appointment.cancellationReason && (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Reason: {appointment.cancellationReason}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <details className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--muted)]/20">
        <summary className="cursor-pointer p-4 text-sm font-semibold">
          {preparing
            ? "Preparation · saved consent and vitals"
            : "Preparation record · consent and vitals"}
        </summary>
        <div className="flex min-w-0 flex-col gap-3 px-4 pb-4">
          {(!preparing || !needsMasterConsent) && masterGate}
          {!needsSessionConsent && sessionConsentResolved && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold">Session consent</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {sessionConsented
                  ? `Patient consented${sessionConsent?.capturedAt ? ` · ${fmtDateTime(sessionConsent.capturedAt)}` : ""}`
                  : sessionConsent?.revokedAt
                    ? "Consent revoked."
                    : "No active session consent recorded."}
              </p>
            </Card>
          )}
          {!needsVitals && vitals}
        </div>
      </details>

      <AttachmentsPanel appointmentId={aptId} status={appointment.status} />

      {appointment.status !== "completed" && appointment.status !== "cancelled" && (
        <CancelAction
          appointmentId={aptId}
          status={appointment.status}
          doctorId={appointment.doctorId}
          scheduledAt={appointment.scheduledAt}
        />
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
    reConsent.mutate({ agreed: true, signatureImage: sig }, { onSuccess: closeAndReset });
  };

  if (status === "ok") {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="flex-1">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
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
          <ErrorBanner className="mt-3">{explainError(reConsent.error.error)}</ErrorBanner>
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
  masterAvailable,
}: {
  appointmentId: number;
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
    recordConsent.mutate({ agreed: true, signatureImage: sig }, { onSuccess: closeAndReset });
  };

  return (
    <>
      <Card variant="elevated" className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[var(--accent)]/10 p-2">
            <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">Capture session consent</h3>
            <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
              Read the consent statement to the patient and capture their signature before entering
              vitals.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => setOpen(true)} disabled={!masterAvailable}>
                Record consent
              </Button>
              {!masterAvailable && (
                <span className="self-center font-mono text-xs uppercase tracking-[0.12em] text-amber-700">
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
          <ErrorBanner className="mt-3">{explainError(recordConsent.error.error)}</ErrorBanner>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => recordConsent.mutate({ agreed: false }, { onSuccess: closeAndReset })}
            disabled={recordConsent.isPending}
          >
            Patient declined
          </Button>
          <Button onClick={submitAgreed} disabled={recordConsent.isPending || signatureEmpty}>
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `upsert.data` re-arms the toast when a second save stores identical values — `isSuccess` alone wouldn't flip.
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
        p.formError ?? (Object.keys(p.fieldErrors).length === 0 ? explainError(err.error) : null);
      return { fieldErrors: p.fieldErrors, banner: b };
    }
    return { fieldErrors: undefined, banner: explainError(err.error) };
  }, [err]);

  if (currentStatus === "cancelled") return null;

  if (!editable) {
    return (
      <Card className="p-4">
        <h3 className="text-base font-semibold">Saved preconsult vitals</h3>
        {preconsult ? (
          <>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Captured {fmtDateTime(preconsult.submittedAt)} · Read-only after the meeting starts.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Height", preconsult.height != null ? `${preconsult.height} cm` : "Not recorded"],
                ["Weight", preconsult.weight != null ? `${preconsult.weight} kg` : "Not recorded"],
                [
                  "Blood pressure",
                  preconsult.sysBp != null && preconsult.diaBp != null
                    ? `${preconsult.sysBp}/${preconsult.diaBp} mmHg`
                    : "Not recorded",
                ],
                ["Pulse", preconsult.pulse != null ? `${preconsult.pulse} bpm` : "Not recorded"],
                [
                  "Temperature",
                  preconsult.temperature != null
                    ? `${Number(preconsult.temperature).toFixed(1)} °C`
                    : "Not recorded",
                ],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-sm text-[var(--muted-foreground)]">{label}</dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 whitespace-pre-line break-words text-sm">
              <span className="font-semibold">Primary complaint: </span>
              {preconsult.primaryComplaint || "Not recorded"}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">No vitals recorded.</p>
        )}
      </Card>
    );
  }
  // Only once we know consent is genuinely absent — not merely still loading.
  const showWaitNotice = editable && sessionConsentResolved && !sessionConsented;

  return (
    <Card variant="elevated" className="p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-[var(--accent)]/10 p-2">
          <HeartPulse className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em]">Preconsult vitals</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {showWaitNotice
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
  canStart,
}: {
  appointmentId: number;
  status: string;
  canStart: boolean;
}) {
  const startMeeting = useStartMeeting(appointmentId);
  const endMeeting = useEndMeeting(appointmentId);
  const meetingToken = useMeetingToken(appointmentId);
  const [creds, setCreds] = useState<{ token: string; serverUrl: string } | null>(null);

  if (status !== "data_collection" && status !== "in_progress") return null;

  const apiError = (startMeeting.error ??
    endMeeting.error ??
    meetingToken.error) as ApiError | null;

  return (
    <>
      <Card variant="elevated" className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[var(--accent)]/10 p-2">
            {status === "in_progress" ? (
              <PhoneOff className="h-5 w-5 text-[var(--accent)]" />
            ) : (
              <PlayCircle className="h-5 w-5 text-[var(--accent)]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-semibold tracking-[-0.01em]">
              {status === "in_progress" ? "Live with the patient" : "Ready to meet the doctor"}
            </h3>
            <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
              {status === "in_progress"
                ? "You own the call handoff: join the patient, then end the meeting when the doctor is finished. The doctor will complete and sign the notes."
                : canStart
                  ? "Consent and vitals are saved. Start the patient call; the doctor can then join and begin the consultation."
                  : "Confirm active master and session consent and saved vitals before starting."}
            </p>
            {apiError && <ErrorBanner className="mt-3">{explainError(apiError.error)}</ErrorBanner>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {status === "data_collection" && (
                <Button
                  onClick={() =>
                    startMeeting.mutate(undefined, {
                      onSuccess: (res) => setCreds({ token: res.token, serverUrl: res.serverUrl }),
                    })
                  }
                  disabled={startMeeting.isPending || !canStart}
                >
                  <PlayCircle className="h-4 w-4" />
                  {startMeeting.isPending ? "Starting…" : "Start meeting"}
                </Button>
              )}
              {status === "in_progress" && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      meetingToken.mutate(undefined, {
                        onSuccess: (res) =>
                          setCreds({ token: res.token, serverUrl: res.serverUrl }),
                      })
                    }
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
  const [attempt, setAttempt] = useState(0);

  // Hand-rolled fetch so we can manage the object URL lifecycle (revoke
  // on unmount) — usePrescriptionPdf would keep the blob in the cache.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a retry trigger — bumping it re-runs the fetch without being read in the body.
  useEffect(() => {
    setError(null);
    setUrl(null);
    let revoked = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        let res: Response;
        try {
          res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "/api"}/appointments/${appointmentId}/summary.pdf`,
            { credentials: "include" },
          );
        } catch {
          throw new ApiError(0, "network_error");
        }
        if (!res.ok) {
          // Parse the uniform error envelope so curated copy (e.g.
          // consultation_not_ready) reaches the user instead of a generic
          // "couldn't load" over a status number it threw away.
          let code = "request_failed";
          try {
            const body = (await res.clone().json()) as { detail?: { error?: string } };
            code = body?.detail?.error ?? code;
          } catch {
            /* keep default */
          }
          throw new ApiError(
            res.status,
            code,
            undefined,
            res.headers.get("X-Request-ID") ?? undefined,
          );
        }
        const blob = await res.blob();
        if (revoked) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } catch (e) {
        if (!revoked) {
          setError(
            e instanceof ApiError
              ? explainError(e.error, "Could not load the prescription PDF.")
              : "Couldn't reach the server. Check your connection and try again.",
          );
        }
      }
    })();
    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [appointmentId, attempt]);

  return (
    <Card variant="elevated" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2">
            <FileText className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.01em]">Deliver the prescription</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Open or download the signed prescription for the patient, then confirm follow-up.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {url && (
            <>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-medium hover:border-[var(--accent)]/30 hover:bg-[var(--muted)]/60"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
              <a
                href={url}
                download={`prescription-${appointmentId}.pdf`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)] shadow-sm hover:brightness-110"
              >
                Download
              </a>
            </>
          )}
        </div>
      </div>
      <div className="bg-[var(--muted)]/30">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-rose-600">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : url ? (
          <details>
            <summary className="cursor-pointer p-4 text-sm font-medium">
              Preview signed prescription
            </summary>
            <iframe
              src={url}
              className="h-[480px] w-full sm:h-[680px]"
              title={`Prescription for appointment ${appointmentId}`}
            />
          </details>
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
          className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)] underline-offset-4 transition-colors hover:text-rose-600 hover:underline"
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
          <label
            htmlFor="queue-cancel-reason"
            className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]"
          >
            Reason (optional)
          </label>
          <Textarea
            rows={3}
            id="queue-cancel-reason"
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
                  <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
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
                  <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                    Target week
                  </span>
                  <DatePicker
                    mode="week"
                    align="end"
                    value={rqTargetDate}
                    onChange={setRqTargetDate}
                    placeholder="Choose a target week"
                    ariaLabel="Choose target week"
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
                Will be added with the same doctor as preferred. The original entry (if any) is
                auto-closed.
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
  const { appointment, patient, profile } = data;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">
            Appointment #{appointment.id}
          </h1>
          <p className="mt-1 break-words text-base font-medium">{doctorName}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {fmtDateTime(appointment.scheduledAt)}
          </p>
        </div>
        <StatusBadge status={appointment.status} className="self-start" />
      </div>
      <PatientSafetyStrip patient={patient} profile={profile} />
    </div>
  );
}
