"use client";

import { AccountsSurface } from "@/components/accounts/accounts-surface";

export default function SysadminAccountsPage() {
  return (
    <AccountsSurface
      header={{
        label: "Sys-admin",
        title: "Account",
        highlight: "management.",
        subtitle:
          "Every account except your own — admins and healthworkers fully, doctors via the shared doctor tools. Click a row to manage it. (Manage your own ops account from the System page.)",
      }}
      // Doctor is a UI-only entry in this list. Picking it swaps the modal to
      // the email invite (POST /doctors/invites), because a doctor is an
      // account plus a clinical profile they fill in themselves — not
      // something POST /accounts can mint.
      creatableRoles={["admin", "healthworker", "doctor"]}
      manualDoctorHref="/sysadmin/doctors/new?mode=manual"
      addButtonLabel="Add account"
      createTitle="Add account"
      createDescription="Create an admin, health worker, or doctor account."
      emptyTitle="No accounts yet"
      emptyDescription="Create the first admin or healthworker account to get started."
    />
  );
}
