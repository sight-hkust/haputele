"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Trash2,
} from "lucide-react";

import { DoctorForm } from "@/components/admin/doctor-form";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { Drawer } from "@/components/primitives/drawer";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Modal } from "@/components/primitives/modal";
import { useAuth } from "@/lib/auth";
import { explainError } from "@/lib/error-codes";
import { doctorName, fmtDateTime } from "@/lib/format";
import {
  useApproveDoctor,
  useDeactivateDoctor,
  useDeleteAccount,
  useDisableAccount,
  useDoctor,
  useEnableAccount,
  useReissueDoctorInvite,
  useRejectDoctor,
  useResetAccountPassword,
  useUpdateAccount,
  useUpdateDoctor,
} from "@/lib/use-api";
import type { AccountRole, AccountRosterEntry } from "@/types/api";

const ROLE_LABEL: Record<AccountRole, string> = {
  "sys-admin": "Sys-admin",
  admin: "Admin",
  healthworker: "Healthworker",
  doctor: "Doctor",
};

const MIN_PASSWORD_LEN = 10;

export function AccountDrawer({
  account,
  onClose,
}: {
  account: AccountRosterEntry | null;
  onClose: () => void;
}) {
  const { session } = useAuth();
  // Retain the last account through the close animation so the panel doesn't
  // blank out mid-slide. `account` is re-derived from live roster data by the
  // parent, so edits/disables reflect here without a frozen snapshot.
  const [shown, setShown] = useState(account);
  useEffect(() => {
    if (account) setShown(account);
  }, [account]);
  const data = account ?? shown;
  const isSelf = data?.username === session?.username;

  return (
    <Drawer
      open={account !== null}
      onClose={onClose}
      title={data?.username}
      description={data ? `${ROLE_LABEL[data.role]} account${isSelf ? " · you" : ""}` : undefined}
    >
      {data ? (
        data.manageable ? (
          <ManageableBody key={data.username} account={data} onClose={onClose} />
        ) : data.role === "doctor" && data.doctorId !== null ? (
          <DoctorBody key={data.username} doctorId={data.doctorId} />
        ) : isSelf ? (
          <SelfBody key={data.username} account={data} />
        ) : (
          <SysAdminBody />
        )
      ) : null}
    </Drawer>
  );
}

// ── manageable: admin / healthworker ─────────────────────────────────────

