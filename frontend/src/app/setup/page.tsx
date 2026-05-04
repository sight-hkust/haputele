"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, KeyRound, Plus, ServerCog, Trash2 } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Input, Label } from "@/components/primitives/input";
import { SectionLabel } from "@/components/primitives/section-label";
import { Select } from "@/components/primitives/select";
import { ApiError } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { fadeIn, fadeInUp, staggerTight } from "@/lib/motion";
import {
  useInitializeSystem,
  useSetupStatus,
  useVerifySetupToken,
} from "@/lib/use-api";

const DEFAULT_TZ = "Asia/Colombo";

// Fallback list for browsers without Intl.supportedValuesOf (pre-2022 builds).
// The runtime check below prefers the full IANA set when available.
const FALLBACK_TZ = [
  "UTC",
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
];

function listTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      return intl.supportedValuesOf("timeZone");
    } catch {
      // fall through to fallback
    }
  }
  return FALLBACK_TZ;
}

// The wizard is public (no auth, no Topbar) — it predates the existence of any
// account. SetupRequiredMiddleware lets /setup through pre-init; post-init the
// middleware returns 409 setup_already_completed on /setup/initialize and we
// also poll /setup/status here so a stale tab doesn't pretend the system is
// still uninitialized.
export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupWizard />
    </Suspense>
  );
}

type Stage = "token" | "configure";

function SetupWizard() {
  const router = useRouter();
  const status = useSetupStatus();

  // If the system is already initialized, bounce to login. We still mount the
  // wizard for the brief moment status is loading so the operator sees the
  // expected screen rather than a flicker.
  useEffect(() => {
    if (status.data?.initialized) router.replace("/login");
  }, [status.data?.initialized, router]);

  // The setup session is held in an HttpOnly cookie after step 1 — no
  // need to thread a token through React state any more.
  const [stage, setStage] = useState<Stage>("token");

  return (
    <main className="relative min-h-screen overflow-hidden">
      <Ambient />
      <BrandStrip />

      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-24 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerTight}
          className="flex flex-col gap-7"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel pulse>
              {stage === "token" ? "Step 1 of 2 · Setup token" : "Step 2 of 2 · Configure"}
            </SectionLabel>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="font-display text-[2.75rem] leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-[3.75rem]"
          >
            {stage === "token" ? (
              <>
                Welcome to{" "}
                <span className="gradient-text">HapuTele</span>.
              </>
            ) : (
              <>
                Configure your <span className="gradient-text">clinic</span>.
              </>
            )}
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="max-w-lg text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg"
          >
            {stage === "token"
              ? "Paste the one-time setup token printed when the api container started. Find it in the container logs or at /data/setup-token inside the api container."
              : "Your sys-admin account, institute identity, and timezone defaults. You can change everything except the sys-admin username later."}
          </motion.p>

          {stage === "token" ? (
            <TokenStage onVerified={() => setStage("configure")} />
          ) : (
            <ConfigureStage
              onSessionExpired={() => setStage("token")}
              onInitialized={() => router.replace("/login")}
            />
          )}

          <motion.p variants={fadeIn} className="text-xs text-[var(--muted-foreground)]">
            Stuck? Run <code className="rounded bg-[var(--muted)] px-1 py-0.5 font-mono text-[11px]">docker compose logs api | grep -A1 banner</code> for the latest token banner.
          </motion.p>
        </motion.div>

        <div className="hidden lg:flex lg:items-center lg:justify-center">
          <SetupHeroGraphic stage={stage} />
        </div>
      </div>
    </main>
  );
}

// ── Step 1 — token entry ──────────────────────────────────────────────

