"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, IdCard, Mail } from "lucide-react";

import { DoctorForm } from "@/components/admin/doctor-form";
import { BackLink } from "@/components/primitives/back-link";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { PageHeader } from "@/components/primitives/page-header";
import { useCreateDoctor, useInviteDoctor } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { useI18n } from "@/lib/i18n";

// Two ways to add a doctor:
//   "invite"  → admin types only email (+ optional name hint). Doctor
//               fills the rest via the public onboarding link, then waits
//               for admin approval. This is the recommended path.
//   "manual"  → admin types everything (legacy). Useful when the doctor
//               can't be reached by email or when bulk-importing from
//               another system.
type Mode = "invite" | "manual";

/** Both administrative roles may add doctors (POST /doctors accepts admin
 *  and sys-admin alike), but they live in different shells and the
 *  frontend role guard bounces each out of the other's URL segment. So the
 *  screen is shared and only its navigation targets differ. */
export type NewDoctorSurfaceProps = {
  /** Where "cancel" and a finished invite return to. */
  returnHref: string;
  backLabel: string;
  /** Where a manually-created doctor lands. The sys-admin has no dedicated
   *  doctor detail route — its roster opens doctors in an inline panel —
   *  so it just returns to the roster. */
  createdHref: (doctorId: number) => string;
  /** Which panel to open on. Callers that already offer the invite
   *  elsewhere (the sys-admin's Add-account modal) deep-link straight to
   *  "manual" so the user isn't made to pick twice. */
  initialMode?: Mode;
};

export function NewDoctorSurface({
  returnHref,
  backLabel,
  createdHref,
  initialMode = "invite",
}: NewDoctorSurfaceProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      <BackLink href={returnHref}>{backLabel}</BackLink>

      <PageHeader
        label={t("pages.admin.doctors.newDoctorLabel")}
        title={t("pages.admin.doctors.newDoctorTitle")}
        highlight={t("pages.admin.doctors.newDoctorHighlight")}
        subtitle={t("pages.admin.doctors.newDoctorSubtitle")}
      />

      {/* Mode picker — full-width, sits above the form so the choice is obvious. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          Icon={Mail}
          title={t("pages.admin.doctors.inviteByEmail")}
          description={t("pages.admin.doctors.inviteByEmailDescription")}
          recommended
          selected={mode === "invite"}
          onClick={() => setMode("invite")}
        />
        <ModeCard
          Icon={IdCard}
          title={t("pages.admin.doctors.createManually")}
          description={t("pages.admin.doctors.createManuallyDescription")}
          selected={mode === "manual"}
          onClick={() => setMode("manual")}
        />
      </div>

      <Card variant="elevated" className="p-8">
        {mode === "invite" ? (
          <InvitePanel onDone={() => router.push(returnHref)} />
        ) : (
          <ManualPanel
            onCancel={() => router.push(returnHref)}
            onCreated={(id) => router.push(createdHref(id))}
          />
        )}
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Invite panel — email + optional name hint, fires POST /doctors/invites
 * ────────────────────────────────────────────────────────────────── */

/** Exported so the sys-admin's Add-account modal can render the same
 *  invite form inline, rather than duplicating the fields and the
 *  `useInviteDoctor` call. The full manual form can't be shared that way —
 *  it's 583 lines and the Modal primitive has no scroll container (#67) —
 *  so the modal links out to this page for that path instead. */
export function InvitePanel({
  onDone,
  showHeading = true,
  extra,
}: {
  onDone: () => void;
  /** Off inside a modal, whose own title already says what this is. */
  showHeading?: boolean;
  /** Rendered just above the buttons — the modal puts its "type the full
   *  profile yourself" link here. */
  extra?: ReactNode;
}) {
  const { t } = useI18n();
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
      {showHeading && (
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl tracking-[-0.01em]">
            {t("pages.admin.doctors.invitePanelTitle")}
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("pages.admin.doctors.invitePanelDescription")}
          </p>
        </div>
      )}

      {invite.error && <ErrorBanner>{explainError(invite.error.error)}</ErrorBanner>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">{t("pages.admin.doctors.inviteEmailLabel")} *</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("pages.admin.doctors.inviteEmailPlaceholder")}
          required
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-family-name">{t("pages.admin.doctors.inviteFamilyNameLabel")}</Label>
        <Input
          id="invite-family-name"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          placeholder={t("pages.admin.doctors.inviteFamilyNamePlaceholder")}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          {t("pages.admin.doctors.inviteFamilyNameHint")}
        </p>
      </div>

      {extra}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={invite.isPending || !email.trim()}>
          {invite.isPending ? t("pages.admin.doctors.sending") : t("pages.admin.doctors.sendInvite")}
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
  const { t } = useI18n();
  const create = useCreateDoctor();
  const errCode = create.error?.error ?? null;
  const missing = (create.error?.detail?.missing as string[] | undefined) ?? undefined;
  const errorMessage = errCode ? explainError(errCode) : null;

  return (
    <DoctorForm
      mode="create"
      submitting={create.isPending}
      errorMessage={errorMessage}
      errorMissingFields={missing}
      submitLabel={t("pages.admin.doctors.createDoctor")}
      onCancel={onCancel}
      onSubmit={(payload) => {
        // Both fields are required on create and gated by DoctorForm's
        // submit validation; the guard satisfies the checker for the
        // shared optional-typed payload without asserting.
        if (!payload.username || !payload.rubberStampImage) return;
        create.mutate(
          {
            username: payload.username,
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
            rubberStampImage: payload.rubberStampImage,
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
  const { t } = useI18n();
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
      <div className={`rounded-lg p-2 ${selected ? "bg-[var(--accent)]/15" : "bg-[var(--muted)]"}`}>
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
            <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-xs uppercase tracking-[0.12em] text-[var(--accent)]">
              {t("common.recommended")}
            </span>
          )}
        </span>
        <span className="text-xs leading-snug text-[var(--muted-foreground)]">{description}</span>
      </div>
    </button>
  );
}
