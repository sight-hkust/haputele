"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROLE_HOMES, useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

// Root entry point. Bounce based on system + session state:
//   1. If system_config.initialized_at IS NULL → /setup (first-run wizard).
//   2. Else if a valid session exists → that role's home.
//   3. Else → /login.
//
// Step 1 is a pre-auth fetch to /setup/status (the only route guaranteed
// reachable in every state). A 409 setup_required from any other path also
// bounces to /setup via the global api.ts handler.
export default function Index() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    (async () => {
      try {
        const status = await api<{ initialized: boolean }>("/setup/status");
        if (cancelled) return;
        if (!status.initialized) {
          router.replace("/setup");
          return;
        }
      } catch (err) {
        // If /setup/status itself is unreachable, fall through to the normal
        // session-based routing so the user sees a login screen rather than
        // an indefinite spinner. ApiError(409 setup_required) was already
        // handled by api.ts; anything else is a transient network error.
        if (err instanceof ApiError && err.error === "setup_required") return;
      }
      if (cancelled) return;
      router.replace(session ? ROLE_HOMES[session.role] : "/login");
    })();

    return () => {
      cancelled = true;
    };
  }, [session, loading, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        Loading…
      </span>
    </main>
  );
}
