"use client";

import type { ReactNode } from "react";
import type { ConsultationFormShape } from "@/components/doctor/consultation-editors";
import { diagnosisLabel } from "@/lib/medical-codes";

// Structured clinical record, shared by the pre-sign review and locked receipt.
export function ConsultationReview({
  values,
  followUp,
  locked = false,
}: {
  values: ConsultationFormShape;
  followUp?: ReactNode;
  locked?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-sm sm:p-6">
      <div className="flex flex-col gap-6">
        <div>
          <span className="text-sm font-medium text-[var(--accent)]">
            {locked ? "Signed consultation" : "Final review"}
          </span>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">
            {locked ? "Consultation record" : "Confirm the consultation record"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            {locked
              ? "This signed record is locked. The prescription is available to the healthworker."
              : "Signing locks this record and makes the prescription available to the healthworker."}
          </p>
        </div>

        <ReviewBlock title="Notes">
          <ReviewKv k="Complaint" v={values.notes.complaint} />
          <ReviewKv k="Onset" v={values.notes.onset} />
          <ReviewKv k="Symptoms" v={values.notes.symptoms} />
          <ReviewKv k="Observations" v={values.notes.observations} />
        </ReviewBlock>

        <ReviewBlock title={`Diagnoses (${values.diagnoses.length})`}>
          {values.diagnoses.length === 0 ? (
            <ReviewEmpty>None recorded.</ReviewEmpty>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {values.diagnoses.map((d, i) => (
                <li
                  key={i}
                  className="rounded-md bg-[var(--muted)] px-3 py-1.5 text-sm font-medium"
                >
                  {d.code === "others" && d.text ? d.text : diagnosisLabel(d.code as never)}
                </li>
              ))}
            </ul>
          )}
        </ReviewBlock>

        <ReviewBlock title={`Prescription (${values.medications.length})`}>
          {values.medications.length === 0 ? (
            <ReviewEmpty>None.</ReviewEmpty>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {values.medications.map((m, i) => (
                <li key={i} className="py-3 first:pt-0">
                  <div className="text-base font-semibold tracking-[-0.01em]">
                    {m.genericName || (
                      <span className="text-amber-700">Generic name required before signing</span>
                    )}
                    {m.tradeName && (
                      <span className="ml-2 font-normal text-[var(--muted-foreground)]">
                        ({m.tradeName})
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {m.instructions && (
                    <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {m.instructions}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ReviewBlock>

        {(values.labs.length > 0 || values.referrals.length > 0) && (
          <div className="grid gap-6 sm:grid-cols-2">
            <ReviewBlock title={`Labs (${values.labs.length})`}>
              {values.labs.length === 0 ? (
                <ReviewEmpty>None.</ReviewEmpty>
              ) : (
                <ul className="flex flex-col gap-2">
                  {values.labs.map((l, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{l.testName || "—"}</span>
                      {l.instructions && (
                        <span className="ml-2 text-[var(--muted-foreground)]">
                          · {l.instructions}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ReviewBlock>
            <ReviewBlock title={`Referrals (${values.referrals.length})`}>
              {values.referrals.length === 0 ? (
                <ReviewEmpty>None.</ReviewEmpty>
              ) : (
                <ul className="flex flex-col gap-2">
                  {values.referrals.map((r, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{r.specialistOrDepartment || "—"}</span>
                      {r.instructions && (
                        <span className="ml-2 text-[var(--muted-foreground)]">
                          · {r.instructions}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ReviewBlock>
          </div>
        )}

        {followUp && <ReviewBlock title="Follow-up">{followUp}</ReviewBlock>}
      </div>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function ReviewKv({ k, v }: { k: string; v?: string | null }) {
  if (!v?.trim()) return null;
  return (
    <div className="mb-2 last:mb-0">
      <span className="text-sm font-medium text-[var(--muted-foreground)]">{k}</span>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{v}</p>
    </div>
  );
}

function ReviewEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--muted-foreground)]">{children}</p>;
}
