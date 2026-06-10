"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ArrowLeft, ArrowRight, CalendarPlus, CheckCircle2, Clock4, FileSignature, Save, X } from "lucide-react";
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
import { DoctorSlotPicker } from "@/components/doctor/doctor-slot-picker";
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from "@/components/doctor/signature-canvas";
import { explainError } from "@/lib/error-codes";
import { appLocalToUtcIso, fmtRelative } from "@/lib/format";
import { MY_SIGNATURE_URL, useCurrentDoctor, useSubmitConsultation, useUpdateConsultation } from "@/lib/use-api";
import type { Consultation, FollowUpInput } from "@/types/api";
import { cn } from "@/lib/cn";

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
  diagnoses: z.array(
    z.object({ code: z.string(), text: z.string().optional() }),
  ),
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
  labs: z.array(
    z.object({ testName: z.string().optional(), instructions: z.string().optional() }),
  ),
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
      complaint: v.notes.complaint || undefined,
      onset: v.notes.onset || undefined,
      symptoms: v.notes.symptoms || undefined,
      observations: v.notes.observations || undefined,
    },
    diagnoses: v.diagnoses
      .filter((d) => d.code)
      .map((d) => ({ code: d.code as never, text: d.text || undefined })),
    medications: v.medications
      .filter((m) => m.genericName.trim())
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
      .map((l) => ({ testName: l.testName || undefined, instructions: l.instructions || undefined })),
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

  // Save when leaving stage 1 or stage 2 — keeps drafts coherent if the
  // doctor closes the tab between sections. Never throws: a failed save is
  // surfaced via the update.error banner, so callers just check the result.
  const persist = async () => {
    try {
      await update.mutateAsync(toPatch(form.getValues()));
      setSavedAt(new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  };

  const next = async () => {
    if (await persist()) setStage(stage === "notes" ? "rx" : "review");
  };

  const back = () => setStage(stage === "review" ? "rx" : "notes");

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
    // Final patch in case anything's dirty since the last save.
    if (!(await persist())) return;
    let followUp: FollowUpInput | undefined;
    if (followUpChoice === "appointment" && followUpAt) {
      followUp = { kind: "appointment", scheduledAt: appLocalToUtcIso(followUpAt) };
    } else if (followUpChoice === "weeks") {
      followUp = { kind: "weeks", weeks: followUpWeeks };
    }
    submit.mutate(
      { signature, followUp },
      {
        onSuccess: () => router.push(`/doctor/appointments/${appointmentId}`),
      },
    );
  };

  // Validate medications client-side — every non-empty entry must have a
  // genericName before we'll let the doctor submit. (Server enforces too.)
  // Untouched empty rows don't count: toPatch strips them on save anyway.
  const medsValid = useMemo(
    () => values.medications.every((m) => m.genericName.trim().length > 0 || medRowEmpty(m)),
    [values.medications],
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
      <Card className="p-8">
        <CompletedNotice signedAt={consultation.signedAt} />
        <div className="mt-6">
          <ConsultationReview values={reviewValues} />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Card className="p-6">
        <ConsultationStepper current={stage} />
      </Card>

      <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-8">
        {stage === "notes" && (
          <Card variant="elevated" className="p-8">
            <h2 className="mb-2 font-display text-2xl tracking-[-0.01em]">
              Consultation notes
            </h2>
            <p className="mb-6 text-sm text-[var(--muted-foreground)]">
              Capture the patient&rsquo;s complaint and your observations from the call.
            </p>
            <NotesEditor register={form.register} />
          </Card>
        )}

        {stage === "rx" && (
          <Card variant="elevated" className="flex flex-col gap-10 p-8">
            <DiagnosesEditor
              control={form.control}
              register={form.register}
              watch={form.watch}
            />
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
            <ConsultationReview values={reviewValues} />

            <Card variant="elevated" className="flex flex-col gap-6 p-8">
              <div className="flex flex-col gap-3">
                <Label>Follow-up</Label>
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
                    <Label>Recommend follow-up in</Label>
                    <div className="flex flex-wrap gap-2">
                      {[2, 4, 6, 8, 12].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setFollowUpWeeks(n)}
                          className={cn(
                            "rounded-xl border px-3 py-1.5 text-xs font-medium transition-all",
                            followUpWeeks === n
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)]/30",
                          )}
                        >
                          {n} weeks
                        </button>
                      ))}
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        value={followUpWeeks}
                        onChange={(e) => setFollowUpWeeks(Number(e.target.value) || 0)}
                        className="w-24"
                      />
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Creates a queue entry tagged to you as preferred doctor, snapped to the Monday of that target week.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sig">Signature *</Label>
                {drawingSignature ? (
                  <>
                    <SignatureCanvas ref={sigRef} onChange={setSigned} />
                    {hasDefaultSignature && (
                      <button
                        type="button"
                        onClick={() => setDrawOneOff(false)}
                        className="self-start text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        Use my saved signature instead
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={MY_SIGNATURE_URL}
                        alt="Your saved e-signature"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-600">
                        Saved signature
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        Applied automatically when you submit.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawOneOff(true)}
                      className="text-xs font-medium text-[var(--accent)] hover:underline"
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
        {update.error && (
          <ErrorBanner>{explainError(update.error.error)}</ErrorBanner>
        )}
        {submit.error && (
          <ErrorBanner>{explainError(submit.error.error)}</ErrorBanner>
        )}

        {/* Footer — back / save / next / submit */}
        <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-4 shadow-lg backdrop-blur">
          {stage === "review" && submitBlockers.length > 0 && (
            <p className="text-right text-xs font-medium text-amber-600">
              To submit: {submitBlockers.join(" · ")}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {stage !== "notes" && (
                <Button type="button" variant="secondary" onClick={back}>
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
              {savedAt && !update.isPending && (
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-600">
                  Saved {fmtRelative(savedAt)}
                </span>
              )}
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
                  disabled={submitBlockers.length > 0 || submit.isPending}
                >
                  <FileSignature className="h-4 w-4" />
                  {submit.isPending ? "Submitting…" : "Sign & submit"}
                </Button>
              )}
            </div>
          </div>
        </div>
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
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all",
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm"
          : "border-[var(--border)] hover:border-[var(--accent)]/30 hover:bg-[var(--muted)]/40",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          active ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm font-semibold tracking-[-0.01em]">{title}</div>
      <div className="text-xs text-[var(--muted-foreground)]">{description}</div>
    </button>
  );
}

function CompletedNotice({ signedAt }: { signedAt: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <CheckCircle2 className="h-5 w-5 text-emerald-700" />
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-700">
          Locked & signed
        </div>
        <div className="text-sm font-semibold tracking-[-0.01em]">
          Submitted {signedAt ? fmtRelative(signedAt) : "earlier"}.
        </div>
      </div>
    </div>
  );
}
