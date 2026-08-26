"use client";

import { AccountsSurface } from "@/components/accounts/accounts-surface";
import { useI18n } from "@/lib/i18n";

export default function SysadminAccountsPage() {
  const { t } = useI18n();
  return (
    <AccountsSurface
      header={{
        label: t("pages.sysadmin.accounts.label"),
        title: t("pages.sysadmin.accounts.title"),
        highlight: t("pages.sysadmin.accounts.highlight"),
        subtitle: t("pages.sysadmin.accounts.subtitle"),
      }}
      // Doctor is a UI-only entry in this list. Picking it swaps the modal to
      // the email invite (POST /doctors/invites), because a doctor is an
      // account plus a clinical profile they fill in themselves — not
      // something POST /accounts can mint.
      creatableRoles={["admin", "healthworker", "doctor"]}
      manualDoctorHref="/sysadmin/doctors/new?mode=manual"
      addButtonLabel={t("pages.sysadmin.accounts.addAccount")}
      createTitle={t("pages.sysadmin.accounts.createTitle")}
      createDescription={t("pages.sysadmin.accounts.createDescription")}
      emptyTitle={t("pages.sysadmin.accounts.emptyTitle")}
      emptyDescription={t("pages.sysadmin.accounts.emptyDescription")}
    />
  );
}
