"use client";

import { useState } from "react";
import { Activity, Camera, ClipboardList, HeartPulse, MessageSquare, Pill } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { ImagePreviewModal } from "@/components/primitives/image-preview-modal";
import { ageFromDob, fmtDate } from "@/lib/format";
import { diseaseLabel } from "@/lib/medical-codes";
import { useAttachmentImage } from "@/lib/use-api";
import type { AttachmentMeta, Patient, Preconsult, Profile } from "@/types/api";

// Read-only patient context for the doctor — mirrors what they'd want at a
// glance during the consultation: who, what they came in for, vitals, photos
// the HW captured, and notable history. Designed as a "sticky" sidebar
// companion to the consultation flow.
export function PatientSummary({
  patient,
  preconsult,
  profile,
  attachments,
  appointmentId,
}: {
  patient: Patient;
  preconsult: Preconsult | null;
  profile: Profile | null;
  attachments: AttachmentMeta[];
  appointmentId: number;
}) {
  const age = ageFromDob(patient.dob);
  const complaint = preconsult?.primaryComplaint?.trim();

  return (
    <div className="flex flex-col gap-4">
      <Card variant="elevated" className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--accent)]">
            Patient
          </span>
        </div>
        <h2 className="font-display text-2xl tracking-[-0.01em]">
          {patient.given} {patient.family}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {[
            patient.gender,
            age !== null ? `${age} yrs` : null,
            patient.dob ? `DOB ${fmtDate(patient.dob)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {patient.nationalId && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            NID · {patient.nationalId}
          </p>
        )}
      </Card>

      {/* FEEDBACK §2: surface the HW's note about why the patient is here so
          the doctor reads it before joining the call. Elevated card, top of
          the column, distinct from vitals. */}
      <Card variant="elevated" className="border-[var(--accent)]/30 bg-[var(--accent)]/[0.04] p-6">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--accent)]">
            Primary complaint
          </span>
        </div>
        {complaint ? (
          <p className="whitespace-pre-line text-base font-medium leading-relaxed tracking-[-0.005em]">
            {complaint}
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">No complaint captured.</p>
        )}
      </Card>

      {attachments.length > 0 && (
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4 text-[var(--accent)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--accent)]">
              Photos · {attachments.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((a) => (
              <DoctorAttachmentThumb
                key={a.id}
                attachment={a}
                appointmentId={appointmentId}
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--accent)]">
            Preconsult vitals
          </span>
        </div>
        {preconsult ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Vital label="Height" value={preconsult.height ? `${preconsult.height} cm` : "—"} />
            <Vital label="Weight" value={preconsult.weight ? `${preconsult.weight} kg` : "—"} />
            <Vital
              label="Blood pressure"
              value={
                preconsult.sysBp && preconsult.diaBp
                  ? `${preconsult.sysBp}/${preconsult.diaBp}`
                  : "—"
              }
              unit={preconsult.sysBp ? "mmHg" : undefined}
            />
            <Vital label="Pulse" value={preconsult.pulse ? `${preconsult.pulse}` : "—"} unit="bpm" />
            <Vital
              label="Temperature"
              value={preconsult.temperature != null ? Number(preconsult.temperature).toFixed(1) : "—"}
              unit={preconsult.temperature != null ? "°C" : undefined}
            />
          </dl>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">No vitals captured.</p>
        )}
      </Card>

      {profile && (
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--accent)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--accent)]">
              History at a glance
            </span>
          </div>
          <ProfileFacts profile={profile} />
        </Card>
      )}
    </div>
  );
}

function DoctorAttachmentThumb({
  attachment,
  appointmentId,
}: {
  attachment: AttachmentMeta;
  appointmentId: number;
}) {
  const { url, error } = useAttachmentImage(appointmentId, attachment.id);
  const [preview, setPreview] = useState(false);
  return (
    <div className="aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]/40">
      {url ? (
        <>
          <button
            type="button"
            onClick={() => setPreview(true)}
            title={attachment.caption || attachment.filename}
            className="block h-full w-full cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={attachment.caption || attachment.filename}
              className="h-full w-full object-cover transition-transform hover:scale-[1.02]"
            />
          </button>
          <ImagePreviewModal
            open={preview}
            onClose={() => setPreview(false)}
            src={url}
            alt={attachment.caption || attachment.filename}
            caption={attachment.caption}
          />
        </>
      ) : error ? (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-rose-600">
          Load failed
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted-foreground)]">
          …
        </div>
      )}
    </div>
  );
}

function Vital({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold tracking-[-0.01em]">
        {value}
        {unit && <span className="ml-1 font-normal text-[var(--muted-foreground)]">{unit}</span>}
      </dd>
    </div>
  );
}

function ProfileFacts({ profile }: { profile: Profile }) {
  const sections: { title: string; items: string[] }[] = [];
  if (profile.diseaseHistory.length) {
    sections.push({
      title: "Conditions",
      items: profile.diseaseHistory.map((d) =>
        d.code === "other" && d.text ? d.text : diseaseLabel(d.code),
      ),
    });
  }
  if (profile.allergies.length) {
    sections.push({
      title: "Allergies",
      items: profile.allergies.map((a) => `${a.name} (${a.type})`),
    });
  }
  if (profile.medications.length) {
    sections.push({
      title: "Existing meds",
      items: profile.medications.map((m) =>
        [m.drug, m.dosage].filter(Boolean).join(" · "),
      ),
    });
  }
  if (profile.surgicalHistory.length) {
    sections.push({
      title: "Surgical history",
      items: profile.surgicalHistory.map((s) => s.description),
    });
  }
  const lifestyle: string[] = [];
  if (profile.lifestyle.smoking) lifestyle.push(`Smoking · ${profile.lifestyle.smoking}`);
  if (profile.lifestyle.alcohol) lifestyle.push(`Alcohol · ${profile.lifestyle.alcohol}`);
  if (profile.lifestyle.occupation) lifestyle.push(`Job · ${profile.lifestyle.occupation}`);
  if (lifestyle.length) sections.push({ title: "Lifestyle", items: lifestyle });

  if (!sections.length) {
    return <p className="text-sm text-[var(--muted-foreground)]">No profile entries yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((s) => (
        <div key={s.title}>
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            {s.title}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {s.items.map((it, i) => (
              <li
                key={i}
                className="rounded-md bg-[var(--muted)]/60 px-2 py-1 text-xs text-[var(--foreground)]"
              >
                {it}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Compact icon for use elsewhere — e.g. doctor's appointment detail header.
export const PatientSummaryIcons = { Pill };
