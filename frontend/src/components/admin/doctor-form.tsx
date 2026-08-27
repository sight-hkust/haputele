"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMemo, useState } from "react";
import { z } from "zod";
import { BadgeCheck, ContactRound, IdCard, Mail, PenLine, Stamp } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { CapsLockHint } from "@/components/primitives/caps-lock-hint";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Textarea } from "@/components/primitives/select";
import { RubberStampUploader } from "@/components/admin/rubber-stamp-uploader";
import { SignatureInput } from "@/components/doctor/signature-input";
import {
  MIN_PASSWORD_LEN,
  newPasswordError as newPasswordRuleError,
  passwordError as passwordRuleError,
  usernameError as usernameRuleError,
} from "@/lib/credentials";
import { useI18n } from "@/lib/i18n";
import { useCapsLock } from "@/lib/use-caps-lock";
import type { Doctor } from "@/types/api";

// Mode-aware schema — username + password are required at create time, omitted/optional on edit.
// Rubber stamp is required on create; on edit it's optional (existing image stays unless replaced).
function buildBaseFields(t: (key: string) => string) {
  const v = (key: string) => t(`pages.admin.doctors.form.validation.${key}`);
  return {
    givenName: z.string().min(1, v("givenNameRequired")),
    familyName: z.string().min(1, v("familyNameRequired")),
    contact: z.string().min(1, v("contactRequired")),
    email: z.string().email(v("emailInvalid")),
    slmcRegistrationNumber: z.string().min(1, v("slmcRequired")),
    qualifications: z.string().min(1, v("qualificationsRequired")),
    practitionerAddress: z.string().min(1, v("practitionerAddressRequired")),
    instituteName: z.string().min(1, v("instituteNameRequired")),
    // Institute phone is optional — §1.7 prescriptions are valid without it.
    instituteContact: z.string().optional(),
  };
}

function buildCreateSchema(t: (key: string) => string) {
  return z.object({
    ...buildBaseFields(t),
    username: z.string().min(1, t("pages.admin.doctors.form.validation.usernameRequired")),
    password: z.string().optional(),
    passwordConfirm: z.string().optional(),
  });
}

type OnboardingMode = "invite" | "manual";

