"use client";

import { useQueryClient } from "@tanstack/react-query";

import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import {
  PasswordSection,
  ProfileSection,
  StatusHeader,
} from "@/components/sysadmin/account-sections";
import { explainError } from "@/lib/error-codes";
import { useSysadminMe } from "@/lib/use-api";

// The signed-in ops account managing itself: edit profile + change password.
// Deliberately no disable/delete — the singleton ops account can't lock
// itself out. Lives on the System page; everyone else is on /accounts.
export function SelfAccountSettings() {
  const qc = useQueryClient();
  const me = useSysadminMe();

  if (me.error) {
    return <ErrorBanner>{explainError(me.error.error)}</ErrorBanner>;
  }
  if (!me.data) {
    return <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>;
  }

  return (
    <Card variant="elevated" className="flex flex-col gap-8 p-6">
      <StatusHeader active label="Active" sub="The ops super user — that's you" />
      <ProfileSection
        account={me.data}
        onSaved={() => qc.invalidateQueries({ queryKey: ["sysadmin", "me"] })}
      />
      <PasswordSection username={me.data.username} self />
    </Card>
  );
}
