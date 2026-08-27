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

import Link from "next/link";

import { AccountPanel } from "@/components/sysadmin/account-panel";
import { InvitePanel } from "@/components/doctors/new-doctor-surface";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ApiErrorBanner, ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { Select } from "@/components/primitives/select";
import { cn } from "@/lib/cn";
import { CapsLockHint } from "@/components/primitives/caps-lock-hint";
import { newPasswordError, passwordError, usernameError } from "@/lib/credentials";
import { useCapsLock } from "@/lib/use-caps-lock";
import { explainError } from "@/lib/error-codes";
import { captionClass, captionClassTight } from "@/lib/caption-class";
import { useI18n } from "@/lib/i18n";
import { useAccountRoster, useCreateOperatingAccount } from "@/lib/use-api";
import type { AccountRole, AccountRosterEntry, OperatingAccountRole } from "@/types/api";

const ROLE_LABEL: Record<AccountRole, string> = {
  "sys-admin": "Sys-admin",
  admin: "Admin",
  healthworker: "Healthworker",
  doctor: "Doctor",
};

function translateRole(role: AccountRole, t: (key: string) => string): string {
  return t(`roles.${role}`);
}

/** A role offered in the create form's dropdown. "doctor" is a UI-only
 *  member: picking it swaps the modal to the doctor invite, which posts to
 *  /doctors/invites. POST /accounts still only ever receives an operating
 *  role. */
export type CreatableRole = OperatingAccountRole | "doctor";

/** What this caller may see and create.
 *
 * The roster itself is already scoped server-side by the caller's role
 * (GET /accounts withholds rows an admin may not touch), so these props
 * only shape the UI: which roles the create form offers, and whether the
 * role column and filter are worth showing at all. They are NOT the
 * security boundary — the API is. */
export type AccountsSurfaceProps = {
  header: { label: string; title: string; highlight: string; subtitle: string };
  /** Roles this caller may create, in display order. */
  creatableRoles: CreatableRole[];
  addButtonLabel: string;
  createTitle: string;
  createDescription: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Where "type the full profile yourself" goes when Doctor is picked.
   *  Required if `creatableRoles` includes "doctor" — the full §1.7 form
   *  is far too tall for the modal, so that path opens its own page. */
  manualDoctorHref?: string;
};

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

