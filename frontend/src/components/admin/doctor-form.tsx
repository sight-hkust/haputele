"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { z } from "zod";
import { BadgeCheck, ContactRound, IdCard, Mail, PenLine, Stamp } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Textarea } from "@/components/primitives/select";
import { RubberStampUploader } from "@/components/admin/rubber-stamp-uploader";
import { SignatureInput } from "@/components/doctor/signature-input";
import type { Doctor } from "@/types/api";

// Mode-aware schema — username + password are required at create time, omitted/optional on edit.
// Rubber stamp is required on create; on edit it's optional (existing image stays unless replaced).
const baseFields = {
  givenName: z.string().min(1, "Given name is required"),
  familyName: z.string().min(1, "Family name is required"),
  contact: z.string().min(1, "Contact number is required"),
  email: z.string().email("Enter a valid email"),
  slmcRegistrationNumber: z.string().min(1, "SLMC registration number is required (§1.7)"),
  qualifications: z.string().min(1, "Qualifications are required (§1.7)"),
  practitionerAddress: z.string().min(1, "Practitioner address is required (§1.7)"),
  instituteName: z.string().min(1, "Institute name is required"),
  // Institute phone is optional — §1.7 prescriptions are valid without it.
  instituteContact: z.string().optional(),
};

// Password validity now depends on `onboardingMode`. Zod can't peek at
// React state, so the schema treats password as optional and the submit
// handler enforces "manual mode → password required". Keeps zod working
// for everything else while the mode toggle drives the password rule.
const createSchema = z.object({
  ...baseFields,
  username: z.string().min(1, "Username is required"),
  password: z.string().optional(),
});

type OnboardingMode = "invite" | "manual";

const updateSchema = z.object({
  ...baseFields,
  password: z.string().optional(),
});

export type DoctorFormPayload = {
  givenName: string;
  familyName: string;
  contact: string;
  email: string;
  slmcRegistrationNumber: string;
  qualifications: string;
  practitionerAddress: string;
  instituteName: string;
  instituteContact?: string;
  rubberStampImage?: string; // base64 — required on create, optional on update
  // base64 PNG saved e-signature — set to replace, clearDefaultSignature to remove.
  defaultSignatureImage?: string;
  clearDefaultSignature?: boolean;
  username?: string; // create only
  password?: string;
};

