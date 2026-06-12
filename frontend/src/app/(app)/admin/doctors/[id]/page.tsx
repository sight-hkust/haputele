"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Mail, RefreshCw, ShieldCheck, ShieldX, Trash2, ToggleLeft, ToggleRight, UserPlus2, XCircle } from "lucide-react";

import { DoctorForm } from "@/components/admin/doctor-form";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { StatusBadge } from "@/components/primitives/status-badge";
import {
  useApproveDoctor,
  useDeactivateDoctor,
  useDoctor,
  usePurgeDoctor,
  useReinviteReapply,
  useReissueDoctorInvite,
  useRejectDoctor,
  useUpdateDoctor,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { doctorName, fmtDateTime } from "@/lib/format";

export default function DoctorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const router = useRouter();

  const doctor = useDoctor(Number.isFinite(id) ? id : null);
  const update = useUpdateDoctor(id);
  const deactivate = useDeactivateDoctor();
  const reissueInvite = useReissueDoctorInvite();
  const reapply = useReinviteReapply();
  const purge = usePurgeDoctor();
  const approve = useApproveDoctor();
  const reject = useRejectDoctor();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  // Lightweight one-shot ack after re-sending. Cleared when the user
  // navigates away (component unmount). No toast system in scope here,
  // so we render a small inline pill.
  const [inviteJustSent, setInviteJustSent] = useState(false);
  const [reapplyJustSent, setReapplyJustSent] = useState(false);

  if (doctor.error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ErrorBanner>{explainError(doctor.error.error)}</ErrorBanner>
      </div>
    );
  }
  if (!doctor.data) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      </div>
    );
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
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to doctors
      </Link>

      <PageHeader
        label={`Doctor #${d.id}`}
        title={doctorName(d)}
        subtitle={d.email}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={d.active ? "completed" : "cancelled"} />
            {d.active ? (
              <Button variant="ghost" size="md" onClick={() => setConfirmOpen(true)}>
                <ToggleRight className="h-4 w-4" />
                Deactivate
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                onClick={() => update.mutate({ active: true })}
                disabled={update.isPending}
              >
                <ToggleLeft className="h-4 w-4" />
                Reactivate
              </Button>
            )}
          </div>
        }
      />

      {/* Audit line — when the submission came in, who acted on it, and a
          link back to a prior rejected attempt if this is a reapplication. */}
      <div className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--muted-foreground)]">
        {d.submittedAt && <span>Submitted {fmtDateTime(d.submittedAt)}</span>}
        {d.approvedAt && (
          <span>
            Approved {fmtDateTime(d.approvedAt)}
            {d.approvedBy ? ` by ${d.approvedBy}` : ""}
          </span>
        )}
        {d.rejectedAt && (
          <span>
            Rejected {fmtDateTime(d.rejectedAt)}
            {d.rejectedBy ? ` by ${d.rejectedBy}` : ""}
          </span>
        )}
        {d.previousDoctorId != null && (
          <Link
            href={`/admin/doctors/${d.previousDoctorId}`}
            className="text-[var(--accent)] hover:underline"
          >
            ← previous attempt #{d.previousDoctorId}
          </Link>
        )}
      </div>

      {/* Awaiting-approval banner — the doctor has submitted their
          profile, you need to review and click Approve (or Reject). */}
      {d.onboardingStatus === "awaiting_approval" && (
        <Card className="border-sky-200 bg-sky-50/50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-sky-100 p-2">
                <ShieldCheck className="h-4 w-4 text-sky-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-sky-900">
                  Awaiting your approval
                </p>
                <p className="mt-1 text-sm text-sky-800">
                  This doctor submitted their profile. Review the §1.7 fields
                  below, then approve to let them log in.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setRejectOpen(true)}
                disabled={approve.isPending || reject.isPending}
              >
                <ShieldX className="h-4 w-4" />
                Reject
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => approve.mutate(d.id)}
                disabled={approve.isPending}
              >
                <CheckCircle2 className={`h-4 w-4 ${approve.isPending ? "animate-pulse" : ""}`} />
                {approve.isPending ? "Approving…" : "Approve"}
              </Button>
            </div>
          </div>
          {approve.error && (
            <ErrorBanner className="mt-3">{explainError(approve.error.error)}</ErrorBanner>
          )}
        </Card>
      )}

      {/* Rejected banner — tombstone state. The record is kept for audit;
          the admin can invite a fresh reapplication (new submission) or
          permanently erase the record. */}
      {d.onboardingStatus === "rejected" && (
        <Card className="border-rose-200 bg-rose-50/50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-rose-100 p-2">
                <XCircle className="h-4 w-4 text-rose-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-rose-900">
                  Submission rejected
                </p>
                <p className="mt-1 text-sm text-rose-800">
                  The doctor can&rsquo;t log in.{" "}
                  {d.rejectedReason ? `Reason: ${d.rejectedReason}.` : ""} Invite
                  them to reapply for a fresh submission, or erase the record.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {reapplyJustSent && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Sent
                </span>
              )}
              <Button
                variant="ghost"
                size="md"
                onClick={() => setPurgeOpen(true)}
                disabled={purge.isPending || reapply.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Erase
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() =>
                  reapply.mutate(d.id, {
                    onSuccess: () => {
                      setReapplyJustSent(true);
                      setTimeout(() => setReapplyJustSent(false), 4000);
                    },
                  })
                }
                disabled={reapply.isPending}
              >
                <UserPlus2 className={`h-4 w-4 ${reapply.isPending ? "animate-pulse" : ""}`} />
                {reapply.isPending ? "Sending…" : "Invite to reapply"}
              </Button>
            </div>
          </div>
          {reapply.error && (
            <ErrorBanner className="mt-3">{explainError(reapply.error.error)}</ErrorBanner>
          )}
        </Card>
      )}

      {/* Awaiting-setup banner. Only renders when there's a live unconsumed
          invite for this doctor; folds in the re-send affordance so the
          admin doesn't have to dig for it. */}
      {d.onboardingStatus === "awaiting_setup" && (
        <Card className="border-amber-200 bg-amber-50/50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-100 p-2">
                <Mail className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Awaiting onboarding
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  This doctor hasn&rsquo;t set their password yet. The most
                  recent invite link is still active.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {inviteJustSent && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Sent
                </span>
              )}
              <Button
                variant="secondary"
                size="md"
                onClick={() =>
                  reissueInvite.mutate(d.id, {
                    onSuccess: () => {
                      setInviteJustSent(true);
                      // Hide the "Sent" pill after 4s so it doesn't sit there forever.
                      setTimeout(() => setInviteJustSent(false), 4000);
                    },
                  })
                }
                disabled={reissueInvite.isPending}
              >
                <RefreshCw className={`h-4 w-4 ${reissueInvite.isPending ? "animate-spin" : ""}`} />
                {reissueInvite.isPending ? "Sending…" : "Re-send invite"}
              </Button>
            </div>
          </div>
          {reissueInvite.error && (
            <ErrorBanner className="mt-3">
              {explainError(reissueInvite.error.error)}
            </ErrorBanner>
          )}
        </Card>
      )}

      <Card variant="elevated" className="p-8">
        <DoctorForm
          mode="update"
          initial={d}
          submitting={update.isPending}
          errorMessage={errorMessage}
          errorMissingFields={missing}
          submitLabel="Save changes"
          onSubmit={(payload) => {
            // Strip undefined so we don't accidentally send `null` rubber stamp etc.
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
            if (payload.defaultSignatureImage) body.defaultSignatureImage = payload.defaultSignatureImage;
            if (payload.clearDefaultSignature) body.clearDefaultSignature = true;
            update.mutate(body);
          }}
          onCancel={() => router.push("/admin")}
        />
      </Card>

      <Modal
        open={rejectOpen}
        onClose={() => !reject.isPending && setRejectOpen(false)}
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
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. SLMC number couldn't be verified"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setRejectOpen(false)}
            disabled={reject.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              reject.mutate(
                { id: d.id, reason: rejectReason.trim() || undefined },
                {
                  onSuccess: () => {
                    setRejectOpen(false);
                    setRejectReason("");
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

      <Modal
        open={confirmOpen}
        onClose={() => !deactivate.isPending && setConfirmOpen(false)}
        title="Deactivate this doctor?"
        description="The doctor stays in the database — past appointments and consultations are preserved — but they won't appear in healthworker booking. Reactivate any time."
      >
        {deactivate.error && (
          <ErrorBanner className="mb-3">{explainError(deactivate.error.error)}</ErrorBanner>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setConfirmOpen(false)}
            disabled={deactivate.isPending}
          >
            Keep active
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              deactivate.mutate(d.id, { onSuccess: () => setConfirmOpen(false) })
            }
            disabled={deactivate.isPending}
          >
            {deactivate.isPending ? "Deactivating…" : "Deactivate"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={purgeOpen}
        onClose={() => !purge.isPending && setPurgeOpen(false)}
        title="Permanently erase this record?"
        description="This deletes the rejected doctor's account, profile, and uploaded stamp for good. It can't be undone. Use this only for data-erasure requests — to give the doctor another chance, use “Invite to reapply” instead."
      >
        {purge.error && (
          <ErrorBanner className="mb-3">{explainError(purge.error.error)}</ErrorBanner>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setPurgeOpen(false)}
            disabled={purge.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              purge.mutate(d.id, { onSuccess: () => router.push("/admin") })
            }
            disabled={purge.isPending}
          >
            {purge.isPending ? "Erasing…" : "Erase permanently"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
