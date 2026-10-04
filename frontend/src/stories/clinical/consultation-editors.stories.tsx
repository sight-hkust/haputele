import { useForm } from "react-hook-form";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  NotesEditor,
  DiagnosesEditor,
  MedicationsEditor,
  LabsEditor,
  ReferralsEditor,
  type ConsultationFormShape,
} from "@/components/doctor/consultation-editors";
import { consultationValues } from "./consultation-values";
import { scenario } from "../scenario";

type EditorKind = "notes" | "diagnoses" | "medications" | "labs" | "referrals";
function StructuredEditor({ kind, empty = false }: { kind: EditorKind; empty?: boolean }) {
  const form = useForm<ConsultationFormShape>({
    defaultValues: empty
      ? {
          notes: { complaint: "", onset: "", symptoms: "", observations: "" },
          diagnoses: [],
          medications: [],
          labs: [],
          referrals: [],
        }
      : consultationValues,
  });
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      {kind === "notes" && <NotesEditor register={form.register} />}
      {kind === "diagnoses" && (
        <DiagnosesEditor control={form.control} register={form.register} watch={form.watch} />
      )}
      {kind === "medications" && (
        <MedicationsEditor control={form.control} register={form.register} />
      )}
      {kind === "labs" && <LabsEditor control={form.control} register={form.register} />}
      {kind === "referrals" && <ReferralsEditor control={form.control} register={form.register} />}
    </form>
  );
}
const meta = {
  title: "Clinical/Consultation/Structured editors",
  component: StructuredEditor,
  parameters: {
    ...scenario({ role: "doctor" }),
    docs: {
      description: {
        component:
          "Focused stories use a real react-hook-form owner for the five production editors. Diagnoses include the conditional Other/specify field; medications, laboratory requests, and referrals use repeatable structured rows. Validation, draft persistence, and signing belong to ConsultationFlow, not these editors.",
      },
    },
  },
  args: { kind: "notes", empty: false },
} satisfies Meta<typeof StructuredEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Notes: Story = {};
export const Diagnoses: Story = { args: { kind: "diagnoses" } };
export const Medications: Story = { args: { kind: "medications" } };
export const Labs: Story = { args: { kind: "labs" } };
export const Referrals: Story = { args: { kind: "referrals" } };
export const SpecifyOtherDiagnosis: Story = {
  args: { kind: "diagnoses", empty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add diagnosis" }));
    await userEvent.selectOptions(canvas.getByLabelText("Diagnosis"), "others");
    await userEvent.type(canvas.getByLabelText("Specify"), "Synthetic unlisted diagnosis");
    await expect(canvas.getByLabelText("Specify")).toHaveValue("Synthetic unlisted diagnosis");
  },
};
export const AddMedication: Story = {
  args: { kind: "medications", empty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add medication" }));
    await userEvent.type(canvas.getByLabelText("Generic name *"), "Paracetamol");
    await userEvent.type(canvas.getByLabelText("Dose"), "500 mg");
    await expect(canvas.getByLabelText("Generic name *")).toHaveValue("Paracetamol");
  },
};
export const AddReferral: Story = {
  args: { kind: "referrals", empty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add referral" }));
    await userEvent.type(canvas.getByLabelText("Specialist / department"), "General medicine");
    await userEvent.type(canvas.getByLabelText("Instructions"), "Synthetic review request");
    await expect(canvas.getByLabelText("Specialist / department")).toHaveValue("General medicine");
  },
};
