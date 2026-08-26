"use client";

import { Building2, UserCog } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { SelfAccountSettings } from "@/components/sysadmin/self-account-form";
import { SystemConfigForm } from "@/components/sysadmin/system-config-form";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useSystemConfig } from "@/lib/use-api";

export default function SysAdminHome() {
  const { t } = useI18n();
  const { data, error, isLoading, refetch } = useSystemConfig();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label={t("pages.sysadmin.system.label")}
        title={t("pages.sysadmin.system.title")}
        highlight={t("pages.sysadmin.system.highlight")}
        subtitle={t("pages.sysadmin.system.subtitle")}
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="font-display text-lg tracking-[-0.01em]">
            {t("pages.sysadmin.system.yourAccount")}
          </h2>
        </div>
        <SelfAccountSettings />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="font-display text-lg tracking-[-0.01em]">
            {t("pages.sysadmin.system.systemConfiguration")}
          </h2>
        </div>

        {error ? (
          <ApiErrorBanner error={error} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            {t("common.loading")}
          </Card>
        ) : (
          <Card className="p-6">
            <dl className="mb-4 flex flex-col gap-1 border-b border-[var(--border)] pb-4">
              <dt className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                {t("pages.sysadmin.system.initializedAt")}
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