function TokenStage({ onVerified }: { onVerified: () => void }) {
  const verify = useVerifySetupToken();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Paste the setup token to continue.");
      return;
    }
    try {
      await verify.mutateAsync({ token: trimmed });
      onVerified();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(explainError(err.error));
      } else {
        setError("Couldn't reach the server. Try again in a moment.");
      }
    }
  };

  return (
    <motion.form
      variants={fadeInUp}
      onSubmit={onSubmit}
      className="flex w-full max-w-md flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="setup-token">Setup token</Label>
        <Input
          id="setup-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          autoFocus
          spellCheck={false}
          placeholder="e.g. FoQBaDPMaTOrnwh3h-zdjpAsEi6lkcDiV2ADnyUJRSQ"
          required
        />
      </div>

      {error && <ErrorPill>{error}</ErrorPill>}

      <Button type="submit" size="lg" disabled={verify.isPending} className="w-full sm:w-auto">
        <KeyRound className="h-4 w-4" />
        {verify.isPending ? "Verifying…" : "Verify token"}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Button>
    </motion.form>
  );
}

// ── Step 2 — configure ─────────────────────────────────────────────────

function ConfigureStage({
  onSessionExpired,
  onInitialized,
}: {
  onSessionExpired: () => void;
  onInitialized: () => void;
}) {
  const initialize = useInitializeSystem();
  const timezones = useMemo(listTimezones, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [instituteName, setInstituteName] = useState("");
  const [addressLines, setAddressLines] = useState<string[]>([""]);
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [appTimezone, setAppTimezone] = useState(DEFAULT_TZ);
  const [exportTimezone, setExportTimezone] = useState(DEFAULT_TZ);
  const [masterConsentVersion, setMasterConsentVersion] = useState("v1");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Cheap client-side validation — server validates again and is authoritative.
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Passwords don't match.");
      return;
    }
    const lines = addressLines.map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) {
      setError("Provide at least one address line.");
      return;
    }
    if (!instituteName.trim() || !contactPhone.trim() || !contactEmail.trim()) {
      setError("Fill every institute identity field.");
      return;
    }

    try {
      await initialize.mutateAsync({
        sysAdmin: { username: username.trim(), password },
        instituteIdentity: {
          name: instituteName.trim(),
          addressLines: lines,
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim(),
        },
        appTimezone: appTimezone.trim(),
        exportTimezone: exportTimezone.trim(),
        masterConsentVersion: masterConsentVersion.trim(),
      });
      onInitialized();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.error === "setup_session_invalid") {
          setError("Your setup session expired. Restart with a fresh token.");
          // Small delay so the operator sees the message before we bounce.
          setTimeout(onSessionExpired, 1200);
          return;
        }
        setError(explainError(err.error));
      } else {
        setError("Couldn't reach the server. Try again in a moment.");
      }
    }
  };

  return (
    <motion.form
      variants={fadeInUp}
      onSubmit={onSubmit}
      className="flex w-full max-w-2xl flex-col gap-6"
    >
      {/* Sys-admin account */}
      <FieldGroup title="Sys-admin account">
        <Field label="Username" htmlFor="sa-user">
          <Input
            id="sa-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. ops"
            autoComplete="username"
            required
          />
        </Field>
        <Field
          label="Password"
          htmlFor="sa-pw"
          hint="At least 10 characters. Avoid words like 'admin'."
        >
          <Input
            id="sa-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>
        <Field label="Confirm password" htmlFor="sa-pw2">
          <Input
            id="sa-pw2"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>
      </FieldGroup>

      {/* Institute identity */}
      <FieldGroup title="Institute identity">
        <Field label="Institute name" htmlFor="i-name">
          <Input
            id="i-name"
            value={instituteName}
            onChange={(e) => setInstituteName(e.target.value)}
            placeholder="e.g. HapuTele Demo Clinic"
            required
          />
        </Field>
        <div className="flex flex-col gap-2">
          <Label>Address lines</Label>
          {addressLines.map((line, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={line}
                onChange={(e) => {
                  const next = [...addressLines];
                  next[idx] = e.target.value;
                  setAddressLines(next);
                }}
                placeholder={idx === 0 ? "Street and number" : "City / postcode"}
              />
              {addressLines.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setAddressLines(addressLines.filter((_, i) => i !== idx))}
                  aria-label={`Remove address line ${idx + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setAddressLines([...addressLines, ""])}
            className="self-start"
          >
            <Plus className="h-4 w-4" />
            Add line
          </Button>
        </div>
        <Field label="Contact phone" htmlFor="i-phone">
          <Input
            id="i-phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+94 11 555 0100"
            required
          />
        </Field>
        <Field label="Contact email" htmlFor="i-email">
          <Input
            id="i-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="ops@example.com"
            required
          />
        </Field>
      </FieldGroup>

      {/* Defaults */}
      <FieldGroup title="Defaults">
        <Field
          label="App timezone"
          htmlFor="tz-app"
          hint="IANA zone for clinic-facing dates (calendar, PDFs)."
        >
          <Select
            id="tz-app"
            value={appTimezone}
            onChange={(e) => setAppTimezone(e.target.value)}
            required
          >
            <TimezoneOptions zones={timezones} current={appTimezone} />
          </Select>
        </Field>
        <Field
          label="Export timezone"
          htmlFor="tz-export"
          hint="IANA zone for medication-pickup and prescription-zip windows."
        >
          <Select
            id="tz-export"
            value={exportTimezone}
            onChange={(e) => setExportTimezone(e.target.value)}
            required
          >
            <TimezoneOptions zones={timezones} current={exportTimezone} />
          </Select>
        </Field>
        <Field
          label="Master consent version"
          htmlFor="mcv"
          hint="Stamped on every patient consent record for audit. Bump when you revise the consent text."
        >
          <Input
            id="mcv"
            value={masterConsentVersion}
            onChange={(e) => setMasterConsentVersion(e.target.value)}
            placeholder="v1"
            required
          />
        </Field>
      </FieldGroup>

      {error && <ErrorPill>{error}</ErrorPill>}

      <Button
        type="submit"
        size="lg"
        disabled={initialize.isPending}
        className="w-full sm:w-auto"
      >
        <ServerCog className="h-4 w-4" />
        {initialize.isPending ? "Initializing…" : "Initialize system"}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Button>
    </motion.form>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>}
    </div>
  );
}

// If the operator-configured default isn't in the browser's IANA list (rare —
// some Linux containers ship a tighter tzdata), inject it so the controlled
// `value` always matches an option and React doesn't warn.
function TimezoneOptions({ zones, current }: { zones: string[]; current: string }) {
  const list = zones.includes(current) ? zones : [current, ...zones];
  return (
    <>
      {list.map((tz) => (
        <option key={tz} value={tz}>
          {tz}
        </option>
      ))}
    </>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 p-5">
      <legend className="px-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function ErrorPill({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
    >
      {children}
    </motion.div>
  );
}

function Ambient() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-[var(--accent)]/[0.04] blur-[150px]" />
      <div className="absolute -right-32 bottom-0 h-[520px] w-[520px] rounded-full bg-[var(--accent-secondary)]/[0.05] blur-[150px]" />
    </div>
  );
}

function BrandStrip() {
  return (
    <div className="absolute inset-x-0 top-0 z-10 px-6 py-6 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] shadow-accent">
            <span className="font-display text-lg leading-none text-white">H</span>
          </div>
          <span className="font-display text-xl tracking-[-0.01em]">HapuTele</span>
        </div>
        <span className="hidden font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)] sm:block">
          First-run setup
        </span>
      </div>
    </div>
  );
}

function SetupHeroGraphic({ stage }: { stage: Stage }) {
  return (
    <div className="relative aspect-square w-full max-w-md">
      <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-[var(--accent)]/10 via-[var(--accent-secondary)]/5 to-transparent blur-2xl" />
      <div className="relative flex h-full w-full items-center justify-center rounded-[2rem] border border-[var(--border)] bg-[var(--card)]/80 p-12 shadow-sm backdrop-blur">
        <motion.div
          key={stage}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center gap-6 text-center"
        >
          <div className="rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-5 shadow-accent">
            {stage === "token" ? (
              <KeyRound className="h-10 w-10 text-white" />
            ) : (
              <ServerCog className="h-10 w-10 text-white" />
            )}
          </div>
          <div>
            <p className="font-display text-xl tracking-[-0.01em]">
              {stage === "token" ? "Bring the token" : "Seal the system"}
            </p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {stage === "token"
                ? "Single-use, printed in the api container logs."
                : "One transaction, then the system is live."}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
