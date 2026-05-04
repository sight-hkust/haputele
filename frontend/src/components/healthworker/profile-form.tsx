"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { Activity, AlertCircle, ClipboardList, Pill, Plus, Stethoscope, X } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { DISEASE_OPTIONS, PHYSICAL_ACTIVITY_OPTIONS } from "@/lib/medical-codes";
import { cn } from "@/lib/cn";
import type {
  AllergyEntry,
  DiseaseCode,
  DiseaseEntry,
  ExistingMedicationEntry,
  Lifestyle,
  Profile,
  ProfileRequest,
  SurgeryEntry,
} from "@/types/api";

// "Other" is rendered as a separate always-visible repeater rather than a 9th
// checkbox + single text field — patients may have multiple unlisted conditions,
// and the API already accepts multiple `{code: "other", text}` rows.
const NAMED_DISEASE_OPTIONS = DISEASE_OPTIONS.filter((o) => o.code !== "other");
type NamedDiseaseCode = Exclude<DiseaseCode, "other">;

// The form value model differs slightly from the API model:
// * Named diseases are checkboxes; "other" entries live in a sibling repeater.
// * Lifestyle enums use empty string ("") for "not specified" so native <select>
//   can hold the value cleanly; we omit empty values on submit.
type FormShape = {
  diseases: {
    selected: Record<NamedDiseaseCode, boolean>;
    others: { text: string }[];
  };
  surgicalHistory: { description: string }[];
  allergies: { type: AllergyEntry["type"] | ""; name: string; medication: string; treatedWhere: string }[];
  medications: { drug: string; dosage: string; frequency: string; notes: string }[];
  lifestyle: {
    smoking: "" | NonNullable<Lifestyle["smoking"]>;
    alcohol: "" | NonNullable<Lifestyle["alcohol"]>;
    occupation: string;
    physicalActivity: string;
  };
};

function fromProfile(p: Profile | null): FormShape {
  const selected = {} as Record<NamedDiseaseCode, boolean>;
  for (const opt of NAMED_DISEASE_OPTIONS) selected[opt.code as NamedDiseaseCode] = false;
  const others: { text: string }[] = [];
  for (const d of p?.diseaseHistory ?? []) {
    if (d.code === "other") {
      if (d.text) others.push({ text: d.text });
    } else {
      selected[d.code as NamedDiseaseCode] = true;
    }
  }
  return {
    diseases: { selected, others },
    surgicalHistory: p?.surgicalHistory.map((s) => ({ description: s.description })) ?? [],
    allergies:
      p?.allergies.map((a) => ({
        type: a.type,
        name: a.name,
        medication: a.medication ?? "",
        treatedWhere: a.treatedWhere ?? "",
      })) ?? [],
    medications:
      p?.medications.map((m) => ({
        drug: m.drug,
        dosage: m.dosage ?? "",
        frequency: m.frequency ?? "",
        notes: m.notes ?? "",
      })) ?? [],
    lifestyle: {
      smoking: p?.lifestyle?.smoking ?? "",
      alcohol: p?.lifestyle?.alcohol ?? "",
      occupation: p?.lifestyle?.occupation ?? "",
      physicalActivity: p?.lifestyle?.physicalActivity ?? "",
    },
  };
}

function toRequest(v: FormShape): ProfileRequest {
  const diseaseHistory: DiseaseEntry[] = [];
  for (const opt of NAMED_DISEASE_OPTIONS) {
    if (v.diseases.selected[opt.code as NamedDiseaseCode]) {
      diseaseHistory.push({ code: opt.code });
    }
  }
  for (const o of v.diseases.others) {
    const t = o.text.trim();
    if (t) diseaseHistory.push({ code: "other", text: t });
  }
  const surgicalHistory: SurgeryEntry[] = v.surgicalHistory
    .map((s) => ({ description: s.description.trim() }))
    .filter((s) => s.description);
  const allergies = v.allergies
    .filter((a) => a.type && a.name.trim())
    .map((a) => ({
      type: a.type as AllergyEntry["type"],
      name: a.name.trim(),
      medication: a.medication.trim() || undefined,
      treatedWhere: a.treatedWhere.trim() || undefined,
    }));
  const medications: ExistingMedicationEntry[] = v.medications
    .filter((m) => m.drug.trim())
    .map((m) => ({
      drug: m.drug.trim(),
      dosage: m.dosage.trim() || undefined,
      frequency: m.frequency.trim() || undefined,
      notes: m.notes.trim() || undefined,
    }));
  const lifestyle: Partial<Lifestyle> = {
    smoking: v.lifestyle.smoking || undefined,
    alcohol: v.lifestyle.alcohol || undefined,
    occupation: v.lifestyle.occupation.trim() || undefined,
    physicalActivity: v.lifestyle.physicalActivity.trim() || undefined,
  };
  return { diseaseHistory, surgicalHistory, allergies, medications, lifestyle };
}