export function AccountsSurface({
  header,
  creatableRoles,
  addButtonLabel,
  createTitle,
  createDescription,
  emptyTitle,
  emptyDescription,
  manualDoctorHref,
}: AccountsSurfaceProps) {
  const { locale, t } = useI18n();
  const { data, error, isLoading, refetch } = useAccountRoster();
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

  // A role column and role filter only earn their space when the roster
  // actually mixes roles. An admin's roster is healthworkers only, so both
  // would be dead weight there.
  const rolesPresent = useMemo(() => [...new Set(accounts.map((a) => a.role))], [accounts]);
  const showRole = rolesPresent.length > 1;

  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const a of accounts) deriveStatus(a).active ? active++ : inactive++;
    return { total: accounts.length, active, inactive };
  }, [accounts]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = accounts.filter((a) => {
      if (
        q &&
        !a.username.toLowerCase().includes(q) &&
        !(a.fullName ?? "").toLowerCase().includes(q)
      )
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
        return (
          (ROLE_LABEL[a.role].localeCompare(ROLE_LABEL[b.role]) ||
            a.username.localeCompare(b.username)) * dir
        );
      const sa = deriveStatus(a).active ? 0 : 1;
      const sb = deriveStatus(b).active ? 0 : 1;
      return (sa - sb || a.username.localeCompare(b.username)) * dir;
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
          label={header.label}
          title={header.title}
          highlight={header.highlight}
          subtitle={header.subtitle}
        />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {addButtonLabel}
        </Button>
      </div>

      {error ? <ApiErrorBanner error={error} onRetry={() => refetch()} /> : null}

      <div className="flex flex-wrap gap-3">
        <StatChip label={t("common.total")} value={stats.total} />
        <StatChip label={t("common.active")} value={stats.active} tone="positive" />
        <StatChip label={t("common.inactive")} value={stats.inactive} tone="negative" />
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
                  placeholder={t("pages.sysadmin.sharedAccounts.searchPlaceholder")}
                  className="h-11 pl-10"
                  aria-label={t("pages.sysadmin.sharedAccounts.searchAria")}
                />
              </div>
              <div className="flex gap-3">
                {showRole ? (
                  <Select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as "all" | AccountRole)}
                    className="h-11 w-full sm:w-44"
                    aria-label={t("pages.sysadmin.sharedAccounts.filterByRole")}
                  >
                    <option value="all">{t("pages.sysadmin.sharedAccounts.allRoles")}</option>
                    {rolesPresent.map((r) => (
                      <option key={r} value={r}>
                        {translateRole(r, t)}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                  className="h-11 w-full sm:w-40"
                  aria-label={t("pages.sysadmin.sharedAccounts.filterByStatus")}
                >
                  <option value="all">{t("pages.sysadmin.sharedAccounts.allStatuses")}</option>
                  <option value="active">{t("common.active")}</option>
                  <option value="inactive">{t("common.inactive")}</option>
                </Select>
              </div>
            </div>

            {isLoading || !data ? (
              <div className="p-10 text-center text-sm text-[var(--muted-foreground)]">
                {t("common.loading")}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  Icon={Users}
                  title={
                    filtersActive ? t("pages.sysadmin.sharedAccounts.noAccountsMatch") : emptyTitle
                  }
                  description={
                    filtersActive
                      ? t("pages.sysadmin.sharedAccounts.noAccountsMatchDescription")
                      : emptyDescription
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
                        {t("common.clearFilters")}
                      </Button>
                    ) : (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {addButtonLabel}
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <SortableTh
                      label={t("pages.sysadmin.sharedAccounts.accountColumn")}
                      sortKey="username"
                      active={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    {showRole ? (
                      <SortableTh
                        label={t("pages.sysadmin.sharedAccounts.roleColumn")}
                        sortKey="role"
                        active={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                      />
                    ) : null}
                    <SortableTh
                      label={t("pages.sysadmin.sharedAccounts.statusColumn")}
                      sortKey="status"
                      active={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((account) => (
                    <AccountRow
                      key={account.username}
                      account={account}
                      showRole={showRole}
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
              {t("pages.sysadmin.sharedAccounts.showingCount", {
                shown: rows.length,
                total: accounts.length,
                label:
                  accounts.length === 1
                    ? t("pages.sysadmin.sharedAccounts.singleAccountLabel")
                    : t("pages.sysadmin.sharedAccounts.multiAccountLabel"),
              })}
            </p>
          ) : null}
        </div>

        {selected ? (
          <AccountPanel account={selected} onClose={() => setOpenUsername(null)} />
        ) : null}
      </div>

      <CreateAccountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        roles={creatableRoles}
        title={createTitle}
        description={createDescription}
        manualDoctorHref={manualDoctorHref}
      />
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
  const { locale } = useI18n();
  const dot =
    tone === "positive"
      ? "bg-emerald-500"
      : tone === "negative"
        ? "bg-rose-500"
        : "bg-[var(--muted-foreground)]";
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
      <span className="font-display text-lg leading-none tracking-[-0.01em]">{value}</span>
      <span className={captionClass(locale, "text-[var(--muted-foreground)]")}>
        {label}
      </span>
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
  const { locale } = useI18n();
  const isActive = active === sortKey;
  return (
    <th className="px-5 py-3">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={captionClass(locale, "group inline-flex items-center gap-1.5  text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]")}
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
  const { locale, t } = useI18n();
  return (
    <span className={captionClassTight(locale, "inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-2.5 py-0.5  text-[var(--muted-foreground)]")}>
      {translateRole(role, t)}
    </span>
  );
}

function StatePill({ active, label }: { active: boolean; label: string }) {
  const { locale, t } = useI18n();
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5", captionClassTight(locale),
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-rose-500")}
        aria-hidden
      />
      {label === "Disabled"
        ? t("pages.sysadmin.sharedAccounts.disabled")
        : active
          ? t("common.active")
          : t("common.inactive")}
    </span>
  );
}

function AccountRow({
  account,
  showRole,
  selected,
  onOpen,
}: {
  account: AccountRosterEntry;
  showRole: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  const status = deriveStatus(account);
  const isDoctor = account.role === "doctor";
  const Icon = isDoctor ? Stethoscope : account.role === "sys-admin" ? ShieldCheck : UserCog;

  return (
    // biome-ignore lint/a11y/useSemanticElements: table row acting as a button — HTML forbids <button> inside <tr>; role/tabIndex/aria-pressed + key handler replicate it.
    <tr
      onClick={onOpen}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
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
      {showRole ? (
        <td className="px-5 py-3.5">
          <RoleBadge role={account.role} />
        </td>
      ) : null}
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

function CreateAccountModal({
  open,
  onClose,
  roles,
  title,
  description,
  manualDoctorHref,
}: {
  open: boolean;
  onClose: () => void;
  roles: CreatableRole[];
  title: string;
  description: string;
  manualDoctorHref?: string;
}) {
  const { locale, t } = useI18n();
  const create = useCreateOperatingAccount();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const passwordCaps = useCapsLock();
  const confirmCaps = useCapsLock();
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<CreatableRole>(roles[0]);
  const [localError, setLocalError] = useState<string | null>(null);

  const reset = () => {
    setUsername("");
    setFullName("");
    setContact("");
    setPassword("");
    setConfirm("");
    setRole(roles[0]);
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
    // Doctors never reach here — that branch renders the invite panel, which
    // owns its own submit. Guarding also narrows `role` for POST /accounts.
    if (role === "doctor") return;
    if (!username) return setLocalError(t("errors.username_required"));
    // Credentials are rejected, never repaired — see lib/credentials.ts.
    const nameErr = usernameError(username);
    if (nameErr) return setLocalError(nameErr);
    const pwErr = newPasswordError(password);
    if (pwErr) return setLocalError(pwErr);
    if (password !== confirm) return setLocalError(t("pages.sysadmin.sharedAccounts.passwordsDoNotMatch"));
    create.mutate(
      {
        // Verbatim; fullName/contact keep trimming — they aren't credentials.
        username,
        password,
        role,
        fullName: fullName.trim() || undefined,
        contact: contact.trim() || undefined,
      },
      { onSuccess: close },
    );
  };

  return (
    <Modal open={open} onClose={close} title={title} description={description}>
      {/* The role picker sits ABOVE the body rather than inside it: it
          decides which body you get, and a doctor's invite form is its own
          <form>, which can't legally nest inside the operating-account one. */}
      <div className="flex flex-col gap-4">
        {/* With one creatable role there is nothing to choose — the role is
            fixed and stated in the modal description instead. */}
        {roles.length > 1 ? (
          <Field label={t("pages.sysadmin.sharedAccounts.role")}>
            <Select value={role} onChange={(e) => setRole(e.target.value as CreatableRole)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {translateRole(r as AccountRole, t)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {role === "doctor" ? (
          <InvitePanel
            showHeading={false}
            onDone={close}
            extra={
              <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t("pages.sysadmin.sharedAccounts.doctorInviteHelp")}
                </p>
                {manualDoctorHref ? (
                  <Link
                    href={manualDoctorHref}
                    onClick={close}
                    className="w-fit text-xs font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                  >
                    {t("pages.sysadmin.sharedAccounts.manualDoctorLink")}
                  </Link>
                ) : null}
              </div>
            }
          />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label={t("login.username")}>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </Field>
            <Field label={t("pages.sysadmin.sharedAccounts.fullNameOptional")}>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Alice Adams"
              />
            </Field>
            <Field label={t("pages.sysadmin.sharedAccounts.phoneOptional")}>
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. +94 77 123 4567"
              />
            </Field>
            <Field label={t("pages.sysadmin.sharedAccounts.password")} error={passwordError(password) ?? undefined}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                {...passwordCaps.capsLockProps}
              />
              <CapsLockHint id={passwordCaps.hintId} show={passwordCaps.capsLockOn} />
            </Field>
            <Field label={t("pages.sysadmin.sharedAccounts.confirmPassword")}>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                {...confirmCaps.capsLockProps}
              />
              <CapsLockHint id={confirmCaps.hintId} show={confirmCaps.capsLockOn} />
            </Field>

            {localError ? <ErrorBanner>{localError}</ErrorBanner> : null}
            {create.error ? <ErrorBanner>{explainError(create.error.error)}</ErrorBanner> : null}

            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending
                  ? t("pages.sysadmin.sharedAccounts.creatingAccount")
                  : t("pages.sysadmin.sharedAccounts.createAccount")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
