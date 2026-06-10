"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, IdCard, Mail } from "lucide-react";

import { DoctorForm } from "@/components/admin/doctor-form";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { PageHeader } from "@/components/primitives/page-header";
import { useCreateDoctor, useInviteDoctor } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";

// Two ways to add a doctor:
//   "invite"  → admin types only email (+ optional name hint). Doctor
//               fills the rest via the public onboarding link, then waits
//               for admin approval. This is the recommended path.
//   "manual"  → admin types everything (legacy). Useful when the doctor
//               can't be reached by email or when bulk-importing from
//               another system.
type Mode = "invite" | "manual";

export default function NewDoctorPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("invite");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to doctors
      </Link>

      <PageHeader
        label="New doctor"
        title="Add a"
        highlight="doctor account."
        subtitle="Invite the doctor by email so they can fill out their own profile, or create the account manually if you've got all the §1.7 information already."
      />

      {/* Mode picker — full-width, sits above the form so the choice is obvious. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          Icon={Mail}
          title="Invite by email"
          description="Type only the doctor's email. They fill out the full profile and you approve before they can log in."
          recommended
          selected={mode === "invite"}
          onClick={() => setMode("invite")}
        />
        <ModeCard
          Icon={IdCard}
          title="Create manually"
          description="Type the full §1.7 profile yourself. Use this when the doctor isn't reachable by email or you're importing from another system."
          selected={mode === "manual"}
          onClick={() => setMode("manual")}
        />
      </div>

      <Card variant="elevated" className="p-8">
        {mode === "invite" ? (
          <InvitePanel onDone={() => router.push("/admin")} />
        ) : (
          <ManualPanel onCancel={() => router.push("/admin")} onCreated={(id) => router.push(`/admin/doctors/${id}`)} />
        )}
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Invite panel — email + optional name hint, fires POST /doctors/invites
 * ────────────────────────────────────────────────────────────────── */

function InvitePanel({ onDone }: { onDone: () => void }) {
  const invite = useInviteDoctor();
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    invite.mutate(
      {
        email: email.trim(),
        familyName: familyName.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl tracking-[-0.01em]">Invite a doctor by email</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          They&rsquo;ll receive a link to set up their account. Once they submit
          their profile you&rsquo;ll be able to review and approve from the
          doctor&rsquo;s page.
        </p>
      </div>

      {invite.error && (
        <ErrorBanner>{explainError(invite.error.error)}</ErrorBanner>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">Doctor&rsquo;s email *</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="doctor@example.com"
          required
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-family-name">Family name (optional)</Label>
        <Input
          id="invite-family-name"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          placeholder="Perera"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Used only to personalise the invite email&rsquo;s greeting. The doctor
          enters their full name themselves.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={invite.isPending || !email.trim()}>
          {invite.isPending ? "Sending…" : "Send invite"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Manual panel — the existing DoctorForm
 * ────────────────────────────────────────────────────────────────── */

function ManualPanel({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: number) => void;
}) {
  const create = useCreateDoctor();
  const errCode = create.error?.error ?? null;
  const missing = (create.error?.detail?.missing as string[] | undefined) ?? undefined;
  const errorMessage = errCode
    ? errCode === "missing_prescription_fields"
      ? "Some §1.7 mandatory fields couldn't be validated server-side."
      : explainError(errCode)
    : null;

  return (
    <DoctorForm
      mode="create"
      submitting={create.isPending}
      errorMessage={errorMessage}
      errorMissingFields={missing}
      submitLabel="Create doctor"
      onCancel={onCancel}
      onSubmit={(payload) => {
        create.mutate(
          {
            username: payload.username!,
            password: payload.password,
            givenName: payload.givenName,
            familyName: payload.familyName,
            contact: payload.contact,
            email: payload.email,
            slmcRegistrationNumber: payload.slmcRegistrationNumber,
            qualifications: payload.qualifications,
            practitionerAddress: payload.practitionerAddress,
            instituteName: payload.instituteName,
            instituteContact: payload.instituteContact,
            rubberStampImage: payload.rubberStampImage!,
            defaultSignatureImage: payload.defaultSignatureImage,
          },
          { onSuccess: (doc) => onCreated(doc.id) },
        );
      }}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────
 * ModeCard — the same two-card chooser used inside DoctorForm
 * ────────────────────────────────────────────────────────────────── */

function ModeCard({
  Icon,
  title,
  description,
  recommended,
  selected,
  onClick,
}: {
  Icon: typeof Mail;
  title: string;
  description: string;
  recommended?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-start gap-3 rounded-2xl border p-5 text-left transition-all ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm"
          : "border-[var(--border)] bg-transparent hover:border-[var(--accent)]/40"
      }`}
    >
      <div
        className={`rounded-lg p-2 ${
          selected ? "bg-[var(--accent)]/15" : "bg-[var(--muted)]"
        }`}
      >
        <Icon
          className={`h-5 w-5 ${
            selected ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"
          }`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {recommended && (
            <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
              Recommended
            </span>
          )}
        </span>
        <span className="text-xs leading-snug text-[var(--muted-foreground)]">
          {description}
        </span>
      </div>
    </button>
  );
}
