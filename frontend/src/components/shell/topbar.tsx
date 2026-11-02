"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/primitives/button";
import { RoleBadge } from "@/components/shell/role-badge";
import { ROLE_HOMES, useAuth } from "@/lib/auth";
import { confirmPendingChanges } from "@/lib/use-unsaved-changes";

export function Topbar() {
  const { session, logout } = useAuth();
  if (!session) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href={ROLE_HOMES[session.role]} className="flex items-center gap-2">
            <BrandLogo compact />
          </Link>
          <div className="hidden h-5 w-px bg-[var(--border)] sm:block" />
          <div className="hidden sm:block">
            <RoleBadge role={session.role} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-[var(--muted-foreground)] md:inline">
            {session.username}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirmPendingChanges()) logout();
            }}
            aria-label="Sign out"
            className="min-h-11 min-w-11"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span>Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
