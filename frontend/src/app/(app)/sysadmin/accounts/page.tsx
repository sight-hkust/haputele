"use client";

import Link from "next/link";
import { Stethoscope } from "lucide-react";

import { AccountsSurface } from "@/components/accounts/accounts-surface";
import { Button } from "@/components/primitives/button";

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
      creatableRoles={["admin", "healthworker"]}
      addButtonLabel="Add account"
      createTitle="Add account"
      createDescription="Create an admin or healthworker operating account."
      emptyTitle="No accounts yet"
      emptyDescription="Create the first admin or healthworker account to get started."
      // Doctors are two rows — an account plus the clinical profile — and
      // arrive by invite → self-fill → approve, so they are created on the
      // doctor surface rather than through POST /accounts. Same screen the
      // admin uses; it lives under /sysadmin because the role guard bounces
      // a sys-admin out of /admin/*.
      headerExtra={
        <Link href="/sysadmin/doctors/new">
          <Button variant="secondary">
            <Stethoscope className="h-4 w-4" />
            Add doctor
          </Button>
        </Link>
      }
    />
  );
}
