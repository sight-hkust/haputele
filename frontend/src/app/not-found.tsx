"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ROLE_HOMES, useAuth } from "@/lib/auth";

// Global not-found boundary for any unmatched URL. Next renders this for paths
// with no matching route (and for explicit notFound() calls) inside the root
// layout, so the auth context is available. Behaviour follows the app's rule
// that every /* path stays behind the wall:
//   - signed out → bounce to /login
//   - signed in  → show a real 404 with a way back to their dashboard
export default function NotFound() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
  }, [session, loading, router]);

  // While auth resolves, or while we're redirecting a signed-out visitor, show
  // the same minimal spinner the guards use rather than flashing the 404.
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          Error 404
        </span>
        <h1 className="font-display text-4xl tracking-[-0.02em] sm:text-5xl">Page not found</h1>
        <p className="max-w-md text-[var(--muted-foreground)]">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Link
        href={ROLE_HOMES[session.role]}
        className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--accent)] hover:underline"
      >
        ← Back to your dashboard
      </Link>
    </main>
  );
}
