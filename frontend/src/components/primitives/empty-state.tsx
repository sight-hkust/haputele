import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  Icon,
  title,
  description,
  action,
  className,
}: {
  Icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-8 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent-secondary)]/5">
          <Icon className="h-6 w-6 text-[var(--accent)]" strokeWidth={1.5} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-xl tracking-[-0.01em]">{title}</h3>
        {description && (
          <p className="max-w-md text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
