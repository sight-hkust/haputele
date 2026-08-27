"use client";

import { ServerCog, ShieldCheck, Stethoscope, UserRound, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { captionClassTight } from "@/lib/caption-class";
import { useI18n } from "@/lib/i18n";

const ROLE_META: Record<Role, { labelKey: string; Icon: LucideIcon }> = {
  admin: { labelKey: "roles.admin", Icon: ShieldCheck },
  doctor: { labelKey: "roles.doctor", Icon: Stethoscope },
  healthworker: { labelKey: "roles.healthworker", Icon: UserRound },
  "sys-admin": { labelKey: "roles.sys-admin", Icon: ServerCog },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const { t, locale } = useI18n();
  const { labelKey, Icon } = ROLE_META[role];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)]/60 px-3 py-1.5",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
      <span className={captionClassTight(locale, "text-[var(--foreground)]")}>
        {t(labelKey)}
      </span>
    </span>
  );
}
