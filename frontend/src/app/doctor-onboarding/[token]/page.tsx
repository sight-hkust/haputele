"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Lock, AlertCircle, CheckCircle2 } from "lucide-react";

import { DoctorForm, type DoctorFormPayload } from "@/components/admin/doctor-form";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { Input, Label } from "@/components/primitives/input";
import { SectionLabel } from "@/components/primitives/section-label";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { fadeIn, fadeInUp, staggerTight } from "@/lib/motion";

// Peek response:
//   mode "new"      → email + optional familyName hint. Doctor fills full profile.
//   mode "rotation" → email + givenName + familyName. Doctor just rotates pw.
type PeekResponse = {
  mode: "new" | "rotation";
  email: string;
  familyName?: string | null;
  givenName?: string | null;
};

const MIN_PASSWORD_LEN = 8;

type PageState =
  | { mode: "loading" }
  | { mode: "invalid"; reason: string }
  | { mode: "ready"; peek: PeekResponse }
  | { mode: "submitted_rotation" }
  | { mode: "submitted_new" };

export default function DoctorOnboardingPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const router = useRouter();

  const [state, setState] = useState<PageState>({ mode: "loading" });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const peek = await api<PeekResponse>(`/doctor-onboarding/${token}`, {
          skipAuthRedirect: true,
        });
        if (!cancelled) setState({ mode: "ready", peek });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
          setState({ mode: "invalid", reason: explainError(err.error) });
        } else {
          setState({
            mode: "invalid",
            reason: "Couldn't reach the server. Try again in a moment.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-[var(--accent)]/[0.04] blur-[150px]" />
        <div className="absolute -right-32 bottom-0 h-[520px] w-[520px] rounded-full bg-[var(--accent-secondary)]/[0.05] blur-[150px]" />
      </div>

      <div className="absolute inset-x-0 top-0 z-10 px-6 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] shadow-accent">
              <span className="font-display text-lg leading-none text-white">H</span>
            </div>
            <span className="font-display text-xl tracking-[-0.01em]">HapuTele</span>
          </div>
          <span className="hidden font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)] sm:block">
            Practitioner onboarding
          </span>
        </div>
      </div>

      <div
        className={`mx-auto flex min-h-screen ${
          state.mode === "ready" && state.peek.mode === "new"
            ? "max-w-4xl items-start"
            : "max-w-2xl items-center"
        } justify-center px-6 py-24 sm:px-8`}
      >
        {state.mode === "loading" && <LoadingPanel />}
        {state.mode === "invalid" && <InvalidPanel reason={state.reason} />}
        {state.mode === "submitted_rotation" && (
          <SuccessPanel
            title="Password set."
            message="Taking you to the sign-in page…"
            redirectTo="/login"
          />
        )}
        {state.mode === "submitted_new" && (
          <SuccessPanel
            title="Submitted for review."
            message="An administrator will review your profile shortly. You'll be able to sign in once it's approved."
            redirectTo="/login"
            redirectDelayMs={3500}
          />
        )}
        {state.mode === "ready" && state.peek.mode === "rotation" && (
          <RotationPanel
            token={token}
            peek={state.peek}
            onDone={() => setState({ mode: "submitted_rotation" })}
            onInvalid={(reason) => setState({ mode: "invalid", reason })}
          />
        )}
        {state.mode === "ready" && state.peek.mode === "new" && (
          <NewDoctorPanel
            token={token}
            peek={state.peek}
            onDone={() => setState({ mode: "submitted_new" })}
            onInvalid={(reason) => setState({ mode: "invalid", reason })}
          />
        )}
      </div>
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Loading / invalid / success
 * ────────────────────────────────────────────────────────────────── */

function LoadingPanel() {
  return (
    <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
      Checking your invitation…
    </span>
  );
}

function InvalidPanel({ reason }: { reason: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerTight}
      className="flex max-w-md flex-col items-start gap-6"
    >
      <motion.div variants={fadeInUp}>
        <SectionLabel className="border-rose-300/40 bg-rose-100/40">
          <span className="text-rose-700">Invite unavailable</span>
        </SectionLabel>
      </motion.div>
      <motion.div variants={fadeInUp} className="flex items-start gap-3">
        <AlertCircle className="mt-1 h-6 w-6 flex-shrink-0 text-rose-600" />
        <h1 className="font-display text-3xl leading-tight tracking-[-0.02em] sm:text-4xl">
          This link can&rsquo;t be used.
        </h1>
      </motion.div>
      <motion.p
        variants={fadeIn}
        className="text-base leading-relaxed text-[var(--muted-foreground)]"
      >
        {reason}
      </motion.p>
    </motion.div>
  );
}

function SuccessPanel({
  title,
  message,
  redirectTo,
  redirectDelayMs = 1800,
}: {
  title: string;
  message: string;
  redirectTo: string;
  redirectDelayMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(redirectTo), redirectDelayMs);
    return () => clearTimeout(t);
  }, [router, redirectTo, redirectDelayMs]);
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerTight}
      className="flex max-w-md flex-col items-start gap-6"
    >
      <motion.div variants={fadeInUp}>
        <SectionLabel pulse>Submitted</SectionLabel>
      </motion.div>
      <motion.div variants={fadeInUp} className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-6 w-6 flex-shrink-0 text-emerald-600" />
        <h1 className="font-display text-3xl leading-tight tracking-[-0.02em] sm:text-4xl">
          {title}
        </h1>
      </motion.div>
      <motion.p
        variants={fadeIn}
        className="text-base leading-relaxed text-[var(--muted-foreground)]"
      >
        {message}
      </motion.p>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Rotation: just a password
 * ────────────────────────────────────────────────────────────────── */

