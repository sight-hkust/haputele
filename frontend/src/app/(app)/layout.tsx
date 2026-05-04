"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Topbar } from "@/components/shell/topbar";
import { ROLE_HOMES, useAuth } from "@/lib/auth";

// URL segment → role mapping. The sys-admin role uses a "sysadmin" URL segment
// (no hyphen) because Next dynamic-route filenames forbid hyphens and we keep
// segment <-> role 1:1 for the layout guard.
const SEGMENT_TO_ROLE = {
  admin: "admin",
  doctor: "doctor",
  healthworker: "healthworker",
  sysadmin: "sys-admin",
} as const;
type SectionSegment = keyof typeof SEGMENT_TO_ROLE;

function isSectionSegment(s: string | undefined): s is SectionSegment {
  return s !== undefined && s in SEGMENT_TO_ROLE;
}

// Auth gate + role guard for everything under (app). If you're at /admin/* but
// signed in as a doctor, you're redirected to /doctor (server-side ACLs are still
// the source of truth — this just keeps the UI honest).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const segment = pathname.split("/").filter(Boolean)[0];
    if (isSectionSegment(segment) && SEGMENT_TO_ROLE[segment] !== session.role) {
      router.replace(ROLE_HOMES[session.role]);
    }
  }, [session, loading, router, pathname]);

  if (loading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          Loading…
        </span>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <Topbar />
      {children}
    </div>
  );
}
