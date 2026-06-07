"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsUpDown,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";

import { AccountPanel } from "@/components/sysadmin/account-panel";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { Select } from "@/components/primitives/select";
import { cn } from "@/lib/cn";
import { explainError } from "@/lib/error-codes";
import { useAccountRoster, useCreateOperatingAccount } from "@/lib/use-api";
import type { AccountRole, AccountRosterEntry, OperatingAccountRole } from "@/types/api";

const ROLE_LABEL: Record<AccountRole, string> = {
  "sys-admin": "Sys-admin",
  admin: "Admin",
  healthworker: "Healthworker",
  doctor: "Doctor",
};

const MIN_PASSWORD_LEN = 10;

type SortKey = "username" | "role" | "status";
type SortDir = "asc" | "desc";

// Normalised status, unifying the account-level `disabled_at` flag (admins,
// healthworkers) with the doctor.active mirror. `active` drives the pill
// colour and the status filter; `label` is the display string.
function deriveStatus(a: AccountRosterEntry): { active: boolean; label: string } {
  if (a.role === "doctor") {
    const active = a.doctorActive !== false;
    return { active, label: active ? "Active" : "Inactive" };
  }
  const disabled = a.disabledAt !== null;
  return { active: !disabled, label: disabled ? "Disabled" : "Active" };
}

export default function AccountsPage() {
  const { data, error, isLoading } = useAccountRoster();
  const [createOpen, setCreateOpen] = useState(false);
  // The drawer tracks a username, not a row snapshot, so it always reflects
  // fresh roster data after an edit/disable (and auto-closes on delete).
  const [openUsername, setOpenUsername] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AccountRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortKey, setSortKey] = useState<SortKey>("role");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const accounts = useMemo(() => data ?? [], [data]);
  const selected = accounts.find((a) => a.username === openUsername) ?? null;

  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const a of accounts) (deriveStatus(a).active ? active++ : inactive++);
    return { total: accounts.length, active, inactive };
  }, [accounts]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = accounts.filter((a) => {
      if (q && !a.username.toLowerCase().includes(q) && !(a.fullName ?? "").toLowerCase().includes(q))
        return false;
      if (roleFilter !== "all" && a.role !== roleFilter) return false;
      if (statusFilter !== "all") {
        const active = deriveStatus(a).active;
        if (statusFilter === "active" && !active) return false;
        if (statusFilter === "inactive" && active) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: AccountRosterEntry, b: AccountRosterEntry): number => {
      if (sortKey === "username") return a.username.localeCompare(b.username) * dir;
      if (sortKey === "role")
        return (ROLE_LABEL[a.role].localeCompare(ROLE_LABEL[b.role]) || a.username.localeCompare(b.username)) * dir;
      const sa = deriveStatus(a).active ? 0 : 1;
      const sb = deriveStatus(b).active ? 0 : 1;
      return ((sa - sb) || a.username.localeCompare(b.username)) * dir;
    };
    return [...filtered].sort(cmp);
  }, [accounts, query, roleFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtersActive = query.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          label="Sys-admin"
          title="Account"
          highlight="management."
          subtitle="Every account except your own — admins and healthworkers fully, doctors via the shared doctor tools. Click a row to manage it. (Manage your own ops account from the System page.)"
        />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add account
        </Button>
      </div>

      {error ? <ErrorBanner>{explainError(error.error)}</ErrorBanner> : null}

      <div className="flex flex-wrap gap-3">
        <StatChip label="Total" value={stats.total} />
        <StatChip label="Active" value={stats.active} tone="positive" />
        <StatChip label="Inactive" value={stats.inactive} tone="negative" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
      <Card variant="flat" className="flex flex-col">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username or name…"
              className="h-11 pl-10"
              aria-label="Search accounts"
            />
          </div>
          <div className="flex gap-3">
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "all" | AccountRole)}
              className="h-11 w-full sm:w-44"
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="healthworker">Healthworker</option>
              <option value="doctor">Doctor</option>
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
              className="h-11 w-full sm:w-40"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </div>

        {isLoading || !data ? (
          <div className="p-10 text-center text-sm text-[var(--muted-foreground)]">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              Icon={Users}
              title={filtersActive ? "No accounts match these filters" : "No accounts yet"}
              description={
                filtersActive
                  ? "Try a different search term or clear the role/status filters."
                  : "Create the first admin or healthworker account to get started."
              }
              action={
                filtersActive ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setRoleFilter("all");
                      setStatusFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Add account
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <SortableTh label="Account" sortKey="username" active={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Role" sortKey="role" active={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Status" sortKey="status" active={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((account) => (
                <AccountRow
                  key={account.username}
                  account={account}
                  selected={account.username === openUsername}
                  onOpen={() => setOpenUsername(account.username)}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>

          {data && rows.length > 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Showing {rows.length} of {accounts.length} {accounts.length === 1 ? "account" : "accounts"}.
            </p>
          ) : null}
        </div>

        {selected ? <AccountPanel account={selected} onClose={() => setOpenUsername(null)} /> : null}
      </div>

      <CreateAccountModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ── grid pieces ─────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "negative";
}) {
  const dot =
    tone === "positive" ? "bg-emerald-500" : tone === "negative" ? "bg-rose-500" : "bg-[var(--muted-foreground)]";
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
      <span className="font-display text-lg leading-none tracking-[-0.01em]">{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">{label}</span>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th className="px-5 py-3">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
      >
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3 text-[var(--accent)]" />
          ) : (
            <ArrowDown className="h-3 w-3 text-[var(--accent)]" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
        )}
      </button>
    </th>
  );
}

function RoleBadge({ role }: { role: AccountRole }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
      {ROLE_LABEL[role]}
    </span>
  );
}

function StatePill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em]",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-rose-500")} aria-hidden />
      {label}
    </span>
  );
}

