"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Trash2,
  X,
} from "lucide-react";

import { DoctorForm } from "@/components/admin/doctor-form";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Modal } from "@/components/primitives/modal";
import {
  Field,
  PasswordSection,
  ProfileSection,
  Section,
  StatusHeader,
} from "@/components/sysadmin/account-sections";
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
  useUpdateDoctor,
} from "@/lib/use-api";
import type { AccountRole, AccountRosterEntry } from "@/types/api";

const ROLE_LABEL: Record<AccountRole, string> = {
  "sys-admin": "Sys-admin",
  admin: "Admin",
  healthworker: "Healthworker",
  doctor: "Doctor",
};

// Inline detail/edit panel — sits beside the grid (no overlay, no dim) so
// the table stays visible and clickable while a row is open.
export function AccountPanel({
  account,
  onClose,
}: {
  account: AccountRosterEntry;
  onClose: () => void;
}) {
  return (
    <motion.aside
      key={account.username}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="w-full lg:w-[26rem] lg:shrink-0"
    >
      <Card
        variant="elevated"
        className="flex flex-col overflow-hidden lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-5">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg tracking-[-0.01em]">{account.username}</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              {ROLE_LABEL[account.role]} account
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel" className="-mr-2 -mt-1 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {account.manageable ? (
            <ManageableBody account={account} onClose={onClose} />
          ) : account.role === "doctor" && account.doctorId !== null ? (
            <DoctorBody doctorId={account.doctorId} />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              This account is read-only here.
            </p>
          )}
        </div>
      </Card>
    </motion.aside>
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
