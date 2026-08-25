"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

import { BackLink } from "@/components/primitives/back-link";
import { Button } from "@/components/primitives/button";
import { ROLE_HOMES, useAuth } from "@/lib/auth";

// Route-segment error boundary for every page under the root layout. This is
// the last line of defence: any render bug or thrown error that no inline
// handler catches lands here instead of Next's default unbranded crash screen.
// Mirrors not-found.tsx — signed-in users get a way back to their dashboard,
// anonymous ones to the login wall. `reset()` re-renders the failed segment,
// which for React Query pages means a fresh fetch.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { session, loading } = useAuth();

  useEffect(() => {
    console.error(error);
  }, [error]);

  if (loading) {
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
        <span
          role="alert"
          className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]"
        >
          Error
        </span>
        <h1 className="font-display text-4xl tracking-[-0.02em] sm:text-5xl">Something broke</h1>
        <p className="max-w-md text-[var(--muted-foreground)]">
          An unexpected error occurred while rendering this page. Your data is safe — try again, or
          head back and re-open the page.
        </p>
        {/* Ops handle: the message plus the digest Next assigns for prod
            stack matching. Safe to show — it's an internal tool and the
            message came from our own code, not user input. */}
        <p className="mx-auto mt-2 max-w-md break-words rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 font-mono text-xs text-[var(--muted-foreground)]">
          {error.message || "Unknown error"}
          {error.digest && <span className="opacity-70"> · {error.digest}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={reset}>
          <RotateCw className="h-4 w-4" />
          Try again
        </Button>
        {session ? (
          <BackLink href={ROLE_HOMES[session.role]}>Back to your dashboard</BackLink>
        ) : (
          <BackLink href="/login">Go to sign-in</BackLink>
        )}
      </div>
    </main>
  );
}