function RotationPanel({
  token,
  peek,
  onDone,
  onInvalid,
}: {
  token: string;
  peek: PeekResponse;
  onDone: () => void;
  onInvalid: (reason: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Choose a password at least ${MIN_PASSWORD_LEN} characters long.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match. Re-enter to confirm.");
      return;
    }
    setSubmitting(true);
    try {
      await api(`/doctor-onboarding/${token}`, {
        method: "POST",
        body: { password },
        skipAuthRedirect: true,
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        onInvalid(explainError(err.error));
      } else if (err instanceof ApiError) {
        setError(explainError(err.error));
      } else {
        setError("Couldn't reach the server. Try again in a moment.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerTight}
      className="flex w-full max-w-md flex-col gap-7"
    >
      <motion.div variants={fadeInUp}>
        <SectionLabel pulse>Invite verified</SectionLabel>
      </motion.div>

      <motion.h1
        variants={fadeInUp}
        className="font-display text-[2.5rem] leading-[1.05] tracking-[-0.02em] sm:text-5xl"
      >
        Welcome,{" "}
        <span className="gradient-text">
          Dr. {peek.familyName ?? ""}
        </span>
        .
      </motion.h1>

      <motion.p
        variants={fadeInUp}
        className="text-base leading-relaxed text-[var(--muted-foreground)]"
      >
        Set a password to finish setting up your account.
      </motion.p>

      <motion.form
        variants={fadeInUp}
        onSubmit={onSubmit}
        className="flex w-full flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
            minLength={MIN_PASSWORD_LEN}
            autoFocus
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
          <Lock className="h-4 w-4" />
          {submitting ? "Setting password…" : "Set password & continue"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </motion.form>

      <motion.p variants={fadeIn} className="text-sm text-[var(--muted-foreground)]">
        Trouble signing in? Contact your administrator.
      </motion.p>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * New doctor: full §1.7 profile form
 * ────────────────────────────────────────────────────────────────── */

function NewDoctorPanel({
  token,
  peek,
  onDone,
  onInvalid,
}: {
  token: string;
  peek: PeekResponse;
  onDone: () => void;
  onInvalid: (reason: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorMissing, setErrorMissing] = useState<string[] | undefined>(undefined);

  const onSubmit = async (payload: DoctorFormPayload) => {
    setErrorMessage(null);
    setErrorMissing(undefined);
    if (!payload.password || payload.password.length < MIN_PASSWORD_LEN) {
      setErrorMessage(`Choose a password at least ${MIN_PASSWORD_LEN} characters long.`);
      return;
    }
    if (!payload.username) {
      setErrorMessage("Pick a username.");
      return;
    }
    if (!payload.rubberStampImage) {
      setErrorMessage("Upload your rubber-stamp image.");
      return;
    }
    setSubmitting(true);
    try {
      await api(`/doctor-onboarding/${token}`, {
        method: "POST",
        body: {
          // Intentionally no `email` — the invite owns that value and
          // the server uses invite.email when creating the Doctor row.
          // Sending one here would just get dropped by the schema.
          username: payload.username,
          password: payload.password,
          givenName: payload.givenName,
          familyName: payload.familyName,
          contact: payload.contact,
          slmcRegistrationNumber: payload.slmcRegistrationNumber,
          qualifications: payload.qualifications,
          practitionerAddress: payload.practitionerAddress,
          instituteName: payload.instituteName,
          instituteContact: payload.instituteContact,
          rubberStampImage: payload.rubberStampImage,
        },
        skipAuthRedirect: true,
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        onInvalid(explainError(err.error));
      } else if (err instanceof ApiError) {
        if (err.error === "missing_prescription_fields") {
          setErrorMissing(err.detail?.missing as string[] | undefined);
          setErrorMessage(
            "Some §1.7 mandatory fields couldn't be validated server-side.",
          );
        } else {
          setErrorMessage(explainError(err.error));
        }
      } else {
        setErrorMessage("Couldn't reach the server. Try again in a moment.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerTight}
      className="flex w-full flex-col gap-7"
    >
      <motion.div variants={fadeInUp}>
        <SectionLabel pulse>Invite verified</SectionLabel>
      </motion.div>

      <motion.h1
        variants={fadeInUp}
        className="font-display text-[2.5rem] leading-[1.05] tracking-[-0.02em] sm:text-5xl"
      >
        {peek.familyName ? <>Welcome, <span className="gradient-text">Dr. {peek.familyName}</span>.</> : <>Set up your <span className="gradient-text">HapuTele</span> account.</>}
      </motion.h1>

      <motion.p
        variants={fadeInUp}
        className="max-w-2xl text-base leading-relaxed text-[var(--muted-foreground)]"
      >
        Fill in your full profile below. Once you submit, an administrator
        will review your information before activating your account. You
        won&rsquo;t be able to sign in until that approval comes through.
      </motion.p>

      {/* Email is fixed by the invite — show read-only for clarity. */}
      <motion.div variants={fadeInUp}>
        <Card className="flex items-center justify-between gap-3 border-[var(--accent)]/20 bg-[var(--accent)]/[0.04] p-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              Invitation email
            </div>
            <div className="mt-1 text-sm">{peek.email}</div>
          </div>
          <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
            Locked
          </span>
        </Card>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <Card variant="elevated" className="p-6 sm:p-8">
          <DoctorForm
            mode="create"
            // Pass the invited email so the form's email field is pre-filled
            // (the read-only locking happens via the embedded layout below).
            initial={{
              id: 0,
              username: "",
              givenName: "",
              familyName: peek.familyName ?? "",
              contact: "",
              email: peek.email,
              slmcRegistrationNumber: "",
              qualifications: "",
              practitionerAddress: "",
              instituteName: "",
              instituteContact: "",
              active: true,
            }}
            embedded="self-onboarding"
            submitting={submitting}
            errorMessage={errorMessage}
            errorMissingFields={errorMissing}
            submitLabel="Submit for review"
            onSubmit={onSubmit}
          />
        </Card>
      </motion.div>
    </motion.div>
  );
}
