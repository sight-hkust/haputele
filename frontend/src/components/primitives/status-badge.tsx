import { cn } from "@/lib/cn";

// Maps the §11 appointment state machine to visual treatment.
// `in_progress` is the only state that pulses — it's the "alive" state.
type StatusKey =
  | "scheduled"
  | "consent_pending"
  | "data_collection"
  | "in_progress"
  | "awaiting_notes"
  | "completed"
  | "cancelled";

const STATUS_STYLE: Record<StatusKey, { dot: string; bg: string; border: string; text: string; pulse?: boolean }> = {
  scheduled:       { dot: "bg-slate-400",       bg: "bg-slate-100",        border: "border-slate-200",        text: "text-slate-700" },
  consent_pending: { dot: "bg-amber-500",       bg: "bg-amber-50",         border: "border-amber-200",        text: "text-amber-700" },
  data_collection: { dot: "bg-sky-500",         bg: "bg-sky-50",           border: "border-sky-200",          text: "text-sky-700" },
  in_progress:     { dot: "bg-[var(--accent)]", bg: "bg-[var(--accent)]/5", border: "border-[var(--accent)]/30", text: "text-[var(--accent)]", pulse: true },
  awaiting_notes:  { dot: "bg-violet-500",      bg: "bg-violet-50",        border: "border-violet-200",       text: "text-violet-700" },
  completed:       { dot: "bg-emerald-500",     bg: "bg-emerald-50",       border: "border-emerald-200",      text: "text-emerald-700" },
  cancelled:       { dot: "bg-rose-500",        bg: "bg-rose-50",          border: "border-rose-200",         text: "text-rose-700" },
};

const FALLBACK = STATUS_STYLE.scheduled;

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = (STATUS_STYLE as Record<string, typeof FALLBACK>)[status] ?? FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1",
        style.bg,
        style.border,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot, style.pulse && "animate-pulse-soft")} aria-hidden />
      <span className={cn("font-mono text-[11px] uppercase tracking-[0.12em]", style.text)}>
        {status.replace(/_/g, " ")}
      </span>
    </span>
  );
}
