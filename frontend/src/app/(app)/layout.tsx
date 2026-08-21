"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Topbar } from "@/components/shell/topbar";
import { ROLE_HOMES, SEGMENT_TO_ROLE, useAuth } from "@/lib/auth";

// Auth gate + role guard for everything under (app). If you're at /admin/* but
// signed in as a doctor, you're redirected to /doctor (server-side ACLs are still
// the source of truth — this just keeps the UI honest).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { session, loading } = useAuth();

  // The first path segment names the role section. If it's a section that
  // isn't this user's, they're on a page they don't belong on. Computed during
  // render (not just in the effect) so we can gate the children below.
  const segment = pathname.split("/").filter(Boolean)[0];
  const roleMismatch =
    !!session &&
    segment !== undefined &&
    segment in SEGMENT_TO_ROLE &&
    SEGMENT_TO_ROLE[segment] !== session.role;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (roleMismatch) {
      router.replace(ROLE_HOMES[session.role]);
    }
  }, [session, loading, router, pathname, roleMismatch]);

  // Gate rendering until we know the user belongs on this exact path. Without
  // the `roleMismatch` check the wrong-role page renders for one frame before
  // the effect above redirects — the "doctor's page flashes when a health
  // worker signs in" bug.
  if (loading || !session || roleMismatch) {
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
