"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { CapsLockHint } from "@/components/primitives/caps-lock-hint";
import { newPasswordError, passwordError } from "@/lib/credentials";
import { useCapsLock } from "@/lib/use-caps-lock";
import { explainError } from "@/lib/error-codes";
import { useI18n } from "@/lib/i18n";
import { useResetAccountPassword, useUpdateAccount } from "@/lib/use-api";

// The slice of an account these editable sections need. Both the roster
// entry and the /sysadmin/me payload are structurally compatible.
type ProfileTarget = { username: string; fullName: string | null; contact: string | null };

// Editable display name + contact. `onSaved` fires after a successful save
// (used by the self-account view to refresh /sysadmin/me).
export function ProfileSection({
  account,
  onSaved,
}: {
  account: ProfileTarget;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const update = useUpdateAccount();
  const [fullName, setFullName] = useState(account.fullName ?? "");
  const [contact, setContact] = useState(account.contact ?? "");
  const dirty = fullName !== (account.fullName ?? "") || contact !== (account.contact ?? "");

  return (
    <Section title={t("nav.profile")}>
      <Field label={t("forms.username")}>
        <Input value={account.username} disabled />
        <Hint>{t("pages.sysadmin.accounts.usernameImmutable")}</Hint>
      </Field>
      <Field label={t("pages.sysadmin.sharedAccounts.fullNameOptional")}>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("pages.sysadmin.accounts.fullNamePlaceholder")}
        />
      </Field>
      <Field label={t("pages.sysadmin.sharedAccounts.phoneOptional")}>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t("pages.sysadmin.accounts.phonePlaceholder")}
        />
      </Field>
      {update.error ? <ErrorBanner>{explainError(update.error.error)}</ErrorBanner> : null}
      <div>
        <Button
          onClick={() =>
            update.mutate(
              {
                username: account.username,
                body: { fullName: fullName.trim(), contact: contact.trim() },
              },
              { onSuccess: onSaved },
            )
          }
          disabled={!dirty || update.isPending}
        >
          {update.isPending ? t("common.saving") : t("common.saveChanges")}
        </Button>
      </div>
    </Section>
  );
}

// Set/change a password. `self` only tweaks the copy.
export function PasswordSection({ username, self = false }: { username: string; self?: boolean }) {
  const { t } = useI18n();
  const resetPw = useResetAccountPassword();
  const [password, setPassword] = useState("");
  const passwordCaps = useCapsLock();
  const confirmCaps = useCapsLock();
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    // Rejected, never repaired — see lib/credentials.ts.
    const pwErr = newPasswordError(password);
    if (pwErr) return setPwError(pwErr);
    if (password !== confirm) return setPwError(t("pages.sysadmin.sharedAccounts.passwordsDoNotMatch"));
    resetPw.mutate(
      { username, password },
      {
        onSuccess: () => {
          setPassword("");
          setConfirm("");
          setPwDone(true);
        },
      },
    );
  };

  return (
    <Section title={t("pages.sysadmin.sharedAccounts.password")}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          {self
            ? t("pages.sysadmin.accounts.changeOwnPasswordHint")
            : t("pages.sysadmin.accounts.setPasswordHint")}
        </p>
        <Field label={t("onboarding.newPassword")} error={passwordError(password) ?? undefined}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            {...passwordCaps.capsLockProps}
          />
          <CapsLockHint id={passwordCaps.hintId} show={passwordCaps.capsLockOn} />
        </Field>
        <Field label={t("pages.sysadmin.sharedAccounts.confirmPassword")}>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            {...confirmCaps.capsLockProps}
          />
          <CapsLockHint id={confirmCaps.hintId} show={confirmCaps.capsLockOn} />
        </Field>
        {pwError ? <ErrorBanner>{pwError}</ErrorBanner> : null}
        {resetPw.error ? <ErrorBanner>{explainError(resetPw.error.error)}</ErrorBanner> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={resetPw.isPending || !password}>
            {resetPw.isPending
              ? t("common.saving")
              : self
                ? t("pages.sysadmin.accounts.changePassword")
                : t("pages.sysadmin.accounts.setNewPassword")}
          </Button>
          {pwDone ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("common.updated")}
            </span>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

// ── layout helpers (shared) ────────────────────────────────────────────

export function StatusHeader({
  active,
  label,
  sub,
}: {
  active: boolean;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] " +
          (active
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700")
        }
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-rose-500"}`}
          aria-hidden
        />
        {label}
      </span>
      {sub ? <span className="truncate text-sm text-[var(--muted-foreground)]">{sub}</span> : null}
    </div>
  );
}

export function Section({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3
        className={
          "font-mono text-xs uppercase tracking-[0.15em] " +
          (tone === "danger" ? "text-rose-600" : "text-[var(--muted-foreground)]")
        }
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--muted-foreground)]">{children}</p>;
}
