"use client";

import { Building2, UserCog } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { SelfAccountSettings } from "@/components/sysadmin/self-account-form";
import { SystemConfigForm } from "@/components/sysadmin/system-config-form";
import { explainError } from "@/lib/error-codes";
import { fmtDateTime } from "@/lib/format";
import { useSystemConfig } from "@/lib/use-api";

export default function SysAdminHome() {
  const { data, error, isLoading } = useSystemConfig();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label="Sys-admin"
        title="Your account"
        highlight="& system."
        subtitle="Manage your own ops account and the clinic configuration."
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="font-display text-lg tracking-[-0.01em]">Your account</h2>
        </div>
        <SelfAccountSettings />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="font-display text-lg tracking-[-0.01em]">System configuration</h2>
        </div>

        {error ? (
          <ErrorBanner>{explainError(error.error)}</ErrorBanner>
        ) : isLoading || !data ? (
          <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
        ) : (
          <Card className="p-6">
            <dl className="mb-4 flex flex-col gap-1 border-b border-[var(--border)] pb-4">
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                Initialized at
              </dt>
              <dd className="text-sm text-[var(--foreground)]">
                {data.initializedAt ? fmtDateTime(data.initializedAt) : "—"}
              </dd>
            </dl>
            <SystemConfigForm config={data} />
          </Card>
        )}
      </section>
    </div>
  );
}
