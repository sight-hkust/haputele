"use client";

import { AccountsSurface } from "@/components/accounts/accounts-surface";

export default function AdminHealthworkersPage() {
  // GET /accounts already withholds admin and sys-admin rows from an admin
  // caller, so this surface only ever renders healthworkers — the role
  // column and filter hide themselves accordingly.
  return (
    <AccountsSurface
      header={{
        label: "Admin",
        title: "Health worker",
        highlight: "accounts.",
        subtitle:
          "Create health worker accounts and manage them — rename, reset a password, disable, or delete. Click a row to open it. Doctors are managed from the Doctors page.",
      }}
      creatableRoles={["healthworker"]}
      addButtonLabel="Add health worker"
      createTitle="Add health worker"
      createDescription="Creates a health worker account. There's no invite email — hand the username and password over directly."
      emptyTitle="No health workers yet"
      emptyDescription="Create the first health worker account to get started."
    />
  );
}
