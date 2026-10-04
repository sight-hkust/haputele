"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clock4,
  FileSignature,
  Save,
  X,
} from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import {
  ConsultationStepper,
  type ConsultationStage,
} from "@/components/doctor/consultation-stepper";
import {
  DiagnosesEditor,
  LabsEditor,
  MedicationsEditor,
  NotesEditor,
  ReferralsEditor,
  type ConsultationFormShape,
} from "@/components/doctor/consultation-editors";
import { ConsultationReview } from "@/components/doctor/consultation-review";
import { FollowUpSummary } from "@/components/clinical/follow-up-summary";
import { DoctorSlotPicker } from "@/components/doctor/doctor-slot-picker";
import { SignatureCanvas, type SignatureCanvasHandle } from "@/components/doctor/signature-canvas";
import { explainError } from "@/lib/error-codes";
import { appLocalToUtcIso, fmtDateTime, fmtRelative } from "@/lib/format";
import {
  MY_SIGNATURE_URL,
  useCurrentDoctor,
  useSubmitConsultation,
  useUpdateConsultation,
} from "@/lib/use-api";
import type { Consultation, FollowUpInput } from "@/types/api";
import { cn } from "@/lib/cn";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

// Schema mirrors the backend ConsultationPatch + submit payload. Generic name
// validation is *deferred* until submit so the doctor can save partial drafts
// across stages without being yelled at for incomplete medication rows.
const formSchema = z.object({
  notes: z.object({
    complaint: z.string(),
    onset: z.string(),
    symptoms: z.string(),
    observations: z.string(),
  }),
  diagnoses: z.array(z.object({ code: z.string(), text: z.string().optional() })),
  medications: z.array(
    z.object({
      genericName: z.string(),
      tradeName: z.string().optional(),
      dose: z.string().optional(),
      frequency: z.string().optional(),
      duration: z.string().optional(),
      instructions: z.string().optional(),
    }),
  ),
  labs: z.array(z.object({ testName: z.string().optional(), instructions: z.string().optional() })),
  referrals: z.array(
    z.object({
      specialistOrDepartment: z.string().optional(),
      instructions: z.string().optional(),
    }),
  ),
});

function defaultsFrom(c: Consultation): ConsultationFormShape {
  return {
    notes: {
      complaint: c.notes.complaint ?? "",
      onset: c.notes.onset ?? "",
      symptoms: c.notes.symptoms ?? "",
      observations: c.notes.observations ?? "",
    },
    diagnoses: c.diagnoses.map((d) => ({ code: d.code, text: d.text ?? "" })),
    medications: c.medications.map((m) => ({
      genericName: m.genericName,
      tradeName: m.tradeName ?? "",
      dose: m.dose ?? "",
      frequency: m.frequency ?? "",
      duration: m.duration ?? "",
      instructions: m.instructions ?? "",
    })),
    labs: c.labs.map((l) => ({ testName: l.testName ?? "", instructions: l.instructions ?? "" })),
    referrals: c.referrals.map((r) => ({
      specialistOrDepartment: r.specialistOrDepartment ?? "",
      instructions: r.instructions ?? "",
    })),
  };
}

// A row the doctor added but never typed into. toPatch strips these on save,
// so they must not block submission either — only a row with *some* content
// but no generic name is genuinely incomplete.
function medRowEmpty(m: ConsultationFormShape["medications"][number]) {
  return (
    !m.genericName.trim() &&
    !m.tradeName?.trim() &&
    !m.dose?.trim() &&
    !m.frequency?.trim() &&
    !m.duration?.trim() &&
    !m.instructions?.trim()
  );
}

