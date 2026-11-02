"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ServerCog, Users } from "lucide-react";

import { cn } from "@/lib/cn";

const NAV = [
  { href: "/sysadmin", label: "System", Icon: ServerCog, exact: true },
  { href: "/sysadmin/accounts", label: "Accounts", Icon: Users, exact: false },
];

export function SysAdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="System administrator navigation"
      className="border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-2 sm:px-6">
        {NAV.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                active
                  ? "bg-[var(--muted)] text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/60 hover:text-[var(--foreground)]",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "h-4 w-4 transition-colors",
                  active
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted-foreground)] group-hover:text-[var(--accent)]",
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
