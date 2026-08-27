"use client";

import { useEffect, useState } from "react";
import { Loader2, PenLine, Save } from "lucide-react";

import { Button } from "@/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { PageHeader } from "@/components/primitives/page-header";
import { Textarea } from "@/components/primitives/select";
import { RubberStampUploader } from "@/components/admin/rubber-stamp-uploader";
import { SignatureInput } from "@/components/doctor/signature-input";
import {
  MY_SIGNATURE_URL,
  MY_STAMP_URL,
  useCurrentDoctor,
  useUpdateMyProfile,
  type DoctorSelfUpdateRequest,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { useI18n } from "@/lib/i18n";

// Editable practice-profile fields a doctor controls themselves. Identity and
// credential fields (name, email, SLMC number) are admin-only and shown
// read-only below.
type EditableText = {
  contact: string;
  qualifications: string;
  practitionerAddress: string;
  instituteName: string;
  instituteContact: string;
};

export default function DoctorProfilePage() {
  const { t } = useI18n();
  const { doctor, hasDefaultSignature, isLoading, error, refetch } = useCurrentDoctor();
  const update = useUpdateMyProfile();

  const [text, setText] = useState<EditableText>({
    contact: "",
    qualifications: "",
    practitionerAddress: "",
    instituteName: "",
    instituteContact: "",
  });
  // Seed the uploader with the existing stamp streamed from the server; it's
  // only resent when the doctor actually replaces it (stampDirty). Once
  // replaced, `stamp` holds the new data URL instead of the URL.
  const [stamp, setStamp] = useState<string | null>(MY_STAMP_URL);
  const [stampDirty, setStampDirty] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [clearSignature, setClearSignature] = useState(false);
  const [replacingSignature, setReplacingSignature] = useState(false);
  // Cache-buster so the <img> reloads after a replace/clear round-trips.
  const [sigVersion, setSigVersion] = useState(0);
  const [saved, setSaved] = useState(false);

  // Hydrate the editable fields once the profile lands.
  useEffect(() => {
    if (doctor) {
      setText({
        contact: doctor.contact ?? "",
        qualifications: doctor.qualifications ?? "",
        practitionerAddress: doctor.practitionerAddress ?? "",
        instituteName: doctor.instituteName ?? "",
        instituteContact: doctor.instituteContact ?? "",
      });
    }
  }, [doctor]);

  const setField = (key: keyof EditableText) => (e: { target: { value: string } }) => {
    setText((t) => ({ ...t, [key]: e.target.value }));
    setSaved(false);
  };

  const onSave = () => {
    setSaved(false);
    const body: DoctorSelfUpdateRequest = {
      contact: text.contact.trim(),
      qualifications: text.qualifications.trim(),
      practitionerAddress: text.practitionerAddress.trim(),
      instituteName: text.instituteName.trim(),
      instituteContact: text.instituteContact.trim(),
    };
    if (stampDirty && stamp) body.rubberStampImage = stamp;
    if (clearSignature) body.clearDefaultSignature = true;
    else if (signature) body.defaultSignatureImage = signature;

    update.mutate(body, {
      onSuccess: () => {
        setSaved(true);
        setSignature(null);
        setClearSignature(false);
        setReplacingSignature(false);
        setStampDirty(false);
        setSigVersion((v) => v + 1);
        refetch();
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("pages.doctor.profile.loading")}
      </div>
    );
  }

  if (error || !doctor) {
    return (
      <ErrorBanner>
        {explainError((error as { error?: string })?.error ?? "", t("pages.doctor.profile.loadFailed"))}
      </ErrorBanner>
    );
  }

  // The saved signature shows once it exists server-side and isn't being
  // cleared/replaced this session.
  const showSavedSignature =
    hasDefaultSignature && !clearSignature && !replacingSignature && !signature;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label={t("pages.doctor.profile.label")}
        title={t("pages.doctor.profile.title")}
        subtitle={t("pages.doctor.profile.subtitle")}
        action={
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {update.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
        }
      />

      {update.isError && (
        <ErrorBanner>
          {explainError(update.error?.error ?? "", t("pages.doctor.profile.saveFailed"))}
        </ErrorBanner>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
          {t("pages.doctor.profile.saved")}
        </div>
      )}

      {/* Read-only identity — changed by an admin only. */}
      <Card>
        <CardHeader>
          <CardTitle>{t("pages.doctor.profile.identityTitle")}</CardTitle>
          <CardDescription>
            {t("pages.doctor.profile.identityDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ReadOnly label={t("common.name")} value={`${doctor.givenName} ${doctor.familyName}`} />
          <ReadOnly label={t("common.email")} value={doctor.email} />
          <ReadOnly label={t("forms.slmcRegistrationNumber")} value={doctor.slmcRegistrationNumber} />
          <ReadOnly label={t("forms.username")} value={doctor.username} mono />
        </CardContent>
      </Card>

      {/* Editable practice profile. */}
      <Card>
        <CardHeader>
          <CardTitle>{t("pages.doctor.profile.practiceTitle")}</CardTitle>
          <CardDescription>{t("pages.doctor.profile.practiceDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldText label={t("forms.contactNumber")} value={text.contact} onChange={setField("contact")} />
          <FieldText
            label={t("forms.instituteName")}
            value={text.instituteName}
            onChange={setField("instituteName")}
          />
          <FieldText
            label={t("forms.instituteContact")}
            value={text.instituteContact}
            onChange={setField("instituteContact")}
            placeholder={t("common.optional")}
          />
          <FieldArea
            label={t("forms.qualifications")}
            value={text.qualifications}
            onChange={setField("qualifications")}
          />
          <FieldArea
            label={t("forms.practitionerAddress")}
            value={text.practitionerAddress}
            onChange={setField("practitionerAddress")}
          />
        </CardContent>
      </Card>

      {/* Rubber stamp. */}
      <Card>
        <CardHeader>
          <CardTitle>{t("pages.doctor.profile.rubberStampTitle")}</CardTitle>
          <CardDescription>{t("pages.doctor.profile.rubberStampDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RubberStampUploader
            value={stamp}
            onChange={(next) => {
              setStamp(next);
              setStampDirty(true);
              setSaved(false);
            }}
            enableQrCapture
          />
        </CardContent>
      </Card>

      {/* Saved e-signature. */}
      <Card>
        <CardHeader>
          <CardTitle>{t("pages.doctor.profile.signatureTitle")}</CardTitle>
          <CardDescription>
            {t("pages.doctor.profile.signatureDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showSavedSignature ? (
            <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                <img
                  src={`${MY_SIGNATURE_URL}?v=${sigVersion}`}
                  alt={t("pages.doctor.profile.signatureAlt")}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex-1">
                <div className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-600">
                  {t("pages.doctor.profile.signatureOnFile")}
                </div>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {t("pages.doctor.profile.signatureAppliedHint")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setReplacingSignature(true)}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  {t("common.replace")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setClearSignature(true);
                    setSignature(null);
                    setSaved(false);
                  }}
                >
                  {t("common.clear")}
                </Button>
              </div>
            </div>
          ) : clearSignature ? (
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-4 text-sm">
              <span className="text-[var(--muted-foreground)]">
                {t("pages.doctor.profile.signatureWillRemove")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setClearSignature(false)}
              >
                {t("common.undo")}
              </Button>
            </div>
          ) : (
            <SignatureInput
              value={signature}
              onChange={(next) => {
                setSignature(next);
                setSaved(false);
                if (!next) setReplacingSignature(false);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnly({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div
        className={`rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-sm ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Input value={value} onChange={onChange} autoComplete="off" placeholder={placeholder} />
    </div>
  );
}

function FieldArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <Label>{label}</Label>
      <Textarea rows={3} value={value} onChange={onChange} autoComplete="off" />
    </div>
  );
}
