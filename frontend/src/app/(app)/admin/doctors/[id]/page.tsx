"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckCircle2,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UserPlus2,
  XCircle,
} from "lucide-react";

import { DoctorForm } from "@/components/admin/doctor-form";
import { BackLink } from "@/components/primitives/back-link";
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
import { parseIdParam, throwNotFoundIf404 } from "@/lib/not-found";
import { useI18n } from "@/lib/i18n";

export default function DoctorDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const id = parseIdParam(params.id);
  const router = useRouter();

  const doctor = useDoctor(id);
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
    throwNotFoundIf404(doctor.error);
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ErrorBanner>{explainError(doctor.error.error)}</ErrorBanner>
      </div>
    );
  }
  if (!doctor.data) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">{t("common.loading")}</Card>
      </div>
    );
  }

  const d = doctor.data;
  const errCode = update.error?.error ?? null;
  const missing = (update.error?.detail?.missing as string[] | undefined) ?? undefined;
  const errorMessage = errCode ? explainError(errCode) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      <BackLink href="/admin">{t("pages.admin.doctors.backToDoctors")}</BackLink>

      <PageHeader
        label={t("pages.admin.doctors.doctorId", { id: d.id })}
        title={doctorName(d)}
        subtitle={d.email}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={d.active ? "completed" : "cancelled"} />
            {d.active ? (
              <Button variant="ghost" size="md" onClick={() => setConfirmOpen(true)}>
                <ToggleRight className="h-4 w-4" />
                {t("pages.admin.doctors.deactivate")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                onClick={() => update.mutate({ active: true })}
                disabled={update.isPending}
              >
                <ToggleLeft className="h-4 w-4" />
                {t("pages.admin.doctors.reactivate")}
              </Button>
            )}
          </div>
        }
      />

      {/* Audit line — when the submission came in, who acted on it, and a
          link back to a prior rejected attempt if this is a reapplication. */}
      <div className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[var(--muted-foreground)]">
        {d.submittedAt && (
          <span>{t("pages.admin.doctors.submittedAt", { datetime: fmtDateTime(d.submittedAt) })}</span>
        )}
        {d.approvedAt && (
          <span>
            {t("pages.admin.doctors.approvedAt", {
              datetime: fmtDateTime(d.approvedAt),
              user: d.approvedBy ?? "",
            })}
          </span>
        )}
        {d.rejectedAt && (
          <span>
            {t("pages.admin.doctors.rejectedAt", {
              datetime: fmtDateTime(d.rejectedAt),
              user: d.rejectedBy ?? "",
            })}
          </span>
        )}
        {d.previousDoctorId != null && (
          <Link
            href={`/admin/doctors/${d.previousDoctorId}`}
            className="text-[var(--accent)] hover:underline"
          >
            {t("pages.admin.doctors.previousAttempt", { id: d.previousDoctorId })}
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
                  {t("pages.admin.doctors.awaitingApprovalTitle")}
                </p>
                <p className="mt-1 text-sm text-sky-800">
                  {t("pages.admin.doctors.awaitingApprovalDescription")}
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
                {t("pages.admin.doctors.reject")}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => approve.mutate(d.id)}
                disabled={approve.isPending}
              >
                <CheckCircle2 className={`h-4 w-4 ${approve.isPending ? "animate-pulse" : ""}`} />
                {approve.isPending
                  ? t("pages.admin.doctors.approving")
                  : t("pages.admin.doctors.approve")}
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
                  {t("pages.admin.doctors.rejectedTitle")}
                </p>
                <p className="mt-1 text-sm text-rose-800">
                  {t("pages.admin.doctors.rejectedDescription")}
                  {d.rejectedReason ? ` ${d.rejectedReason}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {reapplyJustSent && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs uppercase tracking-[0.12em] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("pages.admin.doctors.sent")}
                </span>
              )}
              <Button
                variant="ghost"
                size="md"
                onClick={() => setPurgeOpen(true)}
                disabled={purge.isPending || reapply.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {t("pages.admin.doctors.erase")}
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
                {reapply.isPending
                  ? t("pages.admin.doctors.sending")
                  : t("pages.admin.doctors.inviteToReapply")}
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
                  {t("pages.admin.doctors.awaitingSetupTitle")}
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  {t("pages.admin.doctors.awaitingSetupDescription")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {inviteJustSent && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs uppercase tracking-[0.12em] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("pages.admin.doctors.sent")}
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
                {reissueInvite.isPending
                  ? t("pages.admin.doctors.sending")
                  : t("pages.admin.doctors.resend")}
              </Button>
            </div>
          </div>
          {reissueInvite.error && (
            <ErrorBanner className="mt-3">{explainError(reissueInvite.error.error)}</ErrorBanner>
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
          submitLabel={t("common.saveChanges")}
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
            if (payload.defaultSignatureImage)
              body.defaultSignatureImage = payload.defaultSignatureImage;
            if (payload.clearDefaultSignature) body.clearDefaultSignature = true;
            update.mutate(body);
          }}
          onCancel={() => router.push("/admin")}
        />
      </Card>

      <Modal
        open={rejectOpen}
        onClose={() => !reject.isPending && setRejectOpen(false)}
        title={t("pages.admin.doctors.rejectSubmissionTitle")}
        description={t("pages.admin.doctors.rejectSubmissionDescription")}
      >
        {reject.error && (
          <ErrorBanner className="mb-3">{explainError(reject.error.error)}</ErrorBanner>
        )}
        <div className="mb-4 flex flex-col gap-2">
          <Label htmlFor="reject-reason">{t("pages.admin.doctors.rejectReasonLabel")}</Label>
          <Input
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("pages.admin.doctors.rejectReasonPlaceholder")}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setRejectOpen(false)}
            disabled={reject.isPending}
          >
            {t("common.cancel")}
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
            {reject.isPending
              ? t("pages.admin.doctors.rejecting")
              : t("pages.admin.doctors.rejectSubmission")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => !deactivate.isPending && setConfirmOpen(false)}
        title={t("pages.admin.doctors.deactivateTitle")}
        description={t("pages.admin.doctors.deactivateDescription")}
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
            {t("pages.admin.doctors.keepActive")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => deactivate.mutate(d.id, { onSuccess: () => setConfirmOpen(false) })}
            disabled={deactivate.isPending}
          >
            {deactivate.isPending
              ? t("pages.admin.doctors.deactivating")
              : t("pages.admin.doctors.deactivate")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={purgeOpen}
        onClose={() => !purge.isPending && setPurgeOpen(false)}
        title={t("pages.admin.doctors.purgeTitle")}
        description={t("pages.admin.doctors.purgeDescription")}
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
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => purge.mutate(d.id, { onSuccess: () => router.push("/admin") })}
            disabled={purge.isPending}
          >
            {purge.isPending
              ? t("pages.admin.doctors.erasing")
              : t("pages.admin.doctors.erasePermanently")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
