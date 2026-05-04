"use client";

import { Plus, X } from "lucide-react";
import {
  useFieldArray,
  type Control,
  type UseFormRegister,
  type UseFormWatch,
} from "react-hook-form";

import { Button } from "@/components/primitives/button";
import { Input, Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { DIAGNOSIS_OPTIONS } from "@/lib/medical-codes";

// All editors operate on a single shared form schema (see consultation-flow).
// Names are typed loosely to keep this file portable; the parent form has
// strict typing via zod.
export type ConsultationFormShape = {
  notes: { complaint: string; onset: string; symptoms: string; observations: string };
  diagnoses: { code: string; text?: string }[];
  medications: {
    genericName: string;
    tradeName?: string;
    dose?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }[];
  labs: { testName?: string; instructions?: string }[];
  referrals: { specialistOrDepartment?: string; instructions?: string }[];
};

// ── Notes ────────────────────────────────────────────────────────────
export function NotesEditor({ register }: { register: UseFormRegister<ConsultationFormShape> }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Primary complaint" htmlFor="complaint" full>
        <Textarea id="complaint" rows={3} {...register("notes.complaint")} />
      </Field>
      <Field label="Onset & duration" htmlFor="onset">
        <Textarea id="onset" rows={3} {...register("notes.onset")} />
      </Field>
      <Field label="Associated symptoms" htmlFor="symptoms">
        <Textarea id="symptoms" rows={3} {...register("notes.symptoms")} />
      </Field>
      <Field label="Observations (video / self-report)" htmlFor="observations" full>
        <Textarea id="observations" rows={3} {...register("notes.observations")} />
      </Field>
    </div>
  );
}

// ── Diagnoses ────────────────────────────────────────────────────────
export function DiagnosesEditor({
  control,
  register,
  watch,
}: {
  control: Control<ConsultationFormShape>;
  register: UseFormRegister<ConsultationFormShape>;
  watch: UseFormWatch<ConsultationFormShape>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "diagnoses" });
  const values = watch("diagnoses") ?? [];

  return (
    <Repeater
      title="Diagnoses"
      hint="Pick from common conditions or use “Other (specify)” to free-text."
      onAdd={() => append({ code: "", text: "" })}
      addLabel="Add diagnosis"
      empty={fields.length === 0}
    >
      {fields.map((field, i) => {
        const requiresText = values[i]?.code === "others";
        return (
          <RepeaterRow key={field.id} onRemove={() => remove(i)}>
            <div className={requiresText ? "grid gap-3 sm:grid-cols-2" : ""}>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`dx-${i}-code`}>Diagnosis</Label>
                <Select id={`dx-${i}-code`} {...register(`diagnoses.${i}.code`)}>
                  <option value="">Select…</option>
                  {DIAGNOSIS_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              {requiresText && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`dx-${i}-text`}>Specify</Label>
                  <Input
                    id={`dx-${i}-text`}
                    {...register(`diagnoses.${i}.text`)}
                    placeholder="Required when “Other”"
                  />
                </div>
              )}
            </div>
          </RepeaterRow>
        );
      })}
    </Repeater>
  );
}

