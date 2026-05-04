"use client";

import { useState, type ComponentType } from "react";
import { Download, FileArchive, FileSpreadsheet, type LucideProps } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { PageHeader } from "@/components/primitives/page-header";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { EXPORT_TIMEZONE, appDayWindow, appToday } from "@/lib/format";

type Kind = "xlsx" | "zip";

export default function ExportsPage() {
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
      // GET, so cookies authorise this on their own — no CSRF echo needed.
      const res = await fetch(`${API_URL}/exports/${path}?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Synthesise a download link — `download` attribute names the file even
      // when the response Content-Disposition header is present.
      const a = document.createElement("a");
      a.href = url;
      a.download =
        kind === "xlsx"
          ? `medication-pickup-${date}.xlsx`
          : `prescriptions-${date}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label="Exports"
        title="Daily prescription"
        highlight="exports."
        subtitle="Pick a date and pull the medication-pickup spreadsheet or a zip of every signed prescription PDF for that day. Only completed appointments are included."
      />

      <Card variant="elevated" className="p-8">
        <div className="flex max-w-xs flex-col gap-2">
          <Label htmlFor="export-date">Date</Label>
          <Input
            id="export-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            Sri Lanka time · {EXPORT_TIMEZONE}
          </p>
        </div>

        {error && <ErrorBanner className="mt-6">{error}</ErrorBanner>}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <DownloadCard
            Icon={FileSpreadsheet}
            title="Medication pickup list"
            description="Excel workbook with one row per medication. Header summary shows total appointments, patients, and medications."
            cta="Download .xlsx"
            loading={downloading === "xlsx"}
            disabled={!date || downloading !== null}
            onClick={() => download("xlsx")}
          />
          <DownloadCard
            Icon={FileArchive}
            title="All prescription PDFs"
            description="ZIP of every signed §1.7 prescription PDF, named by appointment + patient. Includes a manifest.txt."
            cta="Download .zip"
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
  loading,
  disabled,
  onClick,
}: {
  Icon: ComponentType<LucideProps>;
  title: string;
  description: string;
  cta: string;
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
          {loading ? "Preparing…" : cta}
        </Button>
      </div>
    </div>
  );
}
