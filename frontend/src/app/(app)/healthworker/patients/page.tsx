"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input } from "@/components/primitives/input";
import { PageHeader } from "@/components/primitives/page-header";
import { usePatientList } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { fmtRelative, fullName } from "@/lib/format";

export default function PatientListPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce so the API isn't called on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = usePatientList({ search, page });
  const patients = list.data?.patients ?? [];
  const PAGE_SIZE = 50;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12">
      <PageHeader
        label="Patients"
        title="Patient"
        highlight="roster."
        subtitle="Search by name or national ID. Click any patient to view their record."
        action={
          <Link href="/healthworker/patients/new">
            <Button>
              <UserPlus className="h-4 w-4" />
              Register
            </Button>
          </Link>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or national ID…"
          className="pl-11"
        />
      </div>

      {list.error ? (
        <ErrorBanner>{explainError(list.error.error)}</ErrorBanner>
      ) : list.isLoading ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</Card>
      ) : patients.length === 0 ? (
        <EmptyState
          Icon={Users}
          title={search ? "No matches" : "No patients yet"}
          description={
            search
              ? `No patients match "${search}". Try a different name or ID.`
              : "Register your first patient to start tracking appointments."
          }
          action={
            !search && (
              <Link href="/healthworker/patients/new">
                <Button>
                  <UserPlus className="h-4 w-4" />
                  Register a patient
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-4 border-b border-[var(--border)] bg-[var(--muted)]/30 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              <span>Name</span>
              <span>National ID</span>
              <span>Contact</span>
              <span className="text-right">Registered</span>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {patients.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/healthworker/patients/${p.id}`)}
                    className="grid w-full grid-cols-[1.4fr_1fr_1fr_0.8fr] items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-[var(--muted)]/40 focus-visible:bg-[var(--muted)]/60 focus-visible:outline-none"
                  >
                    <div>
                      <div className="text-sm font-semibold tracking-[-0.01em]">{fullName(p)}</div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                        ID #{p.id} · {p.gender}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                      {p.nationalId ?? "—"}
                    </span>
                    <span className="text-sm text-[var(--muted-foreground)]">{p.contact ?? "—"}</span>
                    <span className="text-right font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                      {fmtRelative(p.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Pagination
            page={page}
            onChange={setPage}
            hasNext={patients.length === PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}

function Pagination({ page, hasNext, onChange }: { page: number; hasNext: boolean; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
        Prev
      </Button>
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        Page {page}
      </span>
      <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => onChange(page + 1)}>
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
