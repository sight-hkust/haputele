import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { displayDob } from "@/lib/dob-date";
import { fmtAge } from "@/lib/format";
import type { Patient, Profile } from "@/types/api";

export function PatientSafetyStrip({
  patient,
  profile,
}: {
  patient: Patient | null;
  profile: Profile | null;
}) {
  const allergies = profile?.allergies ?? [];

  return (
    <Card className="min-w-0 p-4" aria-label="Patient identity and allergy safety">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold tracking-[-0.01em]">
            {patient ? `${patient.given} ${patient.family}` : "Patient identity unavailable"}
          </h2>
          <p className="mt-1 break-words text-sm text-[var(--muted-foreground)]">
            {patient
              ? [
                  `DOB ${displayDob(patient.dob) || "not recorded"}`,
                  fmtAge(patient.dob),
                  `Patient #${patient.id}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Confirm the patient's identity before proceeding."}
          </p>
          {patient && (
            <p className="mt-1 break-words text-sm text-[var(--muted-foreground)]">
              National ID: {patient.nationalId || "not recorded"}
            </p>
          )}
        </div>
        <div className="min-w-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:max-w-[50%]">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Allergies
          </p>
          {allergies.length > 0 ? (
            <ul className="mt-1 flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
              {allergies.map((allergy, index) => (
                <li key={`${allergy.name}-${index}`} className="min-w-0 max-w-full break-words">
                  {allergy.name} ({allergy.type})
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">Not recorded — confirm with the patient before prescribing.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