export function ProfileForm({
  initial,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: {
  initial: Profile | null;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (req: ProfileRequest) => void;
  onCancel?: () => void;
}) {
  const form = useForm<FormShape>({
    defaultValues: fromProfile(initial),
  });
  const { register, handleSubmit, control } = form;

  const surgeries = useFieldArray({ control, name: "surgicalHistory" });
  const allergies = useFieldArray({ control, name: "allergies" });
  const meds = useFieldArray({ control, name: "medications" });
  const others = useFieldArray({ control, name: "diseases.others" });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toRequest(v)))} className="flex flex-col gap-12">
      {errorMessage && <ErrorBanner>{errorMessage}</ErrorBanner>}

      {/* ── 1 · Disease history — checkboxes for the named codes ──────── */}
      <Section
        Icon={ClipboardList}
        title="Disease history"
        hint="Tick everything that applies. Use the “Other conditions” section below for anything not listed — add as many as you need."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {NAMED_DISEASE_OPTIONS.map((opt) => (
            <CheckboxRow key={opt.code} htmlFor={`disease-${opt.code}`} label={opt.label}>
              <input
                id={`disease-${opt.code}`}
                type="checkbox"
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                {...register(`diseases.selected.${opt.code as NamedDiseaseCode}` as const)}
              />
            </CheckboxRow>
          ))}
        </div>

        {/* Other conditions — repeater so multiple unlisted conditions can be captured. */}
        <div className="mt-6 flex items-end justify-between">
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              Other conditions
            </h4>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Anything not on the list. Add one row per condition.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => others.append({ text: "" })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add other
          </Button>
        </div>
        {others.fields.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-4 text-center text-sm text-[var(--muted-foreground)]">
            No other conditions.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {others.fields.map((f, i) => (
              <div
                key={f.id}
                className="relative rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 py-3 pl-4 pr-12"
              >
                <Input
                  aria-label={`Other condition ${i + 1}`}
                  placeholder="e.g. Crohn disease"
                  {...register(`diseases.others.${i}.text` as const)}
                />
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => others.remove(i)}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-rose-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── 2 · Surgical history (repeater) ────────────────────────────── */}
      <RepeaterSection
        Icon={Stethoscope}
        title="Surgical history"
        addLabel="Add surgery"
        empty={surgeries.fields.length === 0}
        onAdd={() => surgeries.append({ description: "" })}
      >
        {surgeries.fields.map((f, i) => (
          <RepeaterRow key={f.id} onRemove={() => surgeries.remove(i)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`s-${i}`}>Description</Label>
              <Input id={`s-${i}`} {...register(`surgicalHistory.${i}.description` as const)} placeholder="e.g. Appendectomy, 2018" />
            </div>
          </RepeaterRow>
        ))}
      </RepeaterSection>

      {/* ── 3 · Allergies (repeater) ───────────────────────────────────── */}
      <RepeaterSection
        Icon={AlertCircle}
        title="Allergies"
        addLabel="Add allergy"
        empty={allergies.fields.length === 0}
        onAdd={() =>
          allergies.append({ type: "" as AllergyEntry["type"] | "", name: "", medication: "", treatedWhere: "" })
        }
      >
        {allergies.fields.map((f, i) => (
          <RepeaterRow key={f.id} onRemove={() => allergies.remove(i)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`a-${i}-type`}>Type</Label>
                <Select id={`a-${i}-type`} {...register(`allergies.${i}.type` as const)}>
                  <option value="">Select…</option>
                  <option value="food">Food</option>
                  <option value="medication">Medication</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`a-${i}-name`}>Allergen</Label>
                <Input id={`a-${i}-name`} {...register(`allergies.${i}.name` as const)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`a-${i}-med`}>Reaction medication (if any)</Label>
                <Input id={`a-${i}-med`} {...register(`allergies.${i}.medication` as const)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`a-${i}-tw`}>Treated where</Label>
                <Input id={`a-${i}-tw`} {...register(`allergies.${i}.treatedWhere` as const)} />
              </div>
            </div>
          </RepeaterRow>
        ))}
      </RepeaterSection>

      {/* ── 4 · Existing medications (repeater) ────────────────────────── */}
      <RepeaterSection
        Icon={Pill}
        title="Existing medications"
        addLabel="Add medication"
        empty={meds.fields.length === 0}
        onAdd={() => meds.append({ drug: "", dosage: "", frequency: "", notes: "" })}
      >
        {meds.fields.map((f, i) => (
          <RepeaterRow key={f.id} onRemove={() => meds.remove(i)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`em-${i}-d`}>Drug</Label>
                <Input id={`em-${i}-d`} {...register(`medications.${i}.drug` as const)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`em-${i}-do`}>Dosage</Label>
                <Input id={`em-${i}-do`} {...register(`medications.${i}.dosage` as const)} placeholder="e.g. 5 mg" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`em-${i}-f`}>Frequency</Label>
                <Input id={`em-${i}-f`} {...register(`medications.${i}.frequency` as const)} placeholder="e.g. once daily" />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor={`em-${i}-n`}>Notes</Label>
                <Textarea id={`em-${i}-n`} rows={2} {...register(`medications.${i}.notes` as const)} />
              </div>
            </div>
          </RepeaterRow>
        ))}
      </RepeaterSection>

      {/* ── 5 · Lifestyle ──────────────────────────────────────────────── */}
      <Section Icon={Activity} title="Lifestyle & social history">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-smoking">Smoking</Label>
            <Select id="ls-smoking" {...register("lifestyle.smoking")}>
              <option value="">Not specified</option>
              <option value="never">Never</option>
              <option value="current">Currently smokes</option>
              <option value="prior">Prior smoker</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-alcohol">Alcohol</Label>
            <Select id="ls-alcohol" {...register("lifestyle.alcohol")}>
              <option value="">Not specified</option>
              <option value="none">None</option>
              <option value="occasional">Occasional</option>
              <option value="regular">Regular</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-job">Occupation</Label>
            <Input id="ls-job" {...register("lifestyle.occupation")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-pa">Physical activity</Label>
            <Select id="ls-pa" {...register("lifestyle.physicalActivity")}>
              <option value="">Not specified</option>
              {PHYSICAL_ACTIVITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-4 shadow-lg backdrop-blur">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : initial ? "Save profile" : "Create profile"}
        </Button>
      </div>
    </form>
  );
}

// ── Building blocks ──────────────────────────────────────────────────
function Section({
  Icon,
  title,
  hint,
  children,
}: {
  Icon: typeof ClipboardList;
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

function RepeaterSection({
  Icon,
  title,
  addLabel,
  onAdd,
  empty,
  children,
}: {
  Icon: typeof ClipboardList;
  title: string;
  addLabel: string;
  onAdd: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--accent)]/10 p-2">
            <Icon className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <h3 className="font-display text-xl tracking-[-0.01em]">{title}</h3>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>
      {empty ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
          None added yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}

function RepeaterRow({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="relative rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-4 pr-12">
      <button
        type="button"
        aria-label="Remove"
        onClick={onRemove}
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-rose-600"
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

function CheckboxRow({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm transition-colors",
        "hover:border-[var(--accent)]/30 hover:bg-[var(--muted)]/40",
      )}
    >
      {children}
      <span>{label}</span>
    </label>
  );
}
