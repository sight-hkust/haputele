"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

export type ConsultationStage = "notes" | "rx" | "review";

// Three-step horizontal stepper. Past steps get a check, current gets the
// gradient treatment, future stays muted. Connector line darkens as you progress.
export function ConsultationStepper({ current }: { current: ConsultationStage }) {
  const { t } = useI18n();
  const stages: { id: ConsultationStage; label: string; n: string }[] = [
    { id: "notes", label: t("consultation.notes"), n: "01" },
    { id: "rx", label: t("consultation.rxPlan"), n: "02" },
    { id: "review", label: t("consultation.reviewSign"), n: "03" },
  ];
  const idx = stages.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-3">
      {stages.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "future";
        return (
          <li key={s.id} className="flex flex-1 items-center gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-medium transition-all",
                  state === "done" && "bg-emerald-100 text-emerald-700",
                  state === "current" &&
                    "bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] text-white shadow-accent",
                  state === "future" &&
                    "border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]",
                )}
              >
                {state === "done" ? <Check className="h-4 w-4" /> : s.n}
              </span>
              <div className="flex flex-col leading-none">
                <span
                  className={cn(
                    "font-mono text-xs uppercase tracking-[0.15em]",
                    state === "future" ? "text-[var(--muted-foreground)]" : "text-[var(--accent)]",
                  )}
                >
                  {t("consultation.step", { n: s.n })}
                </span>
                <span
                  className={cn(
                    "mt-1 text-sm font-semibold tracking-[-0.01em]",
                    state === "future"
                      ? "text-[var(--muted-foreground)]"
                      : "text-[var(--foreground)]",
                  )}
                >
                  {s.label}
                </span>
              </div>
            </div>
            {i < stages.length - 1 && (
              <div
                className={cn(
                  "ml-1 h-px flex-1 transition-colors",
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
