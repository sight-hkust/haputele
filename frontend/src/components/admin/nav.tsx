"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stethoscope, UserCog } from "lucide-react";

import { cn } from "@/lib/cn";
import { useDoctorSummary } from "@/lib/use-api";

// `/admin` is both the doctors dashboard and the prefix of every other
// admin route, so a plain startsWith would light both tabs at once. Each
// entry states its own match instead.
const NAV = [
  {
    href: "/admin",
    label: "Doctors",
    Icon: Stethoscope,
    isActive: (p: string) => p === "/admin" || p.startsWith("/admin/doctors"),
    // Only this tab carries the awaiting-approval count.
    badge: true,
  },
  {
    href: "/admin/healthworkers",
    label: "Health workers",
    Icon: UserCog,
    isActive: (p: string) => p.startsWith("/admin/healthworkers"),
    badge: false,
  },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";
  // Surface the actionable backlog on the nav itself so a fresh
  // submission is noticed without opening the dashboard.
  const summary = useDoctorSummary();
  const pending = summary.data?.awaitingApproval ?? 0;
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2">
        {NAV.map(({ href, label, Icon, isActive, badge }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                active
                  ? "bg-[var(--muted)] text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/60 hover:text-[var(--foreground)]",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted-foreground)] group-hover:text-[var(--accent)]",
                )}
              />
              {label}
              {badge && pending > 0 && (
                <span
                  title={`${pending} awaiting approval`}
                  className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-sky-100 px-1.5 py-0.5 font-mono text-xs text-sky-700"
                >
                  {pending}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