function buildUpdateSchema(t: (key: string) => string) {
  return z.object({
    ...buildBaseFields(t),
    password: z.string().optional(),
    passwordConfirm: z.string().optional(),
  });
}

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
  const { t } = useI18n();
  const isCreate = mode === "create";
  const isSelfOnboarding = embedded === "self-onboarding";
  type Values = z.infer<ReturnType<typeof buildCreateSchema>>;
  const createSchema = useMemo(() => buildCreateSchema(t), [t]);
  const updateSchema = useMemo(() => buildUpdateSchema(t), [t]);
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
    // `watch` drives the live credential warnings below — a stray space is
    // invisible in a masked field, so we flag it as it's typed.
    watch,
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
      passwordConfirm: "",
    } as Values,
  });

  // Hoisted out of the JSX so useCapsLock can COMPOSE with RHF's own onBlur
  // instead of replacing it. Calling register() unconditionally is safe here:
  // it only returns props, `shouldUnregister` is false (the default), and both
  // fields are already seeded by defaultValues whether or not they render.
  const passwordField = register("password");
  const passwordConfirmField = register("passwordConfirm");
  const passwordCaps = useCapsLock(passwordField);
  const confirmCaps = useCapsLock(passwordConfirmField);

  const submit = handleSubmit((v) => {
    if (isCreate && !stamp) {
      setStampError(t("pages.admin.doctors.form.validation.rubberStampRequired"));
      return;
    }
    setStampError(null);
    // Mode-dependent password validation. Manual mode → must be present.
    // Invite mode → must NOT be sent (backend reads its absence as the
    // "issue an invite" signal). Edit mode keeps the legacy "leave blank
    // to keep" semantics regardless of the toggle (toggle isn't shown).
    // In self-onboarding mode the doctor MUST provide both username
    // and password; in admin-create mode the toggle decides.
    if (isCreate && !isSelfOnboarding && onboardingMode === "manual" && !v.password) {
      setPasswordError(t("pages.admin.doctors.form.validation.passwordRequiredManual"));
      return;
    }
    if (isCreate && isSelfOnboarding && !v.password) {
      setPasswordError(t("errors.missing_password"));
      return;
    }
    // Credential rules — rejected, never repaired. What is typed is what gets
    // stored and what will be typed at login. See lib/credentials.ts.
    if (isCreate && v.username) {
      const nameErr = usernameRuleError(v.username);
      if (nameErr) {
        setPasswordError(nameErr);
        return;
      }
    }
    if (v.password) {
      // Full policy, not just whitespace: this form is the create path, the
      // rotation path AND the embedded new-doctor onboarding path, and it
      // used to apply no length rule at all — so every password it accepted
      // that was under the minimum came back as a server-side 422.
      const pwErr = newPasswordRuleError(v.password);
      if (pwErr) {
        setPasswordError(pwErr);
        return;
      }
    }
    // Whenever a password is being set (create, manual, self-onboarding, or an
    // edit-mode rotation), the confirmation must match it — compared raw, since
    // edge whitespace has already been rejected above.
    if (v.password && v.password !== (v.passwordConfirm ?? "")) {
      setPasswordError(t("pages.admin.doctors.form.validation.passwordsDoNotMatch"));
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
      // Credentials go verbatim; every other field above keeps its trim —
      // they aren't credentials and nobody types them at a login prompt.
      payload.username = v.username;
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
      // Edit-mode rotation. Verbatim — validated above, never repaired.
      if (v.password) payload.password = v.password;
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

      <Section Icon={ContactRound} title={t("pages.admin.doctors.form.sections.identityContact")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`${t("forms.givenName")} *`}
            htmlFor="givenName"
            error={errors.givenName?.message}
          >
            <Input id="givenName" {...register("givenName")} />
          </Field>
          <Field
            label={`${t("forms.familyName")} *`}
            htmlFor="familyName"
            error={errors.familyName?.message}
          >
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
            <Field
              label={`${t("common.email")} *`}
              htmlFor="email"
              error={errors.email?.message}
            >
              <Input id="email" type="email" {...register("email")} />
            </Field>
          )}
          <Field
            label={`${t("forms.contactNumber")} *`}
            htmlFor="contact"
            error={errors.contact?.message}
          >
            <Input
              id="contact"
              autoComplete="off"
              {...register("contact")}
              placeholder={t("forms.phonePlaceholder")}
            />
          </Field>
        </div>
      </Section>

      <Section Icon={IdCard} title={t("pages.admin.doctors.form.sections.loginCredentials")}>
        {isCreate && !isSelfOnboarding && (
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              Icon={Mail}
              title={t("pages.admin.doctors.form.onboarding.sendInviteEmail")}
              description={t("pages.admin.doctors.form.onboarding.sendInviteEmailDescription")}
              selected={onboardingMode === "invite"}
              onClick={() => setOnboardingMode("invite")}
            />
            <ModeCard
              Icon={IdCard}
              title={t("pages.admin.doctors.form.onboarding.setPasswordManually")}
              description={t("pages.admin.doctors.form.onboarding.setPasswordManuallyDescription")}
              selected={onboardingMode === "manual"}
              onClick={() => setOnboardingMode("manual")}
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {isCreate ? (
            <Field
              label={`${t("forms.username")} *`}
              htmlFor="username"
              error={usernameRuleError(watch("username") ?? "") ?? errors.username?.message}
            >
              <Input id="username" {...register("username")} autoComplete="off" />
            </Field>
          ) : (
            <div className="flex flex-col gap-2">
              <Label>{t("forms.username")}</Label>
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
            <>
              <Field
                label={
                  isCreate
                    ? t("pages.admin.doctors.form.passwordRequired")
                    : t("pages.admin.doctors.form.newPasswordKeepBlank")
                }
                htmlFor="password"
                error={
                  passwordError ??
                  passwordRuleError(watch("password") ?? "") ??
                  errors.password?.message
                }
              >
                <Input
                  id="password"
                  type="password"
                  {...passwordField}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LEN}
                  {...passwordCaps.capsLockProps}
                />
                <CapsLockHint id={passwordCaps.hintId} show={passwordCaps.capsLockOn} />
              </Field>
              <Field
                label={
                  isCreate
                    ? t("pages.admin.doctors.form.confirmPasswordRequired")
                    : t("pages.admin.doctors.form.confirmNewPassword")
                }
                htmlFor="passwordConfirm"
              >
                <Input
                  id="passwordConfirm"
                  type="password"
                  {...passwordConfirmField}
                  autoComplete="new-password"
                  {...confirmCaps.capsLockProps}
                />
                <CapsLockHint id={confirmCaps.hintId} show={confirmCaps.capsLockOn} />
              </Field>
            </>
          )}
        </div>
        {isCreate && !isSelfOnboarding && onboardingMode === "invite" && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            {t("pages.admin.doctors.form.onboarding.inviteHint")}
          </p>
        )}
      </Section>

      <Section
        Icon={BadgeCheck}
        title={t("pages.admin.doctors.form.sections.prescriptionRequirements")}
        hint={t("pages.admin.doctors.form.prescriptionHint")}
      >
        {/* autoComplete="off" everywhere in this section — browsers see
            field ids like "practitionerAddress" / "instituteName" and
            confidently autofill them with the user's home address /
            employer, which is wrong for a clinic profile. The doctor
            should type these fields explicitly. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`${t("forms.slmcRegistrationNumber")} *`}
            htmlFor="slmcRegistrationNumber"
            error={errors.slmcRegistrationNumber?.message}
          >
            <Input
              id="slmcRegistrationNumber"
              autoComplete="off"
              {...register("slmcRegistrationNumber")}
            />
          </Field>
          <Field
            label={`${t("forms.instituteName")} *`}
            htmlFor="instituteName"
            error={errors.instituteName?.message}
          >
            <Input id="instituteName" autoComplete="off" {...register("instituteName")} />
          </Field>
          <Field
            label={t("forms.instituteContact")}
            htmlFor="instituteContact"
            error={errors.instituteContact?.message}
          >
            <Input
              id="instituteContact"
              autoComplete="off"
              {...register("instituteContact")}
              placeholder={t("pages.admin.doctors.form.optionalPlaceholder")}
            />
          </Field>
          <Field
            label={`${t("forms.qualifications")} *`}
            htmlFor="qualifications"
            full
            error={errors.qualifications?.message}
          >
            <Textarea
              id="qualifications"
              rows={3}
              autoComplete="off"
              {...register("qualifications")}
              placeholder={t("pages.admin.doctors.form.qualificationsPlaceholder")}
            />
          </Field>
          <Field
            label={`${t("forms.practitionerAddress")} *`}
            htmlFor="practitionerAddress"
            full
            error={errors.practitionerAddress?.message}
          >
            <Textarea
              id="practitionerAddress"
              rows={3}
              autoComplete="off"
              {...register("practitionerAddress")}
            />
          </Field>
        </div>
      </Section>

      <Section
        Icon={Stamp}
        title={t("pages.admin.doctors.form.sections.rubberStamp")}
        hint={
          isCreate
            ? t("pages.admin.doctors.form.rubberStampHintCreate")
            : t("pages.admin.doctors.form.rubberStampHintUpdate")
        }
      >
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
        title={t("pages.admin.doctors.form.sections.defaultSignature")}
        hint={
          isCreate
            ? t("pages.admin.doctors.form.signatureHintCreate")
            : t("pages.admin.doctors.form.signatureHintUpdate")
        }
      >
        {/* Update mode: show "on file" state with replace / clear actions */}
        {!isCreate &&
          (() => {
            const hasOnFile = !!initial?.hasDefaultSignature;
            const showOnFile = hasOnFile && !clearSignature && !replacingSignature && !signature;
            if (showOnFile) {
              return (
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="flex-1">
                    <div className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-600">
                      {t("pages.admin.doctors.form.signatureOnFile")}
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {t("pages.admin.doctors.form.signatureOnFileDescription")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplacingSignature(true)}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    {t("pages.admin.doctors.form.replace")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setClearSignature(true)}
                    className="text-sm text-rose-600 hover:underline"
                  >
                    {t("pages.admin.doctors.form.remove")}
                  </button>
                </div>
              );
            }
            if (clearSignature) {
              return (
                <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="flex-1 text-sm text-rose-700">
                    {t("pages.admin.doctors.form.signatureWillRemove")}
                  </div>
                  <button
                    type="button"
                    onClick={() => setClearSignature(false)}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    {t("pages.admin.doctors.form.undo")}
                  </button>
                </div>
              );
            }
            // replacingSignature=true or no prior signature — show the input
            return (
              <div className="flex flex-col gap-2">
                <SignatureInput value={signature} onChange={setSignature} />
                {(replacingSignature || !hasOnFile) && signature === null && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingSignature(false);
                      setSignature(null);
                    }}
                    className="self-start text-xs text-[var(--muted-foreground)] hover:underline"
                  >
                    {hasOnFile
                      ? t("pages.admin.doctors.form.keepExisting")
                      : t("pages.admin.doctors.form.skip")}
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
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? t("common.saving") : submitLabel}
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
      <div className={`rounded-lg p-2 ${selected ? "bg-[var(--accent)]/15" : "bg-[var(--muted)]"}`}>
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
