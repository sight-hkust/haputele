import { forwardRef, useState, type InputHTMLAttributes, type LabelHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { captionClass } from "@/lib/caption-class";
import { getActiveLocale } from "@/lib/i18n";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

// A native number input happily accepts these as you type, but then reports
// value="" for the resulting invalid state — so "36e" reads back as blank and
// the entry is discarded with nothing to show the user it was lost. Nothing we
// ask for in numbers (vitals, follow-up weeks) is negative or exponential, so
// refuse the keys outright rather than let a silent drop through.
const BLOCKED_NUMBER_KEYS = new Set(["e", "E", "+", "-"]);

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", onKeyDown, autoComplete = "off", ...props }, ref) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const isPassword = type === "password";
    const input = (
      <input
        ref={ref}
        type={isPassword && passwordVisible ? "text" : type}
        autoComplete={autoComplete}
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
          isPassword && "pr-12",
          className,
        )}
        {...props}
      />
    );

    if (!isPassword) return input;

    return (
      <div className="relative w-full">
        {input}
        <button
          type="button"
          aria-label={passwordVisible ? "Hide password" : "Show password"}
          aria-pressed={passwordVisible}
          aria-controls={props.id}
          disabled={props.disabled}
          onClick={() => setPasswordVisible((visible) => !visible)}
          className={cn(
            "absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--muted-foreground)]",
            "transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {passwordVisible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);
Input.displayName = "Input";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers associate the control via htmlFor forwarded in props
    <label
      ref={ref}
      className={cn(captionClass(getActiveLocale(), "text-[var(--muted-foreground)]"), className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";
