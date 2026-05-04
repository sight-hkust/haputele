"use client";

import type { ConsultationFormShape } from "@/components/doctor/consultation-editors";
import { diagnosisLabel } from "@/lib/medical-codes";

// Read-only summary of every section. Inverted-section treatment per the design
// system spec ("dark inverted section for moments that deserve spotlight
// emphasis") — this is the doctor's last look before signing.
export function ConsultationReview({ values }: { values: ConsultationFormShape }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[var(--foreground)] p-8 text-white">
      <div className="absolute inset-0 dot-pattern-dark opacity-60" aria-hidden />
      <div
        className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--accent)]/15 blur-[80px]"
        aria-hidden
      />
      <div className="relative flex flex-col gap-8">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/60">
            Final review
          </span>
          <h2 className="mt-2 font-display text-3xl tracking-[-0.02em]">
            Confirm the consultation record.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
            Once signed and submitted, the record is locked. The §1.7 prescription PDF will be
            available immediately to the healthworker.
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
                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium"
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
            <ul className="flex flex-col divide-y divide-white/10">
              {values.medications.map((m, i) => (
                <li key={i} className="py-3 first:pt-0">
                  <div className="text-base font-semibold tracking-[-0.01em]">
                    {m.genericName || <span className="text-rose-300">⚠ generic name missing</span>}
                    {m.tradeName && (
                      <span className="ml-2 font-normal text-white/60">({m.tradeName})</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-white/70">
                    {[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {m.instructions && (
                    <div className="mt-1 text-xs text-white/60">{m.instructions}</div>
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
                        <span className="ml-2 text-white/60">· {l.instructions}</span>
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
                        <span className="ml-2 text-white/60">· {r.instructions}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ReviewBlock>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.15em] text-white/60">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ReviewKv({ k, v }: { k: string; v?: string | null }) {
  if (!v || !v.trim()) return null;
  return (
    <div className="mb-2 last:mb-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">{k}</span>
      <p className="mt-0.5 text-sm leading-relaxed text-white/90">{v}</p>
    </div>
  );
}

function ReviewEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-white/50">{children}</p>;
}
