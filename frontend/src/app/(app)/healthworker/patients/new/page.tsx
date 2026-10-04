"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { SignaturePad, type SignaturePadHandle } from "@/components/consent/signature-pad";
import { MASTER_CONSENT_BODY } from "@/components/healthworker/master-consent-text";
import { PatientForm } from "@/components/healthworker/patient-form";
import { useCreatePatient } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";

type Step = "consent" | "details";

export default function RegisterPatientPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("consent");
  const [agreedAt, setAgreedAt] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const create = useCreatePatient();
  const [detailsEdited, setDetailsEdited] = useState(false);
  const { confirmLeave, markSaved } = useUnsavedChanges(
    detailsEdited || !signatureEmpty || !!signature,
    "This patient has not been registered. Discard the captured signature and entered details, or Cancel to continue registration.",
  );
  const leave = () => {
    if (confirmLeave()) router.push("/healthworker/patients");
  };

  return (
    <div
      className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6"
      onInputCapture={() => setDetailsEdited(true)}
    >
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[var(--muted-foreground)]">
          {step === "consent" ? "Step 1 of 2 · Consent" : "Step 2 of 2 · Patient details"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Register patient</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {step === "consent"
            ? "Read the master consent to the patient. Capture their actual signature only if they agree."
            : "Enter patient details. The captured consent and signature will be saved with this registration."}
        </p>
      </header>

      {step === "consent" && (
        <Card variant="elevated" className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--accent)]/10 p-2">
                <ShieldCheck className="h-5 w-5 text-[var(--accent)]" aria-hidden />
              </div>
              <h2 className="text-xl font-semibold tracking-tight">Master consent</h2>
            </div>
          </div>
          <div className="flex flex-col gap-6 p-4 sm:p-6">
            <p className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-5 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {MASTER_CONSENT_BODY}
            </p>
            <SignaturePad ref={padRef} onChange={setSignatureEmpty} label="Patient signature" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="secondary" onClick={leave}>
                Patient declined
              </Button>
              <Button
                disabled={signatureEmpty}
                onClick={() => {
                  const sig = padRef.current?.toDataURL() ?? null;
                  if (!sig) return;
                  setSignature(sig);
                  setAgreedAt(new Date().toISOString());
                  setStep("details");
                }}
              >
                Patient agreed — continue
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "details" && (
        <Card variant="elevated" className="p-4 sm:p-6">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-mono text-xs uppercase tracking-[0.12em]">
              Master consent + signature captured
            </span>
          </div>

          {create.error && create.error.error === "national_id_taken" && (
            <ErrorBanner className="mb-4">{explainError(create.error.error)}</ErrorBanner>
          )}

          <PatientForm
            mode="create"
            submitting={create.isPending}
            errorMessage={
              create.error && create.error.error !== "national_id_taken"
                ? explainError(create.error.error)
                : null
            }
            submitLabel="Register patient"
            onSubmit={(s) => {
              if (s.mode !== "create") return;
              if (!signature) {
                setStep("consent");
                return;
              }
              create.mutate(
                {
                  ...s.payload,
                  masterConsent: {
                    agreed: true,
                    capturedAt: agreedAt ?? undefined,
                    signatureImage: signature,
                  },
                },
                {
                  onSuccess: (res) => {
                    markSaved();
                    setDetailsEdited(false);
                    setSignatureEmpty(true);
                    setSignature(null);
                    router.push(`/healthworker/patients/${res.patient.id}`);
                  },
                },
              );
            }}
            onCancel={leave}
          />
        </Card>
      )}
    </div>
  );
}
