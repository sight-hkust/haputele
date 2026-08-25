import type { ReactNode } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/primitives/button";
import type { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { explainError, isKnownErrorCode } from "@/lib/error-codes";

export function ErrorBanner({
  children,
  className,
  tone = "rose",
  requestId,
  action,
}: {
  children: ReactNode;
  className?: string;
  tone?: "rose" | "amber";
  /** Support reference rendered as "Reference: <id>" — quote it in a bug report. */
  requestId?: string | null;
  /** Recovery affordance, usually a "Try again" button. */
  action?: ReactNode;
}) {
  const palette =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        palette,
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">
        {children}
        {requestId && (
          <span className="mt-1 block font-mono text-xs opacity-70">
            Reference: {requestId}
          </span>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/**
 * The standard way to render an ApiError from a failed *query load*: curated
 * copy via explainError, a support reference when the code has no curated
 * explanation of its own (or the server 5xx'd), and a retry button wired to
 * `refetch()`. Mutation errors usually don't want the retry slot — they sit
 * next to the action button that can be pressed again — so those keep plain
 * ErrorBanner + explainError.
 *
 * Renders nothing when error is null/undefined, so callers can use it
 * unconditionally.
 */
export function ApiErrorBanner({
  error,
  onRetry,
  retryLabel = "Try again",
  className,
  tone,
}: {
  error: ApiError | null | undefined;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  tone?: "rose" | "amber";
}) {
  if (!error) return null;
  const code = error.error ?? "request_failed";
  const showReference =
    !!error.requestId && (!isKnownErrorCode(code) || error.status >= 500);
  return (
    <ErrorBanner
      className={className}
      tone={tone}
      requestId={showReference ? error.requestId : null}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RotateCw className="h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        )
      }
    >
      {explainError(code)}
    </ErrorBanner>
  );
}
