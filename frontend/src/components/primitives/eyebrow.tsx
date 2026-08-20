import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// The mono micro-label that sits above a heading or beside a value — "APPOINTMENT
// #12", "NATIONAL ID", "LAST VISIT". It was copy-pasted at 10px and 11px
// across ~120 call sites, which put it below the readable floor and, being an
// arbitrary Tailwind value, out of reach of the fontSize scale in tailwind.config.
// Extracting it here means the size is set in exactly one place (#58, #55).
//
// SectionLabel is the pill-shaped, accent-coloured variant of the same idea and
// stays separate — this is the bare inline form.
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}
