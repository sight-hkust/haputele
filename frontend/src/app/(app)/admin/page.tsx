"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Mail, ShieldCheck, Stethoscope, UserPlus2, XCircle } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { PageHeader } from "@/components/primitives/page-header";
import { useDoctorList } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { doctorName } from "@/lib/format";
import { cn } from "@/lib/cn";

type Filter = "all" | "active" | "inactive";

export default function AdminDoctors() {
  const [filter, setFilter] = useState<Filter>("all");
  const list = useDoctorList(
    filter === "all" ? undefined : { active: filter === "active" },
  );
  const doctors = list.data ?? [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label="Admin"
        title="Doctor"
        highlight="accounts."
        subtitle="Create accounts, rotate passwords, and manage the §1.7 prescription mandatory fields. Deactivated doctors keep their history but won't appear in healthworker booking."
        action={
          <Link href="/admin/doctors/new">
            <Button>
              <UserPlus2 className="h-4 w-4" />
              Create doctor
            </Button>
          </Link>
        }
      />

      {/* Filter pills */}
      <div className="inline-flex w-fit items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/50 p-1">
        {(["all", "active", "inactive"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium capitalize transition-all",
              filter === f
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {list.error ? (
        <ErrorBanner>{explainError(list.error.error)}</ErrorBanner>
      ) : list.isLoading ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      ) : doctors.length === 0 ? (
        <EmptyState
          Icon={Stethoscope}
          title={filter === "all" ? "No doctors yet" : `No ${filter} doctors`}
          description={
            filter === "all"
              ? "Create the first doctor account to start booking appointments."
              : `Switch to "all" to see every doctor regardless of status.`
          }
          action={
            filter === "all" && (
              <Link href="/admin/doctors/new">
                <Button>
                  <UserPlus2 className="h-4 w-4" />
                  Create doctor
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((d) => (
            <Link key={d.id} href={`/admin/doctors/${d.id}`}>
              <Card interactive className="group h-full p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-2 shadow-accent transition-transform duration-300 group-hover:scale-110">
                    <Stethoscope className="h-5 w-5 text-white" />
                  </div>
                  {/* Two independent badges: active/inactive (account
                      state) and awaiting-setup (invite outstanding). A
                      deactivated doctor can also be awaiting setup if
                      they were never onboarded — we show both badges
                      stacked rather than collapsing one. */}
                  <div className="flex flex-col items-end gap-1.5">
                    {d.active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-rose-700">
                        <XCircle className="h-3 w-3" />
                        Inactive
                      </span>
                    )}
                    {d.onboardingStatus === "awaiting_setup" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-700">
                        <Mail className="h-3 w-3" />
                        Awaiting setup
                      </span>
                    )}
                    {d.onboardingStatus === "awaiting_approval" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-sky-700">
                        <ShieldCheck className="h-3 w-3" />
                        Awaiting approval
                      </span>
                    )}
                    {d.onboardingStatus === "rejected" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-rose-700">
                        <XCircle className="h-3 w-3" />
                        Rejected
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="mt-4 font-display text-xl tracking-[-0.01em]">{doctorName(d)}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{d.email}</p>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border)] pt-4">
                  <Mini label="SLMC" value={d.slmcRegistrationNumber} />
                  <Mini label="Institute" value={d.instituteName} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="truncate text-xs text-[var(--foreground)]">{value}</div>
    </div>
  );
}
