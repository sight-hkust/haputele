"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Input, Label } from "@/components/primitives/input";
import { SectionLabel } from "@/components/primitives/section-label";
import { LoginHeroGraphic } from "@/components/marketing/login-hero-graphic";
import { ROLE_HOMES, useAuth, type Role } from "@/lib/auth";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { fadeIn, fadeInUp, staggerTight } from "@/lib/motion";
import { useSetupStatus } from "@/lib/use-api";

// Login response no longer carries the JWT — the backend sets it as an
// HttpOnly cookie. We just receive the user's identity, role, and the
// session expiry for UI display.
type LoginResponse = { username: string; role: Role; expiresAt: string };

// Wrap the screen in Suspense — `useSearchParams` opts the page out of static
// prerendering and Next requires a boundary to render the skeleton fallback.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const { session, login, loading } = useAuth();
  const setupStatus = useSetupStatus();
  const uninitialized = setupStatus.data?.initialized === false;
  const setupLoaded = setupStatus.data !== undefined;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-init: nobody can sign in yet — bounce every visitor to the wizard so
  // the (app) guard's "no session → /login" path doesn't dead-end on a form
  // they can't submit. Runs before the session-aware redirect so a stale
  // localStorage session from a wiped-then-rebuilt DB also lands on /setup.
  useEffect(() => {
    if (uninitialized) router.replace("/setup");
  }, [uninitialized, router]);

  // Already signed in → bounce to the role home (or the page they were trying to reach).
  // Wait for setup status so we don't push a stale session into a protected
  // page that would immediately 409 setup_required.
  useEffect(() => {
    if (loading || !session || !setupLoaded || uninitialized) return;
    const next = search.get("next") || ROLE_HOMES[session.role];
    router.replace(next);
  }, [session, loading, setupLoaded, uninitialized, router, search]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      login({ username: res.username, role: res.role, expiresAt: res.expiresAt });
      const next = search.get("next") || ROLE_HOMES[res.role];
      router.replace(next);
    } catch (err) {
      // Backend returns a stable `invalid_credentials` code regardless of
      // which field was wrong, so the error never leaks user existence.
      if (err instanceof ApiError && err.status === 401) {
        setError(explainError(err.error));
      } else {
        setError("Couldn't reach the server. Try again in a moment.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Don't flash the form while we're (a) waiting for setup status to land or
  // (b) about to bounce to /setup. Same minimal "Loading…" the (app) guard uses.
  if (!setupLoaded || uninitialized) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          Loading…
        </span>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Ambient corner glows — felt more than seen */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-[var(--accent)]/[0.04] blur-[150px]" />
        <div className="absolute -right-32 bottom-0 h-[520px] w-[520px] rounded-full bg-[var(--accent-secondary)]/[0.05] blur-[150px]" />
      </div>

      {/* Brand strip */}
      <div className="absolute inset-x-0 top-0 z-10 px-6 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] shadow-accent">
              <span className="font-display text-lg leading-none text-white">H</span>
            </div>
            <span className="font-display text-xl tracking-[-0.01em]">HapuTele</span>
          </div>
          <span className="hidden font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)] sm:block">
            Telemedicine · Sri Lanka
          </span>
        </div>
      </div>

      {/* Two-column form / graphic — asymmetric 1.1fr / 0.9fr per the design spec */}
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-24 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerTight}
          className="flex flex-col gap-7"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel pulse>Secure portal · ready</SectionLabel>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="font-display text-[2.75rem] leading-[1.05] tracking-[-0.02em] sm:text-6xl lg:text-[4.5rem]"
          >
            Welcome back to{" "}
            <span className="relative inline-block">
              <span className="gradient-text">HapuTele</span>
              <span
                aria-hidden
                className="absolute -bottom-1 left-0 h-3 w-full rounded-sm md:h-4"
                style={{
                  background:
                    "linear-gradient(to right, rgba(0, 82, 255, 0.18), rgba(77, 124, 255, 0.10))",
                }}
              />
            </span>
            .
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="max-w-md text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg"
          >
            Sign in to continue your work.
          </motion.p>

          <motion.form
            variants={fadeInUp}
            onSubmit={onSubmit}
            className="flex w-full max-w-md flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="your.username"
                autoFocus
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                {error}
              </motion.div>
            )}

            <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? "Signing in…" : "Sign in"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.form>

          <motion.p variants={fadeIn} className="text-sm text-[var(--muted-foreground)]">
            Need access? Contact your administrator.
          </motion.p>
        </motion.div>

        {/* Hero graphic — hidden on mobile so the form takes the screen */}
        <div className="hidden lg:block">
          <LoginHeroGraphic />
        </div>
      </div>
    </main>
  );
}
