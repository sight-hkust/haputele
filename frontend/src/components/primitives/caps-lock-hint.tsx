import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The copy lives here, not in lib/credentials.ts. That file is a mirror of
 * backend/app/services/credentials.py and every string in it has a server
 * counterpart to stay in step with. Caps Lock is a keyboard fact, not a
 * credential policy — putting it there would send the next reader hunting for
 * a backend rule that does not exist.
 */
export const CAPS_LOCK_MESSAGE = "Caps Lock is on. Your password will be typed in capital letters.";

/**
 * Inline warning, rendered as a sibling directly BELOW a password input and
 * above any error text. Mounted only while the field is focused and Caps Lock
 * is on, so at most one is ever on screen — see useCapsLock.
 *
 * role="status" (implicit aria-live="polite") rather than role="alert": this is
 * a heads-up, not a failure, and it must never interrupt the field's own label
 * being announced as focus lands.
 */
export function CapsLockHint({
  id,
  show,
  className,
}: {
  id: string;
  show: boolean;
  className?: string;
}) {
  if (!show) return null;
  return (
    <p
      id={id}
      role="status"
      className={cn("flex items-center gap-1.5 text-xs font-medium text-amber-700", className)}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {CAPS_LOCK_MESSAGE}
    </p>
  );
}