// ── Medications ──────────────────────────────────────────────────────
// Per §1.7, generic name is mandatory. We render it as required and let zod
// catch missing values at the submit boundary.
export function MedicationsEditor({
  control,
  register,
}: {
  control: Control<ConsultationFormShape>;
  register: UseFormRegister<ConsultationFormShape>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "medications" });
  return (
    <Repeater
      title="Prescription"
      hint="Generic name is mandatory (§1.7). Trade name appears as supplementary text on the printed Rx."
      onAdd={() =>
        append({
          genericName: "",
          tradeName: "",
          dose: "",
          frequency: "",
          duration: "",
          instructions: "",
        })
      }
      addLabel="Add medication"
      empty={fields.length === 0}
    >
      {fields.map((field, i) => (
        <RepeaterRow key={field.id} onRemove={() => remove(i)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Generic name *" htmlFor={`m-${i}-g`} full>
              <Input
                id={`m-${i}-g`}
                {...register(`medications.${i}.genericName` as const)}
                aria-invalid={false}
              />
            </Field>
            <Field label="Trade name" htmlFor={`m-${i}-t`}>
              <Input id={`m-${i}-t`} {...register(`medications.${i}.tradeName` as const)} />
            </Field>
            <Field label="Dose" htmlFor={`m-${i}-d`}>
              <Input id={`m-${i}-d`} {...register(`medications.${i}.dose` as const)} placeholder="e.g. 500 mg" />
            </Field>
            <Field label="Frequency" htmlFor={`m-${i}-f`}>
              <Input
                id={`m-${i}-f`}
                {...register(`medications.${i}.frequency` as const)}
                placeholder="e.g. twice daily"
              />
            </Field>
            <Field label="Duration" htmlFor={`m-${i}-du`}>
              <Input
                id={`m-${i}-du`}
                {...register(`medications.${i}.duration` as const)}
                placeholder="e.g. 7 days"
              />
            </Field>
            <Field label="Instructions / notes" htmlFor={`m-${i}-i`} full>
              <Textarea
                id={`m-${i}-i`}
                rows={2}
                {...register(`medications.${i}.instructions` as const)}
              />
            </Field>
          </div>
        </RepeaterRow>
      ))}
    </Repeater>
  );
}

// ── Labs ─────────────────────────────────────────────────────────────
export function LabsEditor({
  control,
  register,
}: {
  control: Control<ConsultationFormShape>;
  register: UseFormRegister<ConsultationFormShape>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "labs" });
  return (
    <Repeater
      title="Laboratory tests"
      onAdd={() => append({ testName: "", instructions: "" })}
      addLabel="Add lab"
      empty={fields.length === 0}
    >
      {fields.map((field, i) => (
        <RepeaterRow key={field.id} onRemove={() => remove(i)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Test" htmlFor={`l-${i}-t`}>
              <Input id={`l-${i}-t`} {...register(`labs.${i}.testName` as const)} />
            </Field>
            <Field label="Instructions" htmlFor={`l-${i}-i`}>
              <Input id={`l-${i}-i`} {...register(`labs.${i}.instructions` as const)} />
            </Field>
          </div>
        </RepeaterRow>
      ))}
    </Repeater>
  );
}

// ── Referrals ────────────────────────────────────────────────────────
export function ReferralsEditor({
  control,
  register,
}: {
  control: Control<ConsultationFormShape>;
  register: UseFormRegister<ConsultationFormShape>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "referrals" });
  return (
    <Repeater
      title="Referrals"
      onAdd={() => append({ specialistOrDepartment: "", instructions: "" })}
      addLabel="Add referral"
      empty={fields.length === 0}
    >
      {fields.map((field, i) => (
        <RepeaterRow key={field.id} onRemove={() => remove(i)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Specialist / department" htmlFor={`r-${i}-s`}>
              <Input
                id={`r-${i}-s`}
                {...register(`referrals.${i}.specialistOrDepartment` as const)}
              />
            </Field>
            <Field label="Instructions" htmlFor={`r-${i}-i`}>
              <Input id={`r-${i}-i`} {...register(`referrals.${i}.instructions` as const)} />
            </Field>
          </div>
        </RepeaterRow>
      ))}
    </Repeater>
  );
}

// ── Shared building blocks ───────────────────────────────────────────
function Repeater({
  title,
  hint,
  onAdd,
  addLabel,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  onAdd: () => void;
  addLabel: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="font-display text-xl tracking-[-0.01em]">{title}</h3>
          {hint && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{hint}</p>}
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

function Field({
  label,
  htmlFor,
  full,
  children,
}: {
  label: string;
  htmlFor: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