function AccountRow({
  account,
  selected,
  onOpen,
}: {
  account: AccountRosterEntry;
  selected: boolean;
  onOpen: () => void;
}) {
  const status = deriveStatus(account);
  const isDoctor = account.role === "doctor";
  const Icon = isDoctor ? Stethoscope : account.role === "sys-admin" ? ShieldCheck : UserCog;

  return (
    <tr
      onClick={onOpen}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className={cn(
        "cursor-pointer border-b border-[var(--border)] outline-none transition-colors last:border-0 hover:bg-[var(--muted)]/40 focus-visible:bg-[var(--muted)]/40",
        selected && "bg-[var(--accent)]/5 hover:bg-[var(--accent)]/5",
      )}
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--muted)]">
            <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--foreground)]">{account.username}</p>
            {account.fullName ? (
              <p className="truncate text-xs text-[var(--muted-foreground)]">{account.fullName}</p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <RoleBadge role={account.role} />
      </td>
      <td className="px-5 py-3.5">
        <StatePill active={status.active} label={status.label} />
      </td>
      <td className="px-5 py-3.5 text-right">
        <ChevronRight className="ml-auto h-4 w-4 text-[var(--muted-foreground)]" />
      </td>
    </tr>
  );
}

// ── create ─────────────────────────────────────────────────────────────

function CreateAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateOperatingAccount();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<OperatingAccountRole>("admin");
  const [localError, setLocalError] = useState<string | null>(null);

  const reset = () => {
    setUsername("");
    setFullName("");
    setContact("");
    setPassword("");
    setConfirm("");
    setRole("admin");
    setLocalError(null);
    create.reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!username.trim()) return setLocalError("Username is required.");
    if (password.length < MIN_PASSWORD_LEN)
      return setLocalError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    if (password !== confirm) return setLocalError("Passwords do not match.");
    create.mutate(
      {
        username: username.trim(),
        password,
        role,
        fullName: fullName.trim() || undefined,
        contact: contact.trim() || undefined,
      },
      { onSuccess: close },
    );
  };

  return (
    <Modal open={open} onClose={close} title="Add account" description="Create an admin or healthworker operating account.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as OperatingAccountRole)}>
            <option value="admin">Admin</option>
            <option value="healthworker">Healthworker</option>
          </Select>
        </Field>
        <Field label="Full name (optional)">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Alice Adams" />
        </Field>
        <Field label="Phone / contact (optional)">
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. +94 77 123 4567" />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>

        {localError ? <ErrorBanner>{localError}</ErrorBanner> : null}
        {create.error ? <ErrorBanner>{explainError(create.error.error)}</ErrorBanner> : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
