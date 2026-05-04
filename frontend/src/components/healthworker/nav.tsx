"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, Clock, Download, Inbox, Users } from "lucide-react";

import { cn } from "@/lib/cn";

// The Appointments workspace shows the active pending queue inline alongside
// the calendar. The /healthworker/queue route is a separate, fuller view with
// filters + booked/cancelled history + per-entry inspection. "Book this" from
// here forwards to the workspace so the booking experience stays unified.
const NAV = [
  { href: "/healthworker/appointments", label: "Appointments", Icon: CalendarRange },
  { href: "/healthworker/patients", label: "Patients", Icon: Users },
  { href: "/healthworker/queue", label: "Queue", Icon: Inbox },
  { href: "/healthworker/availability", label: "Availability", Icon: Clock },
  { href: "/healthworker/exports", label: "Exports", Icon: Download },
];

// Secondary nav. Sits below the main topbar; mirrors the design system's
// section-label aesthetic (rounded pills, tight tracking).
export function HealthworkerNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
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
                  active ? "text-[var(--accent)]" : "text-[var(--muted-foreground)] group-hover:text-[var(--accent)]",
                )}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
