"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { Activity, AlertCircle, ClipboardList, Pill, Plus, Stethoscope, X } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { DISEASE_OPTIONS, PHYSICAL_ACTIVITY_OPTIONS } from "@/lib/medical-codes";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";
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
  allergies: {
    type: AllergyEntry["type"] | "";
    name: string;
    medication: string;
    treatedWhere: string;
  }[];
  medications: { drug: string; dosage: string; frequency: string; notes: string }[];
  lifestyle: {
    smoking: "" | NonNullable<Lifestyle["smoking"]>;
    alcohol: "" | NonNullable<Lifestyle["alcohol"]>;
    betelAreca: "" | NonNullable<Lifestyle["betelAreca"]>;
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
      betelAreca: p?.lifestyle?.betelAreca ?? "",
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
    betelAreca: v.lifestyle.betelAreca || undefined,
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
  const { t } = useI18n();
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
        title={t("intake.diseaseHistory")}
        hint={t("intake.diseaseHistoryHint")}
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
            <h4 className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              {t("intake.otherConditions")}
            </h4>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {t("intake.otherConditionsHint")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => others.append({ text: "" })}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("intake.addOther")}
          </Button>
        </div>
        {others.fields.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-4 py-4 text-center text-sm text-[var(--muted-foreground)]">
            {t("intake.noOtherConditions")}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {others.fields.map((f, i) => (
              <div
                key={f.id}
                className="relative rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 py-3 pl-4 pr-12"
              >
                <Input
                  aria-label={t("intake.otherConditionAria", { n: i + 1 })}
                  placeholder={t("intake.otherConditionPlaceholder")}
                  {...register(`diseases.others.${i}.text` as const)}
                />
                <button
                  type="button"
                  aria-label={t("common.remove")}
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
        title={t("intake.surgicalHistory")}
        addLabel={t("intake.addSurgery")}
        empty={surgeries.fields.length === 0}
        onAdd={() => surgeries.append({ description: "" })}
      >
        {surgeries.fields.map((f, i) => (
          <RepeaterRow key={f.id} onRemove={() => surgeries.remove(i)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`s-${i}`}>{t("forms.description")}</Label>
              <Input
                id={`s-${i}`}
                {...register(`surgicalHistory.${i}.description` as const)}
                placeholder={t("intake.surgeryPlaceholder")}
              />
            </div>
          </RepeaterRow>
        ))}
      </RepeaterSection>

      {/* ── 3 · Allergies (repeater) ───────────────────────────────────── */}
      <RepeaterSection
        Icon={AlertCircle}
        title={t("intake.allergies")}
        addLabel={t("intake.addAllergy")}
        empty={allergies.fields.length === 0}
        onAdd={() =>
          allergies.append({
            type: "" as AllergyEntry["type"] | "",
            name: "",
            medication: "",
            treatedWhere: "",
          })
        }
      >
        {allergies.fields.map((f, i) => (
          <RepeaterRow key={f.id} onRemove={() => allergies.remove(i)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`a-${i}-type`}>{t("intake.allergyType.label")}</Label>
                <Select id={`a-${i}-type`} {...register(`allergies.${i}.type` as const)}>
                  <option value="">{t("intake.allergyType.select")}</option>
                  <option value="food">{t("intake.allergyType.food")}</option>
                  <option value="medication">{t("intake.allergyType.medication")}</option>
                  <option value="other">{t("intake.allergyType.other")}</option>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`a-${i}-name`}>{t("intake.allergen")}</Label>
                <Input id={`a-${i}-name`} {...register(`allergies.${i}.name` as const)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`a-${i}-med`}>{t("intake.reactionMedication")}</Label>
                <Input id={`a-${i}-med`} {...register(`allergies.${i}.medication` as const)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`a-${i}-tw`}>{t("intake.treatedWhere")}</Label>
                <Input id={`a-${i}-tw`} {...register(`allergies.${i}.treatedWhere` as const)} />
              </div>
            </div>
          </RepeaterRow>
        ))}
      </RepeaterSection>

      {/* ── 4 · Existing medications (repeater) ────────────────────────── */}
      <RepeaterSection
        Icon={Pill}
        title={t("intake.medications")}
        addLabel={t("intake.addMedication")}
        empty={meds.fields.length === 0}
        onAdd={() => meds.append({ drug: "", dosage: "", frequency: "", notes: "" })}
      >
        {meds.fields.map((f, i) => (
          <RepeaterRow key={f.id} onRemove={() => meds.remove(i)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`em-${i}-d`}>{t("intake.medDrug")}</Label>
                <Input id={`em-${i}-d`} {...register(`medications.${i}.drug` as const)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`em-${i}-do`}>{t("intake.medDosage")}</Label>
                <Input
                  id={`em-${i}-do`}
                  {...register(`medications.${i}.dosage` as const)}
                  placeholder={t("intake.medDosagePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`em-${i}-f`}>{t("intake.medFrequency")}</Label>
                <Input
                  id={`em-${i}-f`}
                  {...register(`medications.${i}.frequency` as const)}
                  placeholder={t("intake.medFrequencyPlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor={`em-${i}-n`}>{t("intake.medNotes")}</Label>
                <Textarea
                  id={`em-${i}-n`}
                  rows={2}
                  {...register(`medications.${i}.notes` as const)}
                />
              </div>
            </div>
          </RepeaterRow>
        ))}
      </RepeaterSection>

      {/* ── 5 · Lifestyle ──────────────────────────────────────────────── */}
      <Section Icon={Activity} title={t("intake.lifestyleTitle")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-smoking">{t("intake.smoking")}</Label>
            <Select id="ls-smoking" {...register("lifestyle.smoking")}>
              <option value="">{t("intake.smokingOptions.unspecified")}</option>
              <option value="never">{t("intake.smokingOptions.never")}</option>
              <option value="current">{t("intake.smokingOptions.current")}</option>
              <option value="prior">{t("intake.smokingOptions.prior")}</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-alcohol">{t("intake.alcohol")}</Label>
            <Select id="ls-alcohol" {...register("lifestyle.alcohol")}>
              <option value="">{t("intake.alcoholOptions.unspecified")}</option>
              <option value="none">{t("intake.alcoholOptions.none")}</option>
              <option value="occasional">{t("intake.alcoholOptions.occasional")}</option>
              <option value="regular">{t("intake.alcoholOptions.regular")}</option>
            </Select>
          </div>
          {/* One control for the quid as a whole — betel leaf and areca nut are
              chewed together far more often than separately, so the label names
              both rather than splitting them into two fields nobody fills in
              consistently. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-betel">{t("intake.betel")}</Label>
            <Select id="ls-betel" {...register("lifestyle.betelAreca")}>
              <option value="">{t("intake.betelOptions.unspecified")}</option>
              <option value="never">{t("intake.betelOptions.never")}</option>
              <option value="current">{t("intake.betelOptions.current")}</option>
              <option value="prior">{t("intake.betelOptions.prior")}</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-job">{t("intake.occupation")}</Label>
            <Input id="ls-job" {...register("lifestyle.occupation")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ls-pa">{t("intake.physicalActivity")}</Label>
            <Select id="ls-pa" {...register("lifestyle.physicalActivity")}>
              <option value="">{t("forms.notSpecified")}</option>
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
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? t("common.saving")
            : initial
              ? t("intake.saveProfile")
              : t("intake.createProfile")}
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
  const { t } = useI18n();
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
          {t("intake.noneAddedYet")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}

function RepeaterRow({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="relative rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-4 pr-12">
      <button
        type="button"
        aria-label={t("common.remove")}
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