export function DoctorForm({
  initial,
  mode,
  embedded,
  submitting,
  errorMessage,
  errorMissingFields,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Doctor> | null;
  mode: "create" | "update";
  // "self-onboarding" hides the admin-only onboarding-mode toggle and
  // requires both a username and a password (the doctor is creating
  // their own login). Default (undefined) gives the regular admin
  // experience with the toggle.
  embedded?: "self-onboarding";
  submitting: boolean;
  errorMessage?: string | null;
  errorMissingFields?: string[];
  submitLabel: string;
  onSubmit: (payload: DoctorFormPayload) => void;
  onCancel?: () => void;
}) {
  const isCreate = mode === "create";
  const isSelfOnboarding = embedded === "self-onboarding";
  type Values = z.infer<typeof createSchema>;
  // In update mode we seed the uploader from the existing stamp so admins see
  // what's on file (Stamp captured / Replace / Clear). `stampDirty` flips on any
  // user interaction so we only resend the stamp when it actually changes —
  // avoids a 1 MB round-trip on every save.
  const [stamp, setStamp] = useState<string | null>(initial?.rubberStampImage ?? null);
  const [stampDirty, setStampDirty] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);
  // Saved e-signature state. On create, starts null. On update, we track:
  //   - replacingSignature: true → SignatureInput shown to set a new one
  //   - clearSignature: true → send clearDefaultSignature to the backend
  //   - signature: non-null new image the doctor drew/uploaded this session
  const [signature, setSignature] = useState<string | null>(null);
  const [clearSignature, setClearSignature] = useState(false);
  const [replacingSignature, setReplacingSignature] = useState(false);
  // Onboarding-mode picker. "invite" (default) tells the backend to email
  // the doctor a link to set their own password. "manual" preserves the
  // legacy flow — admin types the password and shares it offline. Only
  // shown in create mode; in edit mode the password input keeps its
  // existing "rotate password" semantics.
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>("invite");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleStampChange = (next: string | null) => {
    setStamp(next);
    setStampDirty(true);
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(isCreate ? createSchema : updateSchema) as never,
    defaultValues: {
      givenName: initial?.givenName ?? "",
      familyName: initial?.familyName ?? "",
      contact: initial?.contact ?? "",
      email: initial?.email ?? "",
      slmcRegistrationNumber: initial?.slmcRegistrationNumber ?? "",
      qualifications: initial?.qualifications ?? "",
      practitionerAddress: initial?.practitionerAddress ?? "",
      instituteName: initial?.instituteName ?? "",
      instituteContact: initial?.instituteContact ?? "",
      username: "",
      password: "",
    } as Values,
  });

  const submit = handleSubmit((v) => {
    if (isCreate && !stamp) {
      setStampError("Rubber stamp image is required (§1.7).");
      return;
    }
    setStampError(null);
    // Mode-dependent password validation. Manual mode → must be present.
    // Invite mode → must NOT be sent (backend reads its absence as the
    // "issue an invite" signal). Edit mode keeps the legacy "leave blank
    // to keep" semantics regardless of the toggle (toggle isn't shown).
    // In self-onboarding mode the doctor MUST provide both username
    // and password; in admin-create mode the toggle decides.
    if (
      isCreate
      && !isSelfOnboarding
      && onboardingMode === "manual"
      && (!v.password || !v.password.trim())
    ) {
      setPasswordError("Password is required when sharing credentials manually.");
      return;
    }
    if (isCreate && isSelfOnboarding && (!v.password || !v.password.trim())) {
      setPasswordError("Pick a password.");
      return;
    }
    setPasswordError(null);
    const stampToSend = isCreate ? stamp : stampDirty && stamp ? stamp : null;
    const payload: DoctorFormPayload = {
      givenName: v.givenName.trim(),
      familyName: v.familyName.trim(),
      contact: v.contact.trim(),
      email: v.email.trim(),
      slmcRegistrationNumber: v.slmcRegistrationNumber.trim(),
      qualifications: v.qualifications.trim(),
      practitionerAddress: v.practitionerAddress.trim(),
      instituteName: v.instituteName.trim(),
      instituteContact: v.instituteContact?.trim() || undefined,
      rubberStampImage: stampToSend ?? undefined,
    };
    if (isCreate) {
      payload.username = v.username?.trim();
      if (signature) payload.defaultSignatureImage = signature;
      if (isSelfOnboarding) {
        // Self-onboarding: password is always sent (validated above).
        payload.password = v.password;
      } else if (onboardingMode === "manual" && v.password) {
        payload.password = v.password;
      }
      // admin invite mode → payload.password stays undefined; backend fires invite
    } else {
      // Update mode — include signature changes if any.
      if (clearSignature) {
        payload.clearDefaultSignature = true;
      } else if (signature) {
        payload.defaultSignatureImage = signature;
      }
      if (v.password && v.password.trim()) payload.password = v.password;
    }
    onSubmit(payload);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-10">
      {errorMessage && (
        <ErrorBanner>
          {errorMessage}
          {errorMissingFields && errorMissingFields.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {errorMissingFields.map((f) => (
                <li key={f} className="font-mono text-xs">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </ErrorBanner>
      )}

      <Section Icon={ContactRound} title="Identity & contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Given name *" htmlFor="givenName" error={errors.givenName?.message}>
            <Input id="givenName" {...register("givenName")} />
          </Field>
          <Field label="Family name *" htmlFor="familyName" error={errors.familyName?.message}>
            <Input id="familyName" {...register("familyName")} />
          </Field>
          {/* In self-onboarding mode the email is owned by the invite, not
              the form — the page renders a locked email card above. We
              hide this field entirely so there's nothing for the user to
              fight with and nothing the client could try to forge. The
              register() call still runs so react-hook-form's defaultValue
              for `email` is present in the values dict, but it isn't
              read by any submit path in self-onboarding mode. */}
          {!isSelfOnboarding && (
            <Field label="Email *" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                {...register("email")}
              />
            </Field>
          )}
          <Field label="Contact number *" htmlFor="contact" error={errors.contact?.message}>
            <Input id="contact" autoComplete="off" {...register("contact")} placeholder="+94…" />
          </Field>
        </div>
      </Section>

      <Section Icon={IdCard} title="Login credentials">
        {isCreate && !isSelfOnboarding && (
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              Icon={Mail}
              title="Send invite email"
              description="Doctor receives a link to set their own password. Recommended."
              selected={onboardingMode === "invite"}
              onClick={() => setOnboardingMode("invite")}
            />
            <ModeCard
              Icon={IdCard}
              title="Set password manually"
              description="Type a password and share it with the doctor offline."
              selected={onboardingMode === "manual"}
              onClick={() => setOnboardingMode("manual")}
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {isCreate ? (
            <Field label="Username *" htmlFor="username" error={errors.username?.message}>
              <Input id="username" {...register("username")} autoComplete="off" />
            </Field>
          ) : (
            <div className="flex flex-col gap-2">
              <Label>Username</Label>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 font-mono text-sm">
                {initial?.username}
              </div>
            </div>
          )}
          {/* Show password in: update mode, manual create mode, and always
              in self-onboarding mode (the doctor picks their own). Hidden
              in admin "invite" create mode since the doctor will set it
              via the onboarding link. */}
          {(!isCreate || isSelfOnboarding || onboardingMode === "manual") && (
            <Field
              label={isCreate ? "Password *" : "New password (leave blank to keep)"}
              htmlFor="password"
              error={passwordError ?? errors.password?.message}
            >
              <Input id="password" type="password" {...register("password")} autoComplete="new-password" />
            </Field>
          )}
        </div>
        {isCreate && !isSelfOnboarding && onboardingMode === "invite" && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            On save, the doctor receives an invite at the email above. The link
            expires in 72 hours; you can re-send from the doctor&rsquo;s detail page.
          </p>
        )}
      </Section>

      <Section
        Icon={BadgeCheck}
        title="Sri Lanka §1.7 prescription requirements"
        hint="These fields plus the rubber stamp are reproduced on every prescription PDF this doctor signs. All are required at account creation except the institute phone."
      >
        {/* autoComplete="off" everywhere in this section — browsers see
            field ids like "practitionerAddress" / "instituteName" and
            confidently autofill them with the user's home address /
            employer, which is wrong for a clinic profile. The doctor
            should type these fields explicitly. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="SLMC registration number *"
            htmlFor="slmcRegistrationNumber"
            error={errors.slmcRegistrationNumber?.message}
          >
            <Input id="slmcRegistrationNumber" autoComplete="off" {...register("slmcRegistrationNumber")} />
          </Field>
          <Field label="Institute name *" htmlFor="instituteName" error={errors.instituteName?.message}>
            <Input id="instituteName" autoComplete="off" {...register("instituteName")} />
          </Field>
          <Field
            label="Institute contact"
            htmlFor="instituteContact"
            error={errors.instituteContact?.message}
          >
            <Input id="instituteContact" autoComplete="off" {...register("instituteContact")} placeholder="Optional" />
          </Field>
          <Field label="Qualifications *" htmlFor="qualifications" full error={errors.qualifications?.message}>
            <Textarea id="qualifications" rows={3} autoComplete="off" {...register("qualifications")} placeholder="e.g. MBBS, MD" />
          </Field>
          <Field
            label="Practitioner address *"
            htmlFor="practitionerAddress"
            full
            error={errors.practitionerAddress?.message}
          >
            <Textarea id="practitionerAddress" rows={3} autoComplete="off" {...register("practitionerAddress")} />
          </Field>
        </div>
      </Section>

      <Section Icon={Stamp} title="Rubber stamp" hint={isCreate ? "Required (§1.7)." : "Replace only if you need to update the existing stamp."}>
        {/* Phone-camera QR needs an authenticated admin to mint a session,
            so it's only offered outside the public self-onboarding form. */}
        <RubberStampUploader
          value={stamp}
          onChange={handleStampChange}
          enableQrCapture={!isSelfOnboarding}
        />
        {stampError && <p className="mt-2 text-xs text-rose-600">{stampError}</p>}
      </Section>

      <Section
        Icon={PenLine}
        title="Default e-signature"
        hint={isCreate
          ? "Optional. Save a signature once and it's applied automatically on every consultation — no need to sign each time."
          : "Replaces or removes the doctor's saved e-signature."}
      >
        {/* Update mode: show "on file" state with replace / clear actions */}
        {!isCreate && (() => {
          const hasOnFile = !!initial?.hasDefaultSignature;
          const showOnFile = hasOnFile && !clearSignature && !replacingSignature && !signature;
          if (showOnFile) {
            return (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-600">Signature on file</div>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">The doctor has a saved default e-signature.</p>
                </div>
                <button type="button" onClick={() => setReplacingSignature(true)}
                  className="text-sm text-[var(--accent)] hover:underline">Replace</button>
                <button type="button" onClick={() => setClearSignature(true)}
                  className="text-sm text-rose-600 hover:underline">Remove</button>
              </div>
            );
          }
          if (clearSignature) {
            return (
              <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex-1 text-sm text-rose-700">Signature will be removed on save.</div>
                <button type="button" onClick={() => setClearSignature(false)}
                  className="text-sm text-[var(--accent)] hover:underline">Undo</button>
              </div>
            );
          }
          // replacingSignature=true or no prior signature — show the input
          return (
            <div className="flex flex-col gap-2">
              <SignatureInput value={signature} onChange={setSignature} />
              {(replacingSignature || !hasOnFile) && signature === null && (
                <button type="button" onClick={() => { setReplacingSignature(false); setSignature(null); }}
                  className="self-start text-xs text-[var(--muted-foreground)] hover:underline">
                  {hasOnFile ? "Keep existing" : "Skip"}
                </button>
              )}
            </div>
          );
        })()}
        {/* Create mode: plain optional input */}
        {isCreate && <SignatureInput value={signature} onChange={setSignature} />}
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({
  Icon,
  title,
  hint,
  children,
}: {
  Icon: typeof BadgeCheck;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[var(--accent)]/10 p-2">
          <Icon className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div>
          <h3 className="font-display text-xl tracking-[-0.01em]">{title}</h3>
          {hint && <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ModeCard({
  Icon,
  title,
  description,
  selected,
  onClick,
}: {
  Icon: typeof BadgeCheck;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
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
          className={`h-4 w-4 ${
            selected ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"
          }`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs leading-snug text-[var(--muted-foreground)]">{description}</span>
      </div>
    </button>
  );
}


function Field({
  label,
  htmlFor,
  error,
  full,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
