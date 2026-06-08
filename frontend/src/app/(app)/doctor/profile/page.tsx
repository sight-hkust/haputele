"use client";

import { useEffect, useState } from "react";
import { Loader2, PenLine, Save } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { PageHeader } from "@/components/primitives/page-header";
import { Textarea } from "@/components/primitives/select";
import { RubberStampUploader } from "@/components/admin/rubber-stamp-uploader";
import { SignatureInput } from "@/components/doctor/signature-input";
import {
  MY_SIGNATURE_URL,
  useCurrentDoctor,
  useUpdateMyProfile,
  type DoctorSelfUpdateRequest,
} from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";

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
  const { doctor, hasDefaultSignature, isLoading, error, refetch } = useCurrentDoctor();
  const update = useUpdateMyProfile();

  const [text, setText] = useState<EditableText>({
    contact: "",
    qualifications: "",
    practitionerAddress: "",
    instituteName: "",
    instituteContact: "",
  });
  // A freshly captured rubber stamp / signature to send. `undefined` = leave
  // the stored one untouched; for the signature, `clearSignature` removes it.
  const [stamp, setStamp] = useState<string | null>(null);
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
        Loading your profile…
      </div>
    );
  }

  if (error || !doctor) {
    return <ErrorBanner>{explainError((error as { error?: string })?.error ?? "", "Couldn't load your profile.")}</ErrorBanner>;
  }

  // The saved signature shows once it exists server-side and isn't being
  // cleared/replaced this session.
  const showSavedSignature = hasDefaultSignature && !clearSignature && !replacingSignature && !signature;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Doctor"
        title="My profile"
        subtitle="Update your practice details, rubber stamp, and saved e-signature."
        action={
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      {update.isError && (
        <ErrorBanner>{explainError(update.error?.error ?? "", "Couldn't save your changes.")}</ErrorBanner>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
          Profile saved.
        </div>
      )}

      {/* Read-only identity — changed by an admin only. */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Managed by your administrator. Contact them to change these.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ReadOnly label="Name" value={`${doctor.givenName} ${doctor.familyName}`} />
          <ReadOnly label="Email" value={doctor.email} />
          <ReadOnly label="SLMC registration number" value={doctor.slmcRegistrationNumber} />
          <ReadOnly label="Username" value={doctor.username} mono />
        </CardContent>
      </Card>

      {/* Editable practice profile. */}
      <Card>
        <CardHeader>
          <CardTitle>Practice details</CardTitle>
          <CardDescription>Reproduced on the prescription PDFs you sign.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldText label="Contact number" value={text.contact} onChange={setField("contact")} />
          <FieldText label="Institute name" value={text.instituteName} onChange={setField("instituteName")} />
          <FieldText
            label="Institute contact"
            value={text.instituteContact}
            onChange={setField("instituteContact")}
            placeholder="Optional"
          />
          <FieldArea label="Qualifications" value={text.qualifications} onChange={setField("qualifications")} />
          <FieldArea
            label="Practitioner address"
            value={text.practitionerAddress}
            onChange={setField("practitionerAddress")}
          />
        </CardContent>
      </Card>

      {/* Rubber stamp. */}
      <Card>
        <CardHeader>
          <CardTitle>Rubber stamp</CardTitle>
          <CardDescription>Replace only if you need to update the existing stamp.</CardDescription>
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
          <CardTitle>Default e-signature</CardTitle>
          <CardDescription>
            When set, it&rsquo;s applied automatically on every consultation — no need to sign each time. You can still
            draw a one-off signature per consultation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showSavedSignature ? (
            <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${MY_SIGNATURE_URL}?v=${sigVersion}`}
                  alt="Your saved e-signature"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-600">Signature on file</div>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Applied automatically when you finalise a consultation.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button type="button" variant="secondary" size="sm" onClick={() => setReplacingSignature(true)}>
                  <PenLine className="h-3.5 w-3.5" />
                  Replace
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
                  Clear
                </Button>
              </div>
            </div>
          ) : clearSignature ? (
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-4 text-sm">
              <span className="text-[var(--muted-foreground)]">Saved signature will be removed when you save.</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setClearSignature(false)}>
                Undo
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
      <div className={`rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-sm ${mono ? "font-mono" : ""}`}>
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
