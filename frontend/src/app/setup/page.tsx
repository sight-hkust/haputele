"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, KeyRound, Plus, ServerCog, Trash2, Users } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Input, Label } from "@/components/primitives/input";
import { SectionLabel } from "@/components/primitives/section-label";
import { Select } from "@/components/primitives/select";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { explainError } from "@/lib/error-codes";
import { fadeIn, fadeInUp, staggerTight } from "@/lib/motion";
import {
  useCreateOperatingAccount,
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

type Stage = "token" | "configure" | "operating-accounts";

function SetupWizard() {
  const router = useRouter();
  const status = useSetupStatus();

  // The setup session is held in an HttpOnly cookie after step 1 — no
  // need to thread a token through React state any more.
  const [stage, setStage] = useState<Stage>("token");

  // If the system is already initialized, bounce to login — but only
  // while we're still in stages 1-2. Stage 3 ("operating accounts")
  // runs *after* initialize flips status to true; the wizard owns that
  // state and must not self-evict when React Query refetches status.
  useEffect(() => {
    if (stage === "operating-accounts") return;
    if (status.data?.initialized) router.replace("/login");
  }, [stage, status.data?.initialized, router]);

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
              {stage === "token"
                ? "Step 1 of 3 · Setup token"
                : stage === "configure"
                  ? "Step 2 of 3 · Configure"
                  : "Step 3 of 3 · Operating accounts"}
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
            ) : stage === "configure" ? (
              <>
                Configure your <span className="gradient-text">clinic</span>.
              </>
            ) : (
              <>
                Add your <span className="gradient-text">team</span>.
              </>
            )}
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="max-w-lg text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg"
          >
            {stage === "token"
              ? "Paste the one-time setup token printed when the api container started. Find it in the container logs or at /data/setup-token inside the api container."
              : stage === "configure"
                ? "Your sys-admin account, institute identity, and timezone defaults. You can change everything except the sys-admin username later."
                : "Optional — create the admins and healthworkers who will run day-to-day operations."}
          </motion.p>

          {stage === "token" ? (
            <TokenStage onVerified={() => setStage("configure")} />
          ) : stage === "configure" ? (
            <ConfigureStage
              onSessionExpired={() => setStage("token")}
              onInitialized={() => setStage("operating-accounts")}
            />
          ) : (
            <OperatingAccountsStage />
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

// Backend error codes are field-specific on the wire; the frontend used to
// render them all in a single bottom-of-form banner, which made the operator
// guess which input was wrong. This map routes each code to the input that
// owns it. Codes not in the map fall through to `_form` (the top-level pill).
const BACKEND_ERROR_TO_FIELD: Record<string, string> = {
  setup_password_too_short: "password",
  setup_password_weak: "password",
  setup_username_taken: "username",
  setup_address_required: "addressLines",
  setup_institute_name_required: "instituteName",
  setup_institute_phone_required: "contactPhone",
};

function ConfigureStage({
  onSessionExpired,
  onInitialized,
}: {
  onSessionExpired: () => void;
  onInitialized: () => void;
}) {
  const { login } = useAuth();
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
  // Per-field errors. `_form` is reserved for non-field-specific messages
  // (network failure, session expired). Cleared on every onSubmit so a
  // resubmit walks the rules from a clean slate.
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Validation gate: walk every field, collect every error, apply them
    // in one pass. If anything is wrong, no API call fires.
    const next: Record<string, string> = {};

    if (!username.trim()) next.username = "Username is required.";

    if (!password) next.password = "Password is required.";
    else if (password.length < 10) next.password = "Password must be at least 10 characters.";

    if (!passwordConfirm) next.passwordConfirm = "Confirm your password.";
    else if (password && password !== passwordConfirm) next.passwordConfirm = "Passwords don't match.";

    if (!instituteName.trim()) next.instituteName = "Institute name is required.";

    const lines = addressLines.map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) next.addressLines = "Provide at least one address line.";

    if (!contactPhone.trim()) next.contactPhone = "Contact phone is required.";
    if (!contactEmail.trim()) next.contactEmail = "Contact email is required.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      const result = await initialize.mutateAsync({
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
      login({ username: result.username, role: result.role, expiresAt: result.expiresAt });
      onInitialized();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.error === "setup_session_invalid") {
          setErrors({ _form: "Your setup session expired. Restart with a fresh token." });
          // Small delay so the operator sees the message before we bounce.
          setTimeout(onSessionExpired, 1200);
          return;
        }
        const field = BACKEND_ERROR_TO_FIELD[err.error] ?? "_form";
        setErrors({ [field]: explainError(err.error) });
      } else {
        setErrors({ _form: "Couldn't reach the server. Try again in a moment." });
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
        <Field label="Username" htmlFor="sa-user" error={errors.username}>
          <Input
            id="sa-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. ops"
            autoComplete="username"
          />
        </Field>
        <Field
          label="Password"
          htmlFor="sa-pw"
          hint="At least 10 characters. Avoid words like 'admin'."
          error={errors.password}
        >
          <Input
            id="sa-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password" htmlFor="sa-pw2" error={errors.passwordConfirm}>
          <Input
            id="sa-pw2"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </FieldGroup>

      {/* Institute identity */}
      <FieldGroup title="Institute identity">
        <Field label="Institute name" htmlFor="i-name" error={errors.instituteName}>
          <Input
            id="i-name"
            value={instituteName}
            onChange={(e) => setInstituteName(e.target.value)}
            placeholder="e.g. HapuTele Demo Clinic"
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
                placeholder="Address line"
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
          {errors.addressLines && <ErrorPill>{errors.addressLines}</ErrorPill>}
        </div>
        <Field label="Contact phone" htmlFor="i-phone" error={errors.contactPhone}>
          <Input
            id="i-phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+94 11 555 0100"
          />
        </Field>
        <Field label="Contact email" htmlFor="i-email" error={errors.contactEmail}>
          <Input
            id="i-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="ops@example.com"
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

      {errors._form && <ErrorPill>{errors._form}</ErrorPill>}

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

// ── Step 3 — operating accounts (optional) ─────────────────────────

type DraftAccount = {
  id: number;
  username: string;
  password: string;
  passwordConfirm: string;
  // Per-row error. Populated by onSubmit's validation pass or by an API
  // failure on this row; cleared at the start of every onSubmit so a fix
  // and resubmit walks the rows from a clean slate.
  error?: string;
};

function OperatingAccountsStage() {
  const router = useRouter();
  const create = useCreateOperatingAccount();
  const seqRef = useRef(0);
  const newDraft = useCallback((): DraftAccount => {
    seqRef.current += 1;
    return { id: seqRef.current, username: "", password: "", passwordConfirm: "" };
  }, []);

  const [admins, setAdmins] = useState<DraftAccount[]>(() => [newDraft()]);
  const [healthworkers, setHealthworkers] = useState<DraftAccount[]>(() => [newDraft()]);
  const [submitting, setSubmitting] = useState(false);

  const updateDraft = (
    setter: typeof setAdmins,
    id: number,
    patch: Partial<DraftAccount>,
  ) => setter((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeDraft = (setter: typeof setAdmins, id: number) =>
    setter((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));

  const addDraft = (setter: typeof setAdmins) =>
    setter((rows) => [...rows, newDraft()]);

  const hasAnyFilled = (rows: DraftAccount[]) =>
    rows.some((r) => r.username.trim() || r.password || r.passwordConfirm);

  const onSkip = () => {
    router.replace("/sysadmin");
  };

  // Pure validator — never touches state, returns the message or undefined.
  const validateRow = (r: DraftAccount): string | undefined => {
    if (!r.username.trim()) return "Username is required.";
    if (!r.password) return "Password is required.";
    if (r.password.length < 10) return "Password must be at least 10 characters.";
    if (r.password !== r.passwordConfirm) return "Passwords do not match.";
    return undefined;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // A row counts as "intended" if the operator typed anything in it.
    // Fully-empty rows are silently dropped — they're placeholder slots
    // from the "+ Add another" button the operator didn't end up using.
    const adminRows = admins.filter(
      (r) => r.username.trim() || r.password || r.passwordConfirm,
    );
    const hwRows = healthworkers.filter(
      (r) => r.username.trim() || r.password || r.passwordConfirm,
    );
    if (adminRows.length === 0 && hwRows.length === 0) {
      onSkip();
      return;
    }

    // Validation gate: collect every row's error in one pass and apply
    // them all at once. If any row fails, no API calls fire — so partial
    // success (some rows created, one row left over with an error) is
    // impossible from the typo path.
    const errors = new Map<number, string | undefined>();
    for (const r of [...adminRows, ...hwRows]) errors.set(r.id, validateRow(r));
    const hasInvalid = [...errors.values()].some((m) => m !== undefined);

    setAdmins((rows) => rows.map((r) =>
      errors.has(r.id) ? { ...r, error: errors.get(r.id) } : { ...r, error: undefined }
    ));
    setHealthworkers((rows) => rows.map((r) =>
      errors.has(r.id) ? { ...r, error: errors.get(r.id) } : { ...r, error: undefined }
    ));
    if (hasInvalid) return;

    // All validation passed — submit everything. If a row fails on the
    // server (e.g., username collides with a pre-existing DB row), put
    // the message on that row and stop; already-created rows fall away
    // from state so a retry doesn't replay them as username_taken.
    setSubmitting(true);
    try {
      const submitOne = async (
        r: DraftAccount,
        role: "admin" | "healthworker",
        setter: typeof setAdmins,
      ): Promise<boolean> => {
        try {
          await create.mutateAsync({
            username: r.username.trim(),
            password: r.password,
            role,
          });
          setter((rows) => rows.filter((existing) => existing.id !== r.id));
          return true;
        } catch (err) {
          const msg =
            err instanceof ApiError
              ? explainError(err.error)
              : "Couldn't reach the server. Try again in a moment.";
          updateDraft(setter, r.id, { error: msg });
          return false;
        }
      };

      for (const r of adminRows) {
        if (!(await submitOne(r, "admin", setAdmins))) return;
      }
      for (const r of hwRows) {
        if (!(await submitOne(r, "healthworker", setHealthworkers))) return;
      }
      router.replace("/sysadmin");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-2xl flex-col gap-6">
      <FieldGroup title="Admins">
        {admins.map((row, idx) => (
          <AccountDraftRow
            key={row.id}
            idPrefix={`admin-${row.id}`}
            value={row}
            onChange={(patch) => updateDraft(setAdmins, row.id, patch)}
            onRemove={admins.length > 1 ? () => removeDraft(setAdmins, row.id) : null}
            showLabel={idx === 0}
          />
        ))}
        <Button type="button" variant="ghost" onClick={() => addDraft(setAdmins)}>
          <Plus className="size-4" aria-hidden /> Add another admin
        </Button>
      </FieldGroup>

      <FieldGroup title="Healthworkers">
        {healthworkers.map((row, idx) => (
          <AccountDraftRow
            key={row.id}
            idPrefix={`hw-${row.id}`}
            value={row}
            onChange={(patch) => updateDraft(setHealthworkers, row.id, patch)}
            onRemove={
              healthworkers.length > 1
                ? () => removeDraft(setHealthworkers, row.id)
                : null
            }
            showLabel={idx === 0}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          onClick={() => addDraft(setHealthworkers)}
        >
          <Plus className="size-4" aria-hidden /> Add another healthworker
        </Button>
      </FieldGroup>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onSkip} disabled={submitting}>
          Skip — finish setup
        </Button>
        <Button
          type="submit"
          disabled={
            submitting || (!hasAnyFilled(admins) && !hasAnyFilled(healthworkers))
          }
        >
          {submitting ? "Creating…" : "Create accounts & continue"}{" "}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}

function AccountDraftRow({
  idPrefix,
  value,
  onChange,
  onRemove,
  showLabel,
}: {
  idPrefix: string;
  value: DraftAccount;
  onChange: (patch: Partial<DraftAccount>) => void;
  onRemove: (() => void) | null;
  showLabel: boolean;
}) {
  const usernameInput = (
    <Input
      id={`${idPrefix}-user`}
      aria-label="Username"
      value={value.username}
      onChange={(e) => onChange({ username: e.target.value })}
      autoComplete="username"
    />
  );
  const passwordInput = (
    <Input
      id={`${idPrefix}-pw`}
      aria-label="Password"
      type="password"
      value={value.password}
      onChange={(e) => onChange({ password: e.target.value })}
      autoComplete="new-password"
      minLength={10}
    />
  );
  const confirmInput = (
    <Input
      id={`${idPrefix}-pw2`}
      aria-label="Confirm password"
      type="password"
      value={value.passwordConfirm}
      onChange={(e) => onChange({ passwordConfirm: e.target.value })}
      autoComplete="new-password"
    />
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {showLabel ? (
        <>
          <Field label="Username" htmlFor={`${idPrefix}-user`}>{usernameInput}</Field>
          <Field label="Password" htmlFor={`${idPrefix}-pw`}>{passwordInput}</Field>
          <Field label="Confirm password" htmlFor={`${idPrefix}-pw2`}>{confirmInput}</Field>
        </>
      ) : (
        <>
          {usernameInput}
          {passwordInput}
          {confirmInput}
        </>
      )}
      {value.error && (
        <div className="md:col-span-3">
          <ErrorPill>{value.error}</ErrorPill>
        </div>
      )}
      {onRemove && (
        <div className="md:col-span-3">
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>}
      {error && <ErrorPill>{error}</ErrorPill>}
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
            ) : stage === "configure" ? (
              <ServerCog className="h-10 w-10 text-white" />
            ) : (
              <Users className="h-10 w-10 text-white" />
            )}
          </div>
          <div>
            <p className="font-display text-xl tracking-[-0.01em]">
              {stage === "token"
                ? "Bring the token"
                : stage === "configure"
                  ? "Seal the system"
                  : "Build your team"}
            </p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {stage === "token"
                ? "Single-use, printed in the api container logs."
                : stage === "configure"
                  ? "One transaction, then the system is live."
                  : "Add admins and healthworkers, or skip for now."}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
