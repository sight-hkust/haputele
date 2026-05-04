import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionLabelProps {
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}

export function SectionLabel({ children, pulse = false, className }: SectionLabelProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-5 py-2",
        className,
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full bg-[var(--accent)]",
          pulse && "animate-pulse-soft",
        )}
        aria-hidden
      />
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--accent)]">
        {children}
      </span>
    </div>
  );
}