// Strip empty entries before sending — the API tolerates them but the audit
// trail looks cleaner with only non-empty rows.
function toPatch(v: ConsultationFormShape) {
  return {
    notes: {
      complaint: v.notes.complaint,
      onset: v.notes.onset,
      symptoms: v.notes.symptoms,
      observations: v.notes.observations,
    },
    diagnoses: v.diagnoses
      .filter((d) => d.code)
      .map((d) => ({ code: d.code as never, text: d.text || undefined })),
    medications: v.medications
      .filter((m) => !medRowEmpty(m))
      .map((m) => ({
        genericName: m.genericName,
        tradeName: m.tradeName || undefined,
        dose: m.dose || undefined,
        frequency: m.frequency || undefined,
        duration: m.duration || undefined,
        instructions: m.instructions || undefined,
      })),
    labs: v.labs
      .filter((l) => l.testName?.trim() || l.instructions?.trim())
      .map((l) => ({
        testName: l.testName || undefined,
        instructions: l.instructions || undefined,
      })),
    referrals: v.referrals
      .filter((r) => r.specialistOrDepartment?.trim() || r.instructions?.trim())
      .map((r) => ({
        specialistOrDepartment: r.specialistOrDepartment || undefined,
        instructions: r.instructions || undefined,
      })),
  };
}

