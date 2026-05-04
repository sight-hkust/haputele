"use client";

import Link from "next/link";
import { Activity, AlertCircle, ClipboardList, Pencil, Pill, Stethoscope } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { diseaseLabel, physicalActivityLabel } from "@/lib/medical-codes";
import { fmtRelative } from "@/lib/format";
import type { Profile } from "@/types/api";

// Read-only profile summary used on the patient detail page. Empty profiles
// get a CTA to create one — that's where the §"intake form" branches in.
export function ProfileSummary({ profile, editHref }: { profile: Profile | null; editHref: string }) {
  if (!profile || isEmpty(profile)) {
    return (
      <Card className="p-8">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">
            Patient profile
          </span>
        </div>
        <h3 className="font-display text-xl tracking-[-0.01em]">No intake form yet</h3>
        <p className="mt-1.5 max-w-md text-sm text-[var(--muted-foreground)]">
          Capture disease history, allergies, surgeries, existing meds, and lifestyle so the doctor has full context during the consultation.
        </p>
        <Link href={editHref} className="mt-5 inline-block">
          <Button>
            <Pencil className="h-4 w-4" />
            Capture profile
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">
            Patient profile
          </span>
        </div>
        <Link href={editHref}>
          <Button variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </Link>
      </div>

      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {profile.diseaseHistory.length > 0 && (
          <Block Icon={ClipboardList} title="Conditions">
            <Chips
              items={profile.diseaseHistory.map((d) =>
                d.code === "other" && d.text ? d.text : diseaseLabel(d.code),
              )}
            />
          </Block>
        )}
        {profile.allergies.length > 0 && (
          <Block Icon={AlertCircle} title="Allergies">
            <Chips items={profile.allergies.map((a) => `${a.name} (${a.type})`)} />
          </Block>
        )}
        {profile.medications.length > 0 && (
          <Block Icon={Pill} title="Existing meds">
            <ul className="flex flex-col gap-1.5 text-sm">
              {profile.medications.map((m, i) => (
                <li key={i}>
                  <span className="font-medium">{m.drug}</span>
                  {(m.dosage || m.frequency) && (
                    <span className="ml-2 text-[var(--muted-foreground)]">
                      {[m.dosage, m.frequency].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Block>
        )}
        {profile.surgicalHistory.length > 0 && (
          <Block Icon={Stethoscope} title="Surgical history">
            <ul className="flex flex-col gap-1.5 text-sm">
              {profile.surgicalHistory.map((s, i) => (
                <li key={i}>{s.description}</li>
              ))}
            </ul>
          </Block>
        )}
        {hasLifestyle(profile) && (
          <Block Icon={Activity} title="Lifestyle">
            <ul className="flex flex-col gap-1 text-sm text-[var(--muted-foreground)]">
              {profile.lifestyle.smoking && <li>Smoking · {profile.lifestyle.smoking}</li>}
              {profile.lifestyle.alcohol && <li>Alcohol · {profile.lifestyle.alcohol}</li>}
              {profile.lifestyle.occupation && <li>Job · {profile.lifestyle.occupation}</li>}
              {profile.lifestyle.physicalActivity && (
                <li>Activity · {physicalActivityLabel(profile.lifestyle.physicalActivity)}</li>
              )}
            </ul>
          </Block>
        )}
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        Updated {fmtRelative(profile.updatedAt)}
      </p>
    </Card>
  );
}

function Block({
  Icon,
  title,
  children,
}: {
  Icon: typeof ClipboardList;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <li
          key={i}
          className="rounded-md bg-[var(--muted)]/60 px-2 py-1 text-xs text-[var(--foreground)]"
        >
          {it}
        </li>
      ))}
    </ul>
  );
}

function isEmpty(p: Profile): boolean {
  return (
    p.diseaseHistory.length === 0 &&
    p.surgicalHistory.length === 0 &&
    p.allergies.length === 0 &&
    p.medications.length === 0 &&
    !hasLifestyle(p)
  );
}

function hasLifestyle(p: Profile): boolean {
  return !!(
    p.lifestyle?.smoking ||
    p.lifestyle?.alcohol ||
    p.lifestyle?.occupation ||
    p.lifestyle?.physicalActivity
  );
}
