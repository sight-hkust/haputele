"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  Mail,
  MailX,
  Send,
  ShieldCheck,
  ShieldX,
  Stethoscope,
  Trash2,
  UserPlus2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import {
  useApproveDoctor,
  useDoctorInvites,
  useDoctorList,
  useDoctorSummary,
  useRejectDoctor,
  useResendDoctorInvite,
  useRevokeDoctorInvite,
  type DoctorListFilter,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { doctorName, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Doctor, DoctorInvite } from "@/types/api";

type Tab = "all" | "awaiting_approval" | "awaiting_setup" | "active" | "rejected";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting_approval", label: "Awaiting approval" },
  { key: "awaiting_setup", label: "Awaiting setup" },
  { key: "active", label: "Active" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminDoctors() {
  const [tab, setTab] = useState<Tab>("all");
  const summary = useDoctorSummary();
  const filter: DoctorListFilter | undefined =
    tab === "all" ? undefined : { status: tab };
  const list = useDoctorList(filter);
  const invitesQuery = useDoctorInvites();

  // Open email-only invites (no Doctor row yet) share the "Awaiting setup"
  // bucket with the doctors who have a live invite — both mean "emailed,
  // waiting on the doctor to finish setup". They show on "All" and "Awaiting
  // setup", pinned above the doctor grid.
  const showInvites = tab === "all" || tab === "awaiting_setup";
  const invites = showInvites ? invitesQuery.data ?? [] : [];
  const doctors = list.data ?? [];

  // Reject needs a reason, so it opens a modal targeting one doctor.
  const [rejectTarget, setRejectTarget] = useState<Doctor | null>(null);

  const counts = summary.data;
  const countFor = (t: Tab): number | undefined => {
    if (!counts) return undefined;
    switch (t) {
      case "all":
        return counts.total;
      case "awaiting_approval":
        return counts.awaitingApproval;
      case "awaiting_setup":
        // Email-only invites (no Doctor row) live alongside the awaiting-setup
        // doctors in this bucket, so the badge sums both.
        return counts.awaitingSetup + counts.invited;
      case "active":
        return counts.active;
      case "rejected":
        return counts.rejected;
    }
  };

  const loadErr = list.error ?? (showInvites ? invitesQuery.error : null);
  const loading = list.isLoading || (showInvites && invitesQuery.isLoading);
  const isEmpty = invites.length === 0 && doctors.length === 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label="Admin"
        title="Doctor"
        highlight="accounts."
        subtitle="Track onboarding submissions, approve or reject pending doctors, rotate passwords, and manage the §1.7 prescription mandatory fields."
        action={
          <Link href="/admin/doctors/new">
            <Button>
              <UserPlus2 className="h-4 w-4" />
              Create doctor
            </Button>
          </Link>
        }
      />

      {/* Status tabs with live counts. Awaiting-approval (sky) is the
          actionable one — highlighted so new submissions are noticed. */}
      <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/50 p-1">
        {TABS.map(({ key, label }) => {
          const n = countFor(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                tab === key
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
            >
              {label}
              {n !== undefined && n > 0 && (
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                    key === "awaiting_approval"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loadErr ? (
        <ErrorBanner>{explainError(loadErr.error)}</ErrorBanner>
      ) : loading ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      ) : isEmpty ? (
        <EmptyState
          Icon={Stethoscope}
          title={
            tab === "all"
              ? "No doctors yet"
              : `Nothing ${TABS.find((t) => t.key === tab)?.label.toLowerCase()}`
          }
          description={
            tab === "all"
              ? "Create the first doctor account to start booking appointments."
              : `Switch to "All" to see every doctor regardless of status.`
          }
          action={
            tab === "all" && (
              <Link href="/admin/doctors/new">
                <Button>
                  <UserPlus2 className="h-4 w-4" />
                  Create doctor
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Open invites pin above the doctor grid on the All tab. */}
          {invites.map((inv) => (
            <InviteCard key={`invite-${inv.inviteId}`} invite={inv} />
          ))}
          {doctors.map((d) => (
            <DoctorCard key={d.id} doctor={d} onReject={() => setRejectTarget(d)} />
          ))}
        </div>
      )}

      <RejectModal target={rejectTarget} onClose={() => setRejectTarget(null)} />
    </div>
  );
}

function InviteCard({ invite }: { invite: DoctorInvite }) {
  const resend = useResendDoctorInvite();
  const revoke = useRevokeDoctorInvite();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const expired = invite.status === "invite_expired";
  const busy = resend.isPending || revoke.isPending;
  const err = resend.error ?? revoke.error;

  return (
    <Card className="group flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "rounded-xl p-2 shadow-sm",
            expired
              ? "bg-gradient-to-br from-rose-400 to-rose-500"
              : "bg-gradient-to-br from-amber-400 to-amber-500",
          )}
        >
          {expired ? (
            <MailX className="h-5 w-5 text-white" />
          ) : (
            <Mail className="h-5 w-5 text-white" />
          )}
        </div>
        <InviteStatusPill expired={expired} />
      </div>

      <h3 className="mt-4 break-all font-display text-lg tracking-[-0.01em]">{invite.email}</h3>
      {invite.familyName && (
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Name hint: {invite.familyName}
        </p>
      )}
      <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted-foreground)]">
        <Clock className="h-3 w-3" />
        Sent {fmtRelative(invite.createdAt)}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-[11px]",
          expired ? "text-rose-600" : "text-[var(--muted-foreground)]",
        )}
      >
        {expired ? "Expired" : "Expires"} {fmtRelative(invite.expiresAt)}
      </p>

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Hasn&rsquo;t completed onboarding yet — no profile on file.
      </div>

      {err && <ErrorBanner className="mt-3">{explainError(err.error)}</ErrorBanner>}

      <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-4">
        {confirmRevoke ? (
          <>
            <span className="flex-1 text-xs text-[var(--muted-foreground)]">Revoke this invite?</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => revoke.mutate(invite.inviteId)}
              disabled={revoke.isPending}
            >
              {revoke.isPending ? "Revoking…" : "Revoke"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRevoke(false)}
              disabled={revoke.isPending}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => resend.mutate(invite.inviteId)}
              disabled={busy}
            >
              <Send className={cn("h-4 w-4", resend.isPending && "animate-pulse")} />
              {resend.isPending ? "Resending…" : "Resend"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRevoke(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Revoke
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function InviteStatusPill({ expired }: { expired: boolean }) {
  return expired ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-rose-700">
      <MailX className="h-3 w-3" />
      Expired
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-700">
      <Mail className="h-3 w-3" />
      Awaiting setup
    </span>
  );
}

function DoctorCard({ doctor: d, onReject }: { doctor: Doctor; onReject: () => void }) {
  const approve = useApproveDoctor();
  const awaiting = d.onboardingStatus === "awaiting_approval";
  const rejected = d.onboardingStatus === "rejected";

  return (
    <Card className="group flex h-full flex-col p-6">
      <Link href={`/admin/doctors/${d.id}`} className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-2 shadow-accent transition-transform duration-300 group-hover:scale-110">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusPills doctor={d} />
          </div>
        </div>
        <h3 className="mt-4 font-display text-xl tracking-[-0.01em]">{doctorName(d)}</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{d.email}</p>
        {d.submittedAt && (
          <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted-foreground)]">
            <Clock className="h-3 w-3" />
            Submitted {fmtRelative(d.submittedAt)}
          </p>
        )}
        {rejected && d.rejectedReason && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-800">
            {d.rejectedReason}
            {d.rejectedBy ? ` — by ${d.rejectedBy}` : ""}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border)] pt-4">
          <Mini label="SLMC" value={d.slmcRegistrationNumber} />
          <Mini label="Institute" value={d.instituteName} />
        </div>
      </Link>

      {/* Inline triage actions for the awaiting-approval bucket so the
          admin can clear the queue without opening each doctor. */}
      {awaiting && (
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-4">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => approve.mutate(d.id)}
            disabled={approve.isPending}
          >
            <CheckCircle2 className={cn("h-4 w-4", approve.isPending && "animate-pulse")} />
            {approve.isPending ? "Approving…" : "Approve"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onReject} disabled={approve.isPending}>
            <ShieldX className="h-4 w-4" />
            Reject
          </Button>
        </div>
      )}
      {approve.error && (
        <ErrorBanner className="mt-3">{explainError(approve.error.error)}</ErrorBanner>
      )}
    </Card>
  );
}

