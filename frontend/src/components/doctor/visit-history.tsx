"use client";

import { useState } from "react";
import { ChevronDown, History } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { fmtDate } from "@/lib/format";
import { diagnosisLabel } from "@/lib/medical-codes";
import { usePatientHistory } from "@/lib/use-api";
import type { HistoryConsultationItem } from "@/types/api";

// FEEDBACK §5: surface the patient's last few consultations on the doctor's
// pre-call view so they have the full picture before joining the call. Default
// to expanded — collapsing it would just hide the very thing the feedback
// asked us to show — but the user can hide it if the column is busy.

const SHOW_COUNT = 5;

export function VisitHistoryPanel({
  patientId,
  excludeAppointmentId,
}: {
  patientId: number | null;
  excludeAppointmentId: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const history = usePatientHistory(patientId);

  const items = (history.data?.consultations ?? [])
    .filter((c) => c.appointmentId !== excludeAppointmentId)
    .slice(0, SHOW_COUNT);

  return (
    <Card className="p-6">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--accent)]">
            Previous visits {items.length > 0 ? `· ${items.length}` : ""}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-[var(--muted-foreground)] transition-transform ${
            collapsed ? "" : "rotate-180"
          }`}
        />
      </button>

      {!collapsed && (
        <div className="mt-4">
          {history.isLoading ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading history…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No prior consultations on file.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((c) => (
                <VisitItem key={c.consultationId} item={c} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function VisitItem({ item }: { item: HistoryConsultationItem }) {
  const dx = item.diagnoses.slice(0, 3);
  const moreDx = item.diagnoses.length - dx.length;
  const meds = item.prescription.slice(0, 2).map((m) => m.genericName).filter(Boolean);
  const moreMeds = item.prescription.length - meds.length;

  return (
    <li className="rounded-xl border border-[var(--border)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {fmtDate(item.date)}
        </span>
      </div>
      {dx.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {dx.map((d, i) => (
            <span
              key={i}
              className="rounded-md bg-[var(--muted)]/60 px-2 py-0.5 text-xs text-[var(--foreground)]"
            >
              {d.code === "others" && d.text ? d.text : diagnosisLabel(d.code)}
            </span>
          ))}
          {moreDx > 0 && (
            <span className="rounded-md bg-[var(--muted)]/40 px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              +{moreDx} more
            </span>
          )}
        </div>
      )}
      {meds.length > 0 && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Rx · {meds.join(", ")}
          {moreMeds > 0 ? ` (+${moreMeds} more)` : ""}
        </p>
      )}
      {item.notes.complaint && (
        <p
          className="mt-2 line-clamp-2 text-xs italic text-[var(--muted-foreground)]"
          title={item.notes.complaint || undefined}
        >
          &ldquo;{item.notes.complaint}&rdquo;
        </p>
      )}
    </li>
  );
}
