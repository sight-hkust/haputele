"use client";

import { Building2, Clock, FileText, MapPin, Phone, Mail, ShieldCheck } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { explainError } from "@/lib/error-codes";
import { fmtDateTime } from "@/lib/format";
import { useSystemConfig } from "@/lib/use-api";

export default function SysAdminHome() {
  const { data, error, isLoading } = useSystemConfig();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label="Sys-admin"
        title="System"
        highlight="configuration."
        subtitle="The values the operator picked during first-run setup. These drive timezones, master consent versioning, and the institute identity printed on every prescription PDF."
      />

      {error ? (
        <ErrorBanner>{explainError(error.error)}</ErrorBanner>
      ) : isLoading || !data ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <header className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
              <Building2 className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="font-display text-lg tracking-[-0.01em]">Institute identity</h2>
            </header>
            <dl className="mt-4 flex flex-col gap-3">
              <Row Icon={ShieldCheck} label="Name" value={data.instituteName} />
              <Row
                Icon={MapPin}
                label="Address"
                value={
                  data.instituteAddressLines && data.instituteAddressLines.length > 0
                    ? data.instituteAddressLines.join(" · ")
                    : null
                }
              />
              <Row Icon={Phone} label="Phone" value={data.instituteContactPhone} />
              <Row Icon={Mail} label="Email" value={data.instituteContactEmail} />
            </dl>
          </Card>

          <Card className="p-6">
            <header className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
              <Clock className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="font-display text-lg tracking-[-0.01em]">Defaults</h2>
            </header>
            <dl className="mt-4 flex flex-col gap-3">
              <Row Icon={Clock} label="App timezone" value={data.appTimezone} />
              <Row Icon={Clock} label="Export timezone" value={data.exportTimezone} />
              <Row Icon={FileText} label="Master consent version" value={data.masterConsentVersion} />
              <Row
                Icon={ShieldCheck}
                label="Initialized at"
                value={data.initializedAt ? fmtDateTime(data.initializedAt) : null}
              />
            </dl>
          </Card>
        </div>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Read-only for now. Editing these values is planned for a future dev-dashboard release; until
        then, an operator can re-initialize the system by following the manual procedure in{" "}
        <code className="rounded bg-[var(--muted)] px-1 py-0.5 font-mono text-[11px]">
          CURRENT_INFRA.md
        </code>{" "}
        §6.
      </p>
    </div>
  );
}

function Row({
  Icon,
  label,
  value,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
      <div className="min-w-0 flex-1">
        <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-sm text-[var(--foreground)]">{value ?? "—"}</dd>
      </div>
    </div>
  );
}
