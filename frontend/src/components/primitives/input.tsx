import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

// A native number input happily accepts these as you type, but then reports
// value="" for the resulting invalid state — so "36e" reads back as blank and
// the entry is discarded with nothing to show the user it was lost. Nothing we
// ask for in numbers (vitals, follow-up weeks) is negative or exponential, so
// refuse the keys outright rather than let a silent drop through.
const BLOCKED_NUMBER_KEYS = new Set(["e", "E", "+", "-"]);

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", onKeyDown, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      onKeyDown={(event) => {
        if (type === "number" && BLOCKED_NUMBER_KEYS.has(event.key)) {
          event.preventDefault();
        }
        onKeyDown?.(event);
      }}
      className={cn(
        "flex h-12 w-full rounded-xl border border-[var(--border)] bg-transparent px-4 py-2 text-sm",
        "text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:border-transparent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";
