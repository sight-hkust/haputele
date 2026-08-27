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
import { ApiErrorBanner, ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Modal } from "@/components/primitives/modal";
import {
  PasswordSection,
  ProfileSection,
  Section,
  StatusHeader,
} from "@/components/sysadmin/account-sections";
import { explainError } from "@/lib/error-codes";
import { doctorName, fmtDateTime } from "@/lib/format";
import { captionClassTight } from "@/lib/caption-class";
import { useI18n } from "@/lib/i18n";
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
import type { AccountRosterEntry } from "@/types/api";

// Inline detail/edit panel — sits beside the grid (no overlay, no dim) so
// the table stays visible and clickable while a row is open.
export function AccountPanel({
  account,
  onClose,
}: {
  account: AccountRosterEntry;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
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
            <p className={captionClassTight(locale, "text-[var(--muted-foreground)]")}>
              {t("pages.sysadmin.accounts.roleAccount", { role: t(`roles.${account.role}`) })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("pages.sysadmin.accounts.closePanelAria")}
            className="-mr-2 -mt-1 shrink-0"
          >
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
              {t("pages.sysadmin.accounts.readOnly")}
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
  const { locale, t } = useI18n();
  const disable = useDisableAccount();
  const enable = useEnableAccount();
  const del = useDeleteAccount();
  const statusError = disable.error ?? enable.error;
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isDisabled = account.disabledAt !== null;
  const statusBusy = disable.isPending || enable.isPending;

  return (
    <div className="flex flex-col gap-8">
      <StatusHeader
        active={!isDisabled}
        label={isDisabled ? t("pages.sysadmin.sharedAccounts.disabled") : t("common.active")}
        sub={
          isDisabled && account.disabledAt
            ? t("pages.sysadmin.accounts.disabledSince", { datetime: fmtDateTime(account.disabledAt) })
            : undefined
        }
      />

      <ProfileSection account={account} />

      <Section title={t("pages.sysadmin.accounts.signInSection")}>
        <p className="text-sm text-[var(--muted-foreground)]">
          {isDisabled
            ? t("pages.sysadmin.accounts.signInDisabledHint")
            : t("pages.sysadmin.accounts.signInActiveHint")}
        </p>
        {isDisabled ? (
          <Button
            variant="secondary"
            disabled={statusBusy}
            onClick={() => enable.mutate(account.username)}
          >
            <ShieldCheck className="h-4 w-4" />
            {t("pages.sysadmin.accounts.enableSignIn")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={statusBusy}
            onClick={() => disable.mutate(account.username)}
          >
            <ShieldOff className="h-4 w-4" />
            {t("pages.sysadmin.accounts.disableSignIn")}
          </Button>
        )}
        {statusError ? <ErrorBanner>{explainError(statusError.error)}</ErrorBanner> : null}
      </Section>

      <PasswordSection username={account.username} />

      <Section title={t("pages.sysadmin.accounts.dangerZone")} tone="danger">
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("pages.sysadmin.accounts.deleteHint")}
        </p>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" />
          {t("pages.sysadmin.accounts.deleteAccount")}
        </Button>
      </Section>

      <Modal
        open={deleteOpen}
        onClose={() => !del.isPending && setDeleteOpen(false)}
        title={t("pages.sysadmin.accounts.deleteAccount")}
        description={t("pages.sysadmin.accounts.deleteModalDescription", {
          username: account.username,
        })}
      >
        <div className="flex flex-col gap-4">
          {del.error ? <ErrorBanner>{explainError(del.error.error)}</ErrorBanner> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={del.isPending}>
              {t("common.cancel")}
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
              {del.isPending
                ? t("common.deleting")
                : t("pages.sysadmin.accounts.deleteAccount")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── doctor: reuse the full doctor management surface ─────────────────────

function DoctorBody({ doctorId }: { doctorId: number }) {
  const { locale, t } = useI18n();
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
    return <ApiErrorBanner error={doctor.error} onRetry={() => doctor.refetch()} />;
  }
  if (!doctor.data) {
    return <p className="text-sm text-[var(--muted-foreground)]">{t("common.loading")}</p>;
  }

  const d = doctor.data;
  const errCode = update.error?.error ?? null;
  const missing = (update.error?.detail?.missing as string[] | undefined) ?? undefined;
  const errorMessage = errCode ? explainError(errCode) : null;

  return (
    <div className="flex flex-col gap-6">
      <StatusHeader
        active={d.active}
        label={d.active ? t("common.active") : t("common.inactive")}
        sub={doctorName(d)}
      />

      {d.onboardingStatus === "awaiting_approval" && (
        <Card className="border-sky-200 bg-sky-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-sky-100 p-2">
              <ShieldCheck className="h-4 w-4 text-sky-700" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sky-900">
                {t("pages.admin.doctors.awaitingApprovalTitle")}
              </p>
              <p className="mt-1 text-sm text-sky-800">
                {t("pages.admin.doctors.awaitingApprovalDescription")}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRejectOpen(true)}
                  disabled={approve.isPending || reject.isPending}
                >
                  <ShieldX className="h-4 w-4" />
                  {t("pages.admin.doctors.reject")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => approve.mutate(d.id, { onSuccess: refreshRoster })}
                  disabled={approve.isPending}
                >
                  <CheckCircle2 className={`h-4 w-4 ${approve.isPending ? "animate-pulse" : ""}`} />
                  {approve.isPending
                    ? t("pages.admin.doctors.approving")
                    : t("pages.admin.doctors.approve")}
                </Button>
              </div>
              {approve.error && (
                <ErrorBanner className="mt-3">{explainError(approve.error.error)}</ErrorBanner>
              )}
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
              <p className="text-sm font-semibold text-rose-900">
                {t("pages.admin.doctors.rejectedTitle")}
              </p>
              <p className="mt-1 text-sm text-rose-800">
                {t("pages.admin.doctors.rejectedDescription")}
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
              <p className="text-sm font-semibold text-amber-900">
                {t("pages.admin.doctors.awaitingSetupTitle")}
              </p>
              <p className="mt-1 text-sm text-amber-800">
                {t("pages.admin.doctors.awaitingSetupDescription")}
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
                  {reissue.isPending
                    ? t("pages.admin.doctors.sending")
                    : t("pages.admin.doctors.resend")}
                </Button>
                {inviteJustSent && (
                  <span className={captionClassTight(locale, "inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1  text-emerald-700")}>
                    <CheckCircle2 className="h-3 w-3" />
                    {t("pages.admin.doctors.sent")}
                  </span>
                )}
              </div>
              {reissue.error && (
                <ErrorBanner className="mt-3">{explainError(reissue.error.error)}</ErrorBanner>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3">
        <span className="text-sm text-[var(--muted-foreground)]">
          {d.active
            ? t("pages.sysadmin.accounts.doctorActiveHint")
            : t("pages.sysadmin.accounts.doctorInactiveHint")}
        </span>
        {d.active ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            <ShieldOff className="h-4 w-4" />
            {t("pages.admin.doctors.deactivate")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => update.mutate({ active: true }, { onSuccess: refreshRoster })}
            disabled={update.isPending}
          >
            <ShieldCheck className="h-4 w-4" />
            {t("pages.admin.doctors.reactivate")}
          </Button>
        )}
      </div>

      <DoctorForm
        mode="update"
        initial={d}
        submitting={update.isPending}
        errorMessage={errorMessage}
        errorMissingFields={missing}
        submitLabel={t("common.saveChanges")}
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
            {deactivate.isPending
              ? t("pages.admin.doctors.deactivating")
              : t("pages.admin.doctors.deactivate")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
