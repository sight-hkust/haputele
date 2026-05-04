import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export function ErrorBanner({
  children,
  className,
  tone = "rose",
}: {
  children: ReactNode;
  className?: string;
  tone?: "rose" | "amber";
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
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
