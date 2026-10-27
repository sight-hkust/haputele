import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { PatientForm } from "@/components/healthworker/patient-form";
import { patient } from "../fixtures";
import { scenario } from "../scenario";

const meta = {
  title: "Clinical/Patients/Registration and editing",
  component: PatientForm,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "The production demographic form. Registration requires a date of birth; edit supports legacy records without one. Its create callback deliberately excludes masterConsent: the registration route separately captures the patient signature and assembles the consent payload. Consent renewal and session consent are demonstrated in Appointment cockpit. No signature is fabricated by this form.",
      },
    },
  },
  args: { mode: "create", submitting: false, onSubmit: fn(), onCancel: fn() },
} satisfies Meta<typeof PatientForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Registration: Story = {};
export const RegisterPatient: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Given name"), "Mala");
    await userEvent.type(canvas.getByLabelText("Family name"), "Fernando");
    await userEvent.type(canvas.getByLabelText("Date of birth"), "18051974");
    await userEvent.selectOptions(canvas.getByLabelText("Gender"), "female");
    await userEvent.selectOptions(canvas.getByLabelText("Preferred language"), "si");
    await userEvent.click(canvas.getByRole("button", { name: "Save patient" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        mode: "create",
        payload: expect.objectContaining({
          given: "Mala",
          family: "Fernando",
          dob: "1974-05-18",
          gender: "female",
          language: "si",
        }),
      }),
    );
  },
};
export const RequiredFields: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save patient" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Date of birth")).toHaveAttribute("aria-invalid", "true"),
    );
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
export const Edit: Story = { args: { mode: "update", initial: patient } };
export const LegacyMissingDateOfBirth: Story = {
  args: { mode: "update", initial: { ...patient, dob: null } },
};
export const Saving: Story = { args: { initial: patient, submitting: true } };
export const ServerError: Story = {
  args: { initial: patient, errorMessage: "A patient with this national ID already exists." },
};