export function ConsultationFlow({
  consultation,
  appointmentId,
  readOnly,
}: {
  consultation: Consultation;
  appointmentId: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<ConsultationStage>("notes");
  const [signed, setSigned] = useState(false);
  const sigRef = useRef<SignatureCanvasHandle>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState(() =>
    JSON.stringify(toPatch(defaultsFrom(consultation))),
  );
  const saveRequest = useRef<Promise<boolean> | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // When the doctor has a saved e-signature we apply it automatically; this
  // flips true if they'd rather draw a one-off signature for this consult.
  const [drawOneOff, setDrawOneOff] = useState(false);

  // Three-way follow-up choice at submit. Default: none.
  type FollowUpChoice = "none" | "appointment" | "weeks";
  const [followUpChoice, setFollowUpChoice] = useState<FollowUpChoice>("none");
  const [followUpAt, setFollowUpAt] = useState<string>(""); // datetime-local
  const [followUpWeeks, setFollowUpWeeks] = useState<number>(4);

  const { doctor, hasDefaultSignature } = useCurrentDoctor();
  const update = useUpdateConsultation(consultation.id);
  const submit = useSubmitConsultation(consultation.id);
  // Draw the signature when there's no saved default, or the doctor opted to.
  const drawingSignature = !hasDefaultSignature || drawOneOff;

  const form = useForm<ConsultationFormShape>({
    resolver: zodResolver(formSchema) as never,
    defaultValues: defaultsFrom(consultation),
  });

  const values = form.watch();

  const draftDirty = JSON.stringify(toPatch(values)) !== savedDraft;
  // The draft endpoint stores clinical fields, not the submit-only follow-up
  // choice or drawn signature. Never label those selections as saved.
  const submissionDirty = followUpChoice !== "none" || (drawingSignature && signed);
  const { markSaved } = useUnsavedChanges(
    !readOnly && !submitted && (draftDirty || submissionDirty || finishing),
    "Your consultation has unsaved changes. Select OK to discard them and leave, or Cancel to stay and save. Follow-up and drawn signatures are only saved when you sign and submit.",
  );

  // Snapshot each request. An older response acknowledges only that snapshot,
  // and never resets the form or overwrites edits made while saving.
  const persist = (): Promise<boolean> => {
    if (saveRequest.current) return saveRequest.current;
    const patch = toPatch(form.getValues());
    const snapshot = JSON.stringify(patch);
    saveRequest.current = (async () => {
      try {
        await update.mutateAsync(patch);
        setSavedDraft(snapshot);
        setSavedAt(new Date().toISOString());
        return true;
      } catch {
        return false;
      } finally {
        saveRequest.current = null;
      }
    })();
    return saveRequest.current;
  };

  const next = async () => {
    if (await persist()) setStage(stage === "notes" ? "rx" : "review");
  };

  const onSubmit = async () => {
    // When drawing, a signature is required; otherwise omit it so the backend
    // applies the doctor's saved default e-signature.
    let signature: string | undefined;
    if (drawingSignature) {
      const sig = sigRef.current?.toDataURL();
      if (!sig) {
        // The canvas remounted blank (e.g. Back → Review) while `signed` went
        // stale — resync so the button disables and shows its reason instead
        // of swallowing the click.
        setSigned(false);
        return;
      }
      signature = sig;
    }
    setFinishing(true);
    let followUp: FollowUpInput | undefined;
    if (followUpChoice === "appointment" && followUpAt) {
      followUp = { kind: "appointment", scheduledAt: appLocalToUtcIso(followUpAt) };
    } else if (followUpChoice === "weeks") {
      followUp = { kind: "weeks", weeks: followUpWeeks };
    }
    try {
      // A manually started save may contain an older snapshot. Wait for it,
      // then persist the now-locked form before signing.
      if (saveRequest.current) await saveRequest.current;
      if (!(await persist())) return;
      await submit.mutateAsync({ signature, followUp });
      setSubmitted(true);
      markSaved();
      router.push(`/doctor/appointments/${appointmentId}`);
    } catch {
      // Mutation errors are shown by the action bar; the draft stays guarded.
    } finally {
      setFinishing(false);
    }
  };

  // Validate medications client-side — every non-empty entry must have a
  // genericName before we'll let the doctor submit. (Server enforces too.)
  // Untouched empty rows don't count: toPatch strips them on save anyway.
  const medsValid = values.medications.every(
    (medication) => medication.genericName.trim().length > 0 || medRowEmpty(medication),
  );

  // Everything still blocking the submit, in plain words — rendered next to
  // the disabled button so a blocked submit is never a mystery.
  const submitBlockers: string[] = [];
  if (!medsValid) submitBlockers.push("every medication needs a generic name");
  if (followUpChoice === "appointment" && followUpAt.length === 0)
    submitBlockers.push("pick the follow-up slot");
  if (followUpChoice === "weeks" && !(followUpWeeks >= 1 && followUpWeeks <= 52))
    submitBlockers.push("follow-up weeks must be 1–52");
  if (drawingSignature && !signed) submitBlockers.push("sign in the box above");

  // The review shows exactly what will be submitted — mirror toPatch's
  // filtering so an untouched empty row doesn't render as a warning.
  const reviewValues = useMemo(
    () => ({
      notes: values.notes,
      diagnoses: values.diagnoses.filter((d) => d.code),
      medications: values.medications.filter((m) => !medRowEmpty(m)),
      labs: values.labs.filter((l) => l.testName?.trim() || l.instructions?.trim()),
      referrals: values.referrals.filter(
        (r) => r.specialistOrDepartment?.trim() || r.instructions?.trim(),
      ),
    }),
    [values],
  );

  // Read-only path: a completed consultation is shown via the same component
  // but with all editing disabled.
  if (readOnly) {
    return (
      <Card className="p-4 sm:p-6">
        <CompletedNotice signedAt={consultation.signedAt} />
        <div className="mt-6">
          <ConsultationReview
            values={reviewValues}
            locked
            followUp={<FollowUpSummary consultation={consultation} viewerRole="doctor" />}
          />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4 sm:p-6">
        <ConsultationStepper current={stage} />
      </Card>

      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset disabled={finishing} className="flex min-w-0 flex-col gap-6">
          {stage === "notes" && (
            <Card variant="elevated" className="p-4 sm:p-6">
              <h2 className="mb-2 text-2xl font-semibold tracking-[-0.01em]">Consultation notes</h2>
              <p className="mb-6 text-sm text-[var(--muted-foreground)]">
                Capture the patient&rsquo;s complaint and your observations from the call.
              </p>
              <NotesEditor register={form.register} />
            </Card>
          )}

          {stage === "rx" && (
            <Card variant="elevated" className="flex flex-col gap-8 p-4 sm:p-6">
              <DiagnosesEditor control={form.control} register={form.register} watch={form.watch} />
              <MedicationsEditor control={form.control} register={form.register} />
              <LabsEditor control={form.control} register={form.register} />
              <ReferralsEditor control={form.control} register={form.register} />
              {!medsValid && (
                <ErrorBanner tone="amber">
                  Every medication entry needs a generic name before you can submit. (§1.7)
                </ErrorBanner>
              )}
            </Card>
          )}

          {stage === "review" && (
            <div className="flex flex-col gap-6">
              <ConsultationReview
                values={reviewValues}
                followUp={
                  <div className="text-sm leading-relaxed">
                    {followUpChoice === "none" &&
                      "No return visit or follow-up queue entry will be created."}
                    {followUpChoice === "appointment" &&
                      (followUpAt
                        ? `Signing books a return appointment with you on ${fmtDateTime(appLocalToUtcIso(followUpAt))}.`
                        : "Choose an exact return slot before signing. No appointment has been booked yet.")}
                    {followUpChoice === "weeks" &&
                      `Signing adds a follow-up recommendation in ${followUpWeeks} weeks to the healthworker's queue, with you as preferred doctor. The healthworker still needs to book the visit.`}
                    {followUpChoice !== "none" && (
                      <p className="mt-2 font-medium text-amber-700">
                        This selection is not part of the saved draft. It is saved only when you
                        sign and submit.
                      </p>
                    )}
                  </div>
                }
              />

              <Card variant="elevated" className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex flex-col gap-3">
                  <h3 className="text-base font-semibold">Follow-up</h3>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <FollowUpOption
                      Icon={X}
                      title="No follow-up"
                      description="Patient doesn't need a return visit."
                      active={followUpChoice === "none"}
                      onClick={() => setFollowUpChoice("none")}
                    />
                    <FollowUpOption
                      Icon={CalendarPlus}
                      title="Book appointment"
                      description="Pick the exact return slot now (with you)."
                      active={followUpChoice === "appointment"}
                      onClick={() => setFollowUpChoice("appointment")}
                    />
                    <FollowUpOption
                      Icon={Clock4}
                      title="In N weeks"
                      description="Add to queue; the healthworker books later."
                      active={followUpChoice === "weeks"}
                      onClick={() => setFollowUpChoice("weeks")}
                    />
                  </div>

                  {followUpChoice === "appointment" && doctor && (
                    <DoctorSlotPicker
                      doctorId={doctor.id}
                      value={followUpAt}
                      onChange={setFollowUpAt}
                      defaultWeeksAhead={4}
                    />
                  )}

                  {followUpChoice === "weeks" && (
                    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4">
                      <Label
                        className="font-sans text-sm normal-case tracking-normal"
                        htmlFor="follow-up-weeks"
                      >
                        Recommend follow-up in weeks
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {[2, 4, 6, 8, 12].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={followUpWeeks === n}
                            onClick={() => setFollowUpWeeks(n)}
                            className={cn(
                              "min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                              followUpWeeks === n
                                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)]/30",
                            )}
                          >
                            {n} weeks
                          </button>
                        ))}
                        <Input
                          id="follow-up-weeks"
                          type="number"
                          min={1}
                          max={52}
                          value={followUpWeeks}
                          onChange={(e) => setFollowUpWeeks(Number(e.target.value) || 0)}
                          className="w-24"
                        />
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        The healthworker will book a visit during the target week, with you as the
                        preferred doctor.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-base font-semibold">Signature (required)</h3>
                  {drawingSignature ? (
                    <>
                      <SignatureCanvas ref={sigRef} onChange={setSigned} />
                      {hasDefaultSignature && (
                        <button
                          type="button"
                          onClick={() => {
                            setSigned(false);
                            setDrawOneOff(false);
                          }}
                          className="min-h-11 self-start text-sm font-medium text-[var(--accent)] hover:underline"
                        >
                          Use my saved signature instead
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center">
                      <div className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                        <img
                          src={MY_SIGNATURE_URL}
                          alt="Your saved e-signature"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-emerald-700">Saved signature</div>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                          Applied automatically when you submit.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSigned(false);
                          setDrawOneOff(true);
                        }}
                        className="min-h-11 text-left text-sm font-medium text-[var(--accent)] hover:underline"
                      >
                        Draw a one-off signature instead
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Errors render here, next to the buttons that caused them — the
            footer is sticky at the bottom, so a banner at the top of the page
            would sit outside the viewport and a failed click would look like
            a dead button. */}
          {update.error && <ErrorBanner>{explainError(update.error.error)}</ErrorBanner>}
          {submit.error && <ErrorBanner>{explainError(submit.error.error)}</ErrorBanner>}

          {/* Footer — back / save / next / submit */}
          <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-4 shadow-sm backdrop-blur">
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "text-sm font-medium",
                update.error
                  ? "text-rose-700"
                  : draftDirty || submissionDirty
                    ? "text-amber-700"
                    : "text-emerald-700",
              )}
            >
              {update.isPending
                ? "Saving draft…"
                : update.error
                  ? "Draft not saved. Your edits are still here; retry saving before leaving."
                  : draftDirty
                    ? "Unsaved draft changes"
                    : savedAt
                      ? `Clinical draft saved ${fmtRelative(savedAt)}`
                      : "Clinical draft is up to date"}
              {submissionDirty && " · Follow-up or drawn signature is not saved until signing."}
            </p>
            {stage === "review" && submitBlockers.length > 0 && (
              <p className="text-sm font-medium text-amber-700">
                To submit: {submitBlockers.join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {stage !== "notes" && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (stage === "review" && drawingSignature && signed) {
                        if (
                          !window.confirm(
                            "Going back discards the drawn signature. Select OK to discard it, or Cancel to stay and sign.",
                          )
                        )
                          return;
                        setSigned(false);
                      }
                      setStage(stage === "review" ? "rx" : "notes");
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => persist()}
                  disabled={update.isPending}
                >
                  <Save className="h-4 w-4" />
                  {update.isPending ? "Saving…" : "Save draft"}
                </Button>
              </div>
              <div>
                {stage !== "review" && (
                  <Button type="button" onClick={next} disabled={update.isPending}>
                    {update.isPending ? "Saving…" : "Save & continue"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
                {stage === "review" && (
                  <Button
                    type="button"
                    onClick={onSubmit}
                    disabled={
                      submitBlockers.length > 0 || submit.isPending || update.isPending || finishing
                    }
                  >
                    <FileSignature className="h-4 w-4" />
                    {submit.isPending ? "Submitting…" : "Sign & submit"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

function FollowUpOption({
  Icon,
  title,
  description,
  active,
  onClick,
}: {
  Icon: typeof X;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm"
          : "border-[var(--border)] hover:border-[var(--accent)]/30 hover:bg-[var(--muted)]/40",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          active
            ? "bg-[var(--accent)]/15 text-[var(--accent)]"
            : "bg-[var(--muted)] text-[var(--muted-foreground)]",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm font-semibold tracking-[-0.01em]">{title}</div>
      <div className="text-sm text-[var(--muted-foreground)]">{description}</div>
    </button>
  );
}

function CompletedNotice({ signedAt }: { signedAt: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <CheckCircle2 className="h-5 w-5 text-emerald-700" />
      <div>
        <div className="text-sm font-medium text-emerald-700">Locked & signed</div>
        <div className="text-sm font-semibold tracking-[-0.01em]">
          Submitted {signedAt ? fmtRelative(signedAt) : "earlier"}.
        </div>
      </div>
    </div>
  );
}