function StatusPills({ doctor: d }: { doctor: Doctor }) {
  // One coherent status pill. A doctor still in a pending lifecycle state
  // (awaiting setup / approval) isn't usable yet, so they never show "Active"
  // — the previous double-pill ("Active" + "Awaiting setup") was misleading.
  // "Inactive" is reserved for a genuinely-active doctor who's been deactivated.
  const status = d.onboardingStatus ?? "active";
  if (status === "awaiting_setup") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-700">
        <Mail className="h-3 w-3" />
        Awaiting setup
      </span>
    );
  }
  if (status === "awaiting_approval") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-sky-700">
        <ShieldCheck className="h-3 w-3" />
        Awaiting approval
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-rose-700">
        <XCircle className="h-3 w-3" />
        Rejected
      </span>
    );
  }
  // active lifecycle — distinguish enabled vs deactivated
  return d.active ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
      <XCircle className="h-3 w-3" />
      Inactive
    </span>
  );
}

function RejectModal({ target, onClose }: { target: Doctor | null; onClose: () => void }) {
  const reject = useRejectDoctor();
  const [reason, setReason] = useState("");

  return (
    <Modal
      open={target !== null}
      onClose={() => !reject.isPending && onClose()}
      title="Reject this submission?"
      description="The doctor won't be able to log in. They'll see the reason you enter below if they try."
    >
      {reject.error && (
        <ErrorBanner className="mb-3">{explainError(reject.error.error)}</ErrorBanner>
      )}
      <div className="mb-4 flex flex-col gap-2">
        <Label htmlFor="reject-reason">Reason (shown to the doctor)</Label>
        <Input
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. SLMC number couldn't be verified"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={reject.isPending}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() =>
            target &&
            reject.mutate(
              { id: target.id, reason: reason.trim() || undefined },
              {
                onSuccess: () => {
                  setReason("");
                  onClose();
                },
              },
            )
          }
          disabled={reject.isPending}
        >
          {reject.isPending ? "Rejecting…" : "Reject submission"}
        </Button>
      </div>
    </Modal>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="truncate text-xs text-[var(--foreground)]">{value}</div>
    </div>
  );
}
