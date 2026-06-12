"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { explainError } from "@/lib/error-codes";
import { useResetAccountPassword, useUpdateAccount } from "@/lib/use-api";

export const MIN_PASSWORD_LEN = 10;

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
  const update = useUpdateAccount();
  const [fullName, setFullName] = useState(account.fullName ?? "");
  const [contact, setContact] = useState(account.contact ?? "");
  const dirty = fullName !== (account.fullName ?? "") || contact !== (account.contact ?? "");

  return (
    <Section title="Profile">
      <Field label="Username">
        <Input value={account.username} disabled />
        <Hint>Usernames can&apos;t be changed.</Hint>
      </Field>
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Alice Adams" />
      </Field>
      <Field label="Phone / contact">
        <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. +94 77 123 4567" />
      </Field>
      {update.error ? <ErrorBanner>{explainError(update.error.error)}</ErrorBanner> : null}
      <div>
        <Button
          onClick={() => update.mutate({ username: account.username, body: { fullName: fullName.trim(), contact: contact.trim() } }, { onSuccess: onSaved })}
          disabled={!dirty || update.isPending}
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Section>
  );
}

// Set/change a password. `self` only tweaks the copy.
export function PasswordSection({ username, self = false }: { username: string; self?: boolean }) {
  const resetPw = useResetAccountPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    // Trim before validating/sending so the stored secret matches what
    // /auth/login trims on the way back in.
    const pw = password.trim();
    if (pw.length < MIN_PASSWORD_LEN)
      return setPwError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    if (pw !== confirm.trim()) return setPwError("Passwords do not match.");
    resetPw.mutate(
      { username, password: pw },
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
    <Section title="Password">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          {self
            ? "Change your own password. You'll keep your current session."
            : "Set a new password and share it with them directly — they can sign in with it immediately."}
        </p>
        <Field label="New password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        {pwError ? <ErrorBanner>{pwError}</ErrorBanner> : null}
        {resetPw.error ? <ErrorBanner>{explainError(resetPw.error.error)}</ErrorBanner> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={resetPw.isPending || !password}>
            {resetPw.isPending ? "Saving…" : self ? "Change password" : "Set new password"}
          </Button>
          {pwDone ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Updated
            </span>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

// ── layout helpers (shared) ────────────────────────────────────────────

export function StatusHeader({ active, label, sub }: { active: boolean; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] " +
          (active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")
        }
      >
        <span className={"h-1.5 w-1.5 rounded-full " + (active ? "bg-emerald-500" : "bg-rose-500")} aria-hidden />
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
          "font-mono text-[10px] uppercase tracking-[0.15em] " +
          (tone === "danger" ? "text-rose-600" : "text-[var(--muted-foreground)]")
        }
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--muted-foreground)]">{children}</p>;
}
