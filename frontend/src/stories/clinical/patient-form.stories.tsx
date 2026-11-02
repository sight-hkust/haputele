import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { PatientForm } from "@/components/healthworker/patient-form";
import { patient } from "../fixtures";
import { scenario } from "../scenario";
import { Screen } from "../screen";

const meta = {
  title: "Clinical/Patients/Registration and editing",
  component: PatientForm,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "The production demographic form. Registration requires a date of birth; edit supports legacy records without one. Modal editing reports actual form dirtiness, including calendar selections, so Escape, Close, and Cancel protect unsaved corrections. Its create callback deliberately excludes masterConsent: the registration route separately captures the patient signature and assembles the consent payload. Consent renewal and session consent are demonstrated in Appointment cockpit. No signature is fabricated by this form.",
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
export const CalendarEditsRequireDiscard: Story = {
  parameters: scenario({ path: "/healthworker/patients/1" }),
  render: () => <Screen path="/healthworker/patients/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const originalConfirm = window.confirm;
    const confirm = fn(() => false);
    window.confirm = confirm;
    try {
      await userEvent.click(
        await canvas.findByRole("button", { name: "Edit patient demographics" }),
      );
      const dialog = await canvas.findByRole("dialog", { name: "Edit patient" });
      const editor = within(dialog);
      await userEvent.click(
        editor.getByRole("button", { name: "Choose date of birth from calendar" }),
      );
      await userEvent.click(editor.getByRole("gridcell", { name: /19 May 1974$/ }));
      await expect(editor.getByLabelText("Date of birth")).toHaveValue("19/05/1974");

      // Native Escape dispatches cancel; userEvent does not synthesize that default.
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      await expect(confirm).toHaveBeenCalledOnce();
      await expect(dialog.matches(":modal")).toBe(true);
      await expect(editor.getByLabelText("Date of birth")).toHaveValue("19/05/1974");
      await userEvent.click(editor.getByRole("button", { name: "Close dialog" }));
      await expect(confirm).toHaveBeenCalledTimes(2);
      await expect(dialog.matches(":modal")).toBe(true);
      confirm.mockReturnValue(true);
      await userEvent.click(editor.getByRole("button", { name: "Cancel" }));
      await expect(confirm).toHaveBeenCalledTimes(3);
      await waitFor(() =>
        expect(canvas.queryByRole("dialog", { name: "Edit patient" })).not.toBeInTheDocument(),
      );

      await userEvent.click(canvas.getByRole("button", { name: "Edit patient demographics" }));
      const cleanDialog = await canvas.findByRole("dialog", { name: "Edit patient" });
      await expect(within(cleanDialog).getByLabelText("Date of birth")).toHaveValue("18/05/1974");
      const givenName = within(cleanDialog).getByLabelText("Given name");
      await userEvent.type(givenName, "x{Backspace}");
      await expect(givenName).toHaveValue(patient.given);
      fireEvent(cleanDialog, new Event("cancel", { cancelable: true }));
      await waitFor(() =>
        expect(canvas.queryByRole("dialog", { name: "Edit patient" })).not.toBeInTheDocument(),
      );
      await expect(confirm).toHaveBeenCalledTimes(3);

      await userEvent.click(canvas.getByRole("button", { name: "Edit patient demographics" }));
      const savingEditor = within(await canvas.findByRole("dialog", { name: "Edit patient" }));
      await userEvent.click(
        savingEditor.getByRole("button", { name: "Choose date of birth from calendar" }),
      );
      await userEvent.click(savingEditor.getByRole("gridcell", { name: /19 May 1974$/ }));
      await userEvent.click(savingEditor.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(canvas.queryByRole("dialog", { name: "Edit patient" })).not.toBeInTheDocument(),
      );
      await expect(confirm).toHaveBeenCalledTimes(3);
      await canvas.findByText("19/05/1974");
      await userEvent.click(canvas.getByRole("button", { name: "Edit patient demographics" }));
      const savedDialog = await canvas.findByRole("dialog", { name: "Edit patient" });
      await expect(within(savedDialog).getByLabelText("Date of birth")).toHaveValue("19/05/1974");
      await userEvent.click(within(savedDialog).getByRole("button", { name: "Cancel" }));
      await expect(confirm).toHaveBeenCalledTimes(3);
    } finally {
      window.confirm = originalConfirm;
    }
  },
};
