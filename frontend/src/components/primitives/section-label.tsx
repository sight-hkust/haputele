import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionLabelProps {
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}

export function SectionLabel({ children, pulse = false, className }: SectionLabelProps) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn("h-2 w-2 rounded-full bg-[var(--accent)]", pulse && "animate-pulse-soft")}
        aria-hidden
      />
      <span className="text-field-label text-[var(--muted-foreground)]">{children}</span>
    </div>
  );
}
