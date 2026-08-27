"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, ClipboardList, History, Pencil, Trash2 } from "lucide-react";

import { BackLink } from "@/components/primitives/back-link";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ApiErrorBanner, ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { StatusBadge } from "@/components/primitives/status-badge";
import { PatientForm } from "@/components/healthworker/patient-form";
import { ProfileSummary } from "@/components/healthworker/profile-summary";
import { useDeletePatient, usePatient, usePatientHistory, useUpdatePatient } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { fmtAge, fmtDate, fmtDateTime, fullName } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { parseIdParam, throwNotFoundIf404 } from "@/lib/not-found";

export default function PatientDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const id = parseIdParam(params.id);
  const router = useRouter();
  const patientQ = usePatient(id);
  const historyQ = usePatientHistory(id);
  const update = useUpdatePatient(id);
  const del = useDeletePatient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (patientQ.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
          {t("common.loading")}
        </Card>
      </div>
    );
  }
  if (patientQ.error || !patientQ.data) {
    throwNotFoundIf404(patientQ.error);
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <ApiErrorBanner
          error={patientQ.error}
          onRetry={() => {
            patientQ.refetch();
            historyQ.refetch();
          }}
        />
      </div>
    );
  }

  const patient = patientQ.data.patient;
  const profile = patientQ.data.profile;
  const age = fmtAge(patient.dob);
  const apts = historyQ.data?.appointments ?? [];
  const langLabel =
    patient.language === "en"
      ? t("common.english")
      : patient.language === "ta"
        ? t("common.tamil")
        : patient.language === "si"
          ? t("common.sinhala")
          : null;
  const genderKey = `forms.genderOptions.${patient.gender}`;
  const genderLabel = t(genderKey) === genderKey ? patient.gender : t(genderKey);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <BackLink href="/healthworker/patients">{t("pages.healthworker.patients.backToPatients")}</BackLink>

      <PageHeader
        label={t("forms.patientId", { id: patient.id })}
        title={fullName(patient)}
        subtitle={
          [
            genderLabel,
            age,
            langLabel ? t("pages.healthworker.patients.prefersLanguage", { lang: langLabel }) : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        action={
          <div className="flex items-center gap-2">
            <Link href={`/healthworker/appointments/new?patientId=${patient.id}`}>
              <Button variant="secondary" size="md">
                <CalendarPlus className="h-4 w-4" />
                {t("common.book")}
              </Button>
            </Link>
            <Button variant="secondary" size="md" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              {t("common.edit")}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <ProfileSummary profile={profile} editHref={`/healthworker/patients/${patient.id}/profile`} />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Demographics */}
        <Card variant="elevated" className="p-8">
          <div className="mb-6 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--accent)]">
              {t("pages.healthworker.patients.demographics")}
            </h2>
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label={t("forms.dateOfBirth")} value={fmtDate(patient.dob)} />
            <Field label={t("forms.gender")} value={genderLabel} />
            <Field label={t("common.nationalId")} value={patient.nationalId ?? "—"} mono />
            <Field label={t("common.contact")} value={patient.contact ?? "—"} />
            <Field
              label={t("forms.preferredLanguage")}
              value={langLabel ?? "—"}
            />
            <Field label={t("forms.screeningRef")} value={patient.screeningRef ?? "—"} mono />
            <Field className="sm:col-span-2" label={t("common.address")} value={patient.address ?? "—"} />
          </dl>
        </Card>

        {/* History sidebar */}
        <Card className="p-8">
          <div className="mb-5 flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--accent)]">
              {t("pages.healthworker.patients.appointmentHistory")}
            </h2>
          </div>
          {historyQ.isLoading ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t("common.loading")}</p>
          ) : apts.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {t("pages.healthworker.patients.noAppointmentsYet")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {apts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/healthworker/appointments/${a.id}`}
                    className="block rounded-lg px-2 py-3 transition-colors hover:bg-[var(--muted)]/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                        {fmtDateTime(a.scheduledAt)}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => !update.isPending && setEditOpen(false)}
        title={t("pages.healthworker.patients.editPatient")}
        className="max-w-3xl"
      >
        <PatientForm
          mode="update"
          initial={patient}
          submitting={update.isPending}
          errorMessage={update.error ? explainError(update.error.error) : null}
          submitLabel={t("common.saveChanges")}
          onSubmit={(s) => {
            if (s.mode !== "update") return;
            update.mutate(s.payload, { onSuccess: () => setEditOpen(false) });
          }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Delete modal */}
      <Modal
        open={deleteOpen}
        onClose={() => !del.isPending && setDeleteOpen(false)}
        title={t("pages.healthworker.patients.deleteTitle")}
        description={t("pages.healthworker.patients.deleteDescription")}
      >
        {del.error && <ErrorBanner className="mb-3">{explainError(del.error.error)}</ErrorBanner>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={del.isPending}>
            {t("common.keep")}
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              del.mutate(patient.id, {
                onSuccess: () => router.push("/healthworker/patients"),
              })
            }
            disabled={del.isPending}
          >
            {del.isPending
              ? t("common.deleting")
              : t("pages.healthworker.patients.deletePatient")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className={mono ? "mt-1 font-mono text-sm" : "mt-1 text-sm"}>{value}</dd>
    </div>
  );
}
