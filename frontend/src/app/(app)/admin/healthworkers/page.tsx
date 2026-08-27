"use client";

import { AccountsSurface } from "@/components/accounts/accounts-surface";
import { useI18n } from "@/lib/i18n";

export default function AdminHealthworkersPage() {
  const { t } = useI18n();
  // GET /accounts already withholds admin and sys-admin rows from an admin
  // caller, so this surface only ever renders healthworkers — the role
  // column and filter hide themselves accordingly.
  return (
    <AccountsSurface
      header={{
        label: t("pages.admin.healthworkers.label"),
        title: t("pages.admin.healthworkers.title"),
        highlight: t("pages.admin.healthworkers.highlight"),
        subtitle: t("pages.admin.healthworkers.subtitle"),
      }}
      creatableRoles={["healthworker"]}
      addButtonLabel={t("pages.admin.healthworkers.addButton")}
      createTitle={t("pages.admin.healthworkers.createTitle")}
      createDescription={t("pages.admin.healthworkers.createDescription")}
      emptyTitle={t("pages.admin.healthworkers.emptyTitle")}
      emptyDescription={t("pages.admin.healthworkers.emptyDescription")}
    />
  );
}
