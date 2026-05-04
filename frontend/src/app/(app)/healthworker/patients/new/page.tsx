"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { SignaturePad, type SignaturePadHandle } from "@/components/consent/signature-pad";
import { MASTER_CONSENT_BODY } from "@/components/healthworker/master-consent-text";
import { PatientForm } from "@/components/healthworker/patient-form";
import { useCreatePatient } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";

type Step = "consent" | "details";

export default function RegisterPatientPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("consent");
  const [agreedAt, setAgreedAt] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const create = useCreatePatient();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label={step === "consent" ? "Step 01 · Consent" : "Step 02 · Details"}
        title="Register a"
        highlight="new patient."
        subtitle={
          step === "consent"
            ? "Read the master consent statement to the patient and capture their signature. Continue only if they agree."
            : "Capture demographics. The master consent recorded a moment ago will be saved with the patient."
        }
      />

      {step === "consent" && (
        <Card variant="elevated" className="overflow-hidden">
          <div className="border-b border-[var(--border)] bg-gradient-to-br from-[var(--accent)]/[0.06] to-transparent px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-2 shadow-accent">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <h2 className="font-display text-xl tracking-[-0.01em]">Master consent</h2>
            </div>
          </div>
          <div className="flex flex-col gap-6 p-8">
            <p className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-5 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {MASTER_CONSENT_BODY}
            </p>
            <SignaturePad
              ref={padRef}
              onChange={setSignatureEmpty}
              label="Patient signature"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="secondary" onClick={() => router.push("/healthworker/patients")}>
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
        <Card variant="elevated" className="p-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-mono text-[11px] uppercase tracking-[0.12em]">
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
                  onSuccess: (res) => router.push(`/healthworker/patients/${res.patient.id}`),
                },
              );
            }}
            onCancel={() => router.push("/healthworker/patients")}
          />
        </Card>
      )}
    </div>
  );
}