function ManageableBody({
  account,
  onClose,
}: {
  account: AccountRosterEntry;
  onClose: () => void;
}) {
  const disable = useDisableAccount();
  const enable = useEnableAccount();
  const del = useDeleteAccount();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isDisabled = account.disabledAt !== null;
  const statusBusy = disable.isPending || enable.isPending;

  return (
    <div className="flex flex-col gap-8">
      <StatusHeader
        active={!isDisabled}
        label={isDisabled ? "Disabled" : "Active"}
        sub={isDisabled && account.disabledAt ? `since ${fmtDateTime(account.disabledAt)}` : undefined}
      />

      <ProfileSection account={account} />

      <Section title="Sign-in">
        <p className="text-sm text-[var(--muted-foreground)]">
          {isDisabled
            ? "This account is disabled and can't sign in. Its records are preserved."
            : "This account can sign in. Disable it to block access without losing its history."}
        </p>
        {isDisabled ? (
          <Button variant="secondary" disabled={statusBusy} onClick={() => enable.mutate(account.username)}>
            <ShieldCheck className="h-4 w-4" />
            Enable sign-in
          </Button>
        ) : (
          <Button variant="secondary" disabled={statusBusy} onClick={() => disable.mutate(account.username)}>
            <ShieldOff className="h-4 w-4" />
            Disable sign-in
          </Button>
        )}
        {(disable.error || enable.error) ? (
          <ErrorBanner>{explainError((disable.error ?? enable.error)!.error)}</ErrorBanner>
        ) : null}
      </Section>

      <PasswordSection username={account.username} />

      <Section title="Danger zone" tone="danger">
        <p className="text-sm text-[var(--muted-foreground)]">
          Permanently delete this account. Blocked if it has created any records — disable it instead.
        </p>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" />
          Delete account
        </Button>
      </Section>

      <Modal
        open={deleteOpen}
        onClose={() => !del.isPending && setDeleteOpen(false)}
        title="Delete account"
        description={`Permanently delete "${account.username}". This can't be undone.`}
      >
        <div className="flex flex-col gap-4">
          {del.error ? <ErrorBanner>{explainError(del.error.error)}</ErrorBanner> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(account.username, {
                  onSuccess: () => {
                    setDeleteOpen(false);
                    onClose();
                  },
                })
              }
            >
              {del.isPending ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── self: the signed-in sys-admin editing their own account ──────────────

function SelfBody({ account }: { account: AccountRosterEntry }) {
  return (
    <div className="flex flex-col gap-8">
      <StatusHeader active label="Active" sub="The ops super user — that's you" />
      <ProfileSection account={account} />
      <PasswordSection username={account.username} self />
      <Card variant="flat" className="p-4 text-xs text-[var(--muted-foreground)]">
        You can edit your own profile and password here, but the ops account can&apos;t be disabled or
        deleted — that would lock the platform out of administration.
      </Card>
    </div>
  );
}

// ── sys-admin (read-only fallback) ───────────────────────────────────────

function SysAdminBody() {
  return (
    <div className="flex flex-col gap-6">
      <StatusHeader active label="Active" sub="Ops super user" />
      <Card variant="flat" className="p-5 text-sm text-[var(--muted-foreground)]">
        This is the platform&apos;s singleton ops account. It can&apos;t be disabled, deleted, or edited
        from another session.
      </Card>
    </div>
  );
}

// ── shared editable sections ─────────────────────────────────────────────

function ProfileSection({ account }: { account: AccountRosterEntry }) {
  const update = useUpdateAccount();
  const [fullName, setFullName] = useState(account.fullName ?? "");
  const [contact, setContact] = useState(account.contact ?? "");
  const dirty = fullName !== (account.fullName ?? "") || contact !== (account.contact ?? "");

  return (
    <Section title="Profile">
      <Field label="Username">
        <Input value={account.username} disabled />
        <Hint>Usernames can&apos;t be changed — delete and recreate to rename.</Hint>
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
          onClick={() => update.mutate({ username: account.username, body: { fullName, contact } })}
          disabled={!dirty || update.isPending}
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Section>
  );
}

function PasswordSection({ username, self = false }: { username: string; self?: boolean }) {
  const resetPw = useResetAccountPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    if (password.length < MIN_PASSWORD_LEN)
      return setPwError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    if (password !== confirm) return setPwError("Passwords do not match.");
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

// ── doctor: reuse the full doctor management surface ─────────────────────

function DoctorBody({ doctorId }: { doctorId: number }) {
  const qc = useQueryClient();
  const doctor = useDoctor(doctorId);
  const update = useUpdateDoctor(doctorId);
  const deactivate = useDeactivateDoctor();
  const approve = useApproveDoctor();
  const reject = useRejectDoctor();
  const reissue = useReissueDoctorInvite();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviteJustSent, setInviteJustSent] = useState(false);

  // Doctor hooks invalidate ["doctors"]; the sysadmin roster keys off
  // ["sysadmin","accounts"], so refresh it too after any doctor change.
  const refreshRoster = () => qc.invalidateQueries({ queryKey: ["sysadmin", "accounts"] });

  if (doctor.error) {
    return <ErrorBanner>{explainError(doctor.error.error)}</ErrorBanner>;
  }
  if (!doctor.data) {
    return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;
  }

  const d = doctor.data;
  const errCode = update.error?.error ?? null;
  const missing = (update.error?.detail?.missing as string[] | undefined) ?? undefined;
  const errorMessage = errCode
    ? errCode === "missing_prescription_fields"
      ? "Some §1.7 mandatory fields couldn't be validated server-side."
      : explainError(errCode)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <StatusHeader active={d.active} label={d.active ? "Active" : "Inactive"} sub={doctorName(d)} />

      {d.onboardingStatus === "awaiting_approval" && (
        <Card className="border-sky-200 bg-sky-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-sky-100 p-2">
              <ShieldCheck className="h-4 w-4 text-sky-700" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sky-900">Awaiting your approval</p>
              <p className="mt-1 text-sm text-sky-800">
                This doctor submitted their profile. Review the fields below, then approve to let them log in.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRejectOpen(true)} disabled={approve.isPending || reject.isPending}>
                  <ShieldX className="h-4 w-4" />
                  Reject
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => approve.mutate(d.id, { onSuccess: refreshRoster })}
                  disabled={approve.isPending}
                >
                  <CheckCircle2 className={`h-4 w-4 ${approve.isPending ? "animate-pulse" : ""}`} />
                  {approve.isPending ? "Approving…" : "Approve"}
                </Button>
              </div>
              {approve.error && <ErrorBanner className="mt-3">{explainError(approve.error.error)}</ErrorBanner>}
            </div>
          </div>
        </Card>
      )}

      {d.onboardingStatus === "rejected" && (
        <Card className="border-rose-200 bg-rose-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-rose-100 p-2">
              <ShieldX className="h-4 w-4 text-rose-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-rose-900">Submission rejected</p>
              <p className="mt-1 text-sm text-rose-800">
                The doctor can&apos;t log in. Re-issue an invite if you want them to try again.
              </p>
            </div>
          </div>
        </Card>
      )}

      {d.onboardingStatus === "awaiting_setup" && (
        <Card className="border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <Mail className="h-4 w-4 text-amber-700" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">Awaiting onboarding</p>
              <p className="mt-1 text-sm text-amber-800">
                This doctor hasn&apos;t set their password yet. The most recent invite link is still active.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    reissue.mutate(d.id, {
                      onSuccess: () => {
                        setInviteJustSent(true);
                        setTimeout(() => setInviteJustSent(false), 4000);
                      },
                    })
                  }
                  disabled={reissue.isPending}
                >
                  <RefreshCw className={`h-4 w-4 ${reissue.isPending ? "animate-spin" : ""}`} />
                  {reissue.isPending ? "Sending…" : "Re-send invite"}
                </Button>
                {inviteJustSent && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Sent
                  </span>
                )}
              </div>
              {reissue.error && <ErrorBanner className="mt-3">{explainError(reissue.error.error)}</ErrorBanner>}
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3">
        <span className="text-sm text-[var(--muted-foreground)]">
          {d.active ? "Doctor is active and bookable." : "Doctor is deactivated."}
        </span>
        {d.active ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            <ShieldOff className="h-4 w-4" />
            Deactivate
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => update.mutate({ active: true }, { onSuccess: refreshRoster })}
            disabled={update.isPending}
          >
            <ShieldCheck className="h-4 w-4" />
            Reactivate
          </Button>
        )}
      </div>

      <DoctorForm
        mode="update"
        initial={d}
        submitting={update.isPending}
        errorMessage={errorMessage}
        errorMissingFields={missing}
        submitLabel="Save changes"
        onSubmit={(payload) => {
          const body: Record<string, unknown> = {
            givenName: payload.givenName,
            familyName: payload.familyName,
            contact: payload.contact,
            email: payload.email,
            slmcRegistrationNumber: payload.slmcRegistrationNumber,
            qualifications: payload.qualifications,
            practitionerAddress: payload.practitionerAddress,
            instituteName: payload.instituteName,
            instituteContact: payload.instituteContact,
          };
          if (payload.password) body.password = payload.password;
          if (payload.rubberStampImage) body.rubberStampImage = payload.rubberStampImage;
          update.mutate(body, { onSuccess: refreshRoster });
        }}
      />

      <Modal
        open={rejectOpen}
        onClose={() => !reject.isPending && setRejectOpen(false)}
        title="Reject this submission?"
        description="The doctor won't be able to log in. They'll see the reason you enter below if they try."
      >
        {reject.error && <ErrorBanner className="mb-3">{explainError(reject.error.error)}</ErrorBanner>}
        <div className="mb-4 flex flex-col gap-2">
          <Label htmlFor="reject-reason">Reason (shown to the doctor)</Label>
          <Input
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. SLMC number couldn't be verified"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={reject.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reject.isPending}
            onClick={() =>
              reject.mutate(
                { id: d.id, reason: rejectReason.trim() || undefined },
                {
                  onSuccess: () => {
                    setRejectOpen(false);
                    setRejectReason("");
                    refreshRoster();
                  },
                },
              )
            }
          >
            {reject.isPending ? "Rejecting…" : "Reject submission"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => !deactivate.isPending && setConfirmOpen(false)}
        title="Deactivate this doctor?"
        description="The doctor stays in the database — past appointments and consultations are preserved — but they won't appear in healthworker booking. Reactivate any time."
      >
        {deactivate.error && <ErrorBanner className="mb-3">{explainError(deactivate.error.error)}</ErrorBanner>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={deactivate.isPending}>
            Keep active
          </Button>
          <Button
            variant="destructive"
            disabled={deactivate.isPending}
            onClick={() =>
              deactivate.mutate(d.id, {
                onSuccess: () => {
                  setConfirmOpen(false);
                  refreshRoster();
                },
              })
            }
          >
            {deactivate.isPending ? "Deactivating…" : "Deactivate"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ── shared pieces ─────────────────────────────────────────────────────────

function StatusHeader({ active, label, sub }: { active: boolean; label: string; sub?: string }) {
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

function Section({
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--muted-foreground)]">{children}</p>;
}
