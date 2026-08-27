"use client";

import { useState, type ComponentType } from "react";
import { Download, FileArchive, FileSpreadsheet, type LucideProps } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { DatePicker } from "@/components/primitives/date-picker";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Label } from "@/components/primitives/input";
import { PageHeader } from "@/components/primitives/page-header";
import { API_URL, ApiError } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { useAuth } from "@/lib/auth";
import { EXPORT_TIMEZONE, appDayWindow, appToday } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Kind = "xlsx" | "zip";

export default function ExportsPage() {
  const { t } = useI18n();
  const { session } = useAuth();
  const [date, setDate] = useState<string>(appToday(EXPORT_TIMEZONE));
  const [downloading, setDownloading] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (kind: Kind) => {
    if (!date || !session) return;
    setError(null);
    setDownloading(kind);
    try {
      const path = kind === "xlsx" ? "medications.xlsx" : "prescriptions.zip";
      const { fromISO, toISO } = appDayWindow(date, EXPORT_TIMEZONE);
      const qs = new URLSearchParams({ from: fromISO, to: toISO });
      const res = await fetch(`${API_URL}/exports/${path}?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        let code = "request_failed";
        try {
          const body = (await res.clone().json()) as { detail?: { error?: string } };
          code = body?.detail?.error ?? code;
        } catch {
          /* keep default */
        }
        throw new ApiError(res.status, code);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "xlsx" ? `medication-pickup-${date}.xlsx` : `prescriptions-${date}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? explainError(e.error, t("pages.healthworker.exports.downloadFailed", { status: e.status }))
          : t("errors.network_error"),
      );
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label={t("pages.healthworker.exports.label")}
        title={t("pages.healthworker.exports.title")}
        highlight={t("pages.healthworker.exports.highlight")}
        subtitle={t("pages.healthworker.exports.subtitle")}
      />

      <Card variant="elevated" className="p-8">
        <div className="flex max-w-xs flex-col gap-2">
          <Label htmlFor="export-date">{t("pages.healthworker.exports.dateLabel")}</Label>
          <DatePicker
            id="export-date"
            value={date}
            onChange={setDate}
            max={appToday(EXPORT_TIMEZONE)}
            ariaLabel={t("pages.healthworker.exports.chooseExportDate")}
          />
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            {t("pages.healthworker.exports.timezoneNote", { tz: EXPORT_TIMEZONE })}
          </p>
        </div>

        {error && <ErrorBanner className="mt-6">{error}</ErrorBanner>}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <DownloadCard
            Icon={FileSpreadsheet}
            title={t("pages.healthworker.exports.medicationPickupTitle")}
            description={t("pages.healthworker.exports.medicationPickupDescription")}
            cta={t("pages.healthworker.exports.downloadXlsx")}
            loadingLabel={t("pages.healthworker.exports.preparing")}
            loading={downloading === "xlsx"}
            disabled={!date || downloading !== null}
            onClick={() => download("xlsx")}
          />
          <DownloadCard
            Icon={FileArchive}
            title={t("pages.healthworker.exports.allPrescriptionsTitle")}
            description={t("pages.healthworker.exports.allPrescriptionsDescription")}
            cta={t("pages.healthworker.exports.downloadZip")}
            loadingLabel={t("pages.healthworker.exports.preparing")}
            loading={downloading === "zip"}
            disabled={!date || downloading !== null}
            onClick={() => download("zip")}
          />
        </div>
      </Card>
    </div>
  );
}

function DownloadCard({
  Icon,
  title,
  description,
  cta,
  loadingLabel,
  loading,
  disabled,
  onClick,
}: {
  Icon: ComponentType<LucideProps>;
  title: string;
  description: string;
  cta: string;
  loadingLabel: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[0.04] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex flex-col gap-4">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] text-white shadow-accent">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em]">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {description}
          </p>
        </div>
        <Button onClick={onClick} disabled={disabled} className="self-start">
          <Download className="h-4 w-4" />
          {loading ? loadingLabel : cta}
        </Button>
      </div>
    </div>
  );
}
