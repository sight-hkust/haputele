"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type ConsultationStage = "notes" | "rx" | "review";

const STAGES: { id: ConsultationStage; label: string; n: string }[] = [
  { id: "notes", label: "Notes", n: "01" },
  { id: "rx", label: "Prescription & plan", n: "02" },
  { id: "review", label: "Review & sign", n: "03" },
];

// Mobile steps stack their number and readable label; desktop connects them.
export function ConsultationStepper({ current }: { current: ConsultationStage }) {
  const idx = STAGES.findIndex((s) => s.id === current);
  return (
    <ol aria-label="Consultation progress" className="grid grid-cols-3 gap-3">
      {STAGES.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "future";
        return (
          <li
            key={s.id}
            aria-current={state === "current" ? "step" : undefined}
            className="flex min-w-0 items-center gap-3"
          >
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-medium transition-colors",
                  state === "done" && "bg-emerald-100 text-emerald-700",
                  state === "current" && "bg-[var(--accent)] text-white shadow-sm",
                  state === "future" &&
                    "border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
                )}
              >
                {state === "done" ? <Check className="h-4 w-4" /> : s.n}
              </span>
              <div className="flex min-w-0 flex-col leading-snug">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    state === "future"
                      ? "text-[var(--muted-foreground)]"
                      : "text-[var(--foreground)]",
                  )}
                >
                  {s.label}
                </span>
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={cn(
                  "ml-1 hidden h-px flex-1 transition-colors sm:block",
                  i < idx ? "bg-emerald-300" : "bg-[var(--border)]",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
