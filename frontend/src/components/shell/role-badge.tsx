import { ServerCog, ShieldCheck, Stethoscope, UserRound, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/auth";
import { cn } from "@/lib/cn";

const ROLE_META: Record<Role, { label: string; Icon: LucideIcon }> = {
  admin: { label: "Admin", Icon: ShieldCheck },
  doctor: { label: "Doctor", Icon: Stethoscope },
  healthworker: { label: "Healthworker", Icon: UserRound },
  "sys-admin": { label: "Sys-admin", Icon: ServerCog },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const { label, Icon } = ROLE_META[role];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)]/60 px-3 py-1.5",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--foreground)]">
        {label}
      </span>
    </span>
  );
}
