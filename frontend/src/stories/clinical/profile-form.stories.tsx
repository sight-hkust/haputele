import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ProfileForm } from "@/components/healthworker/profile-form";
import { profile } from "../fixtures";
import { scenario } from "../scenario";

const meta = {
  title: "Clinical/Patients/Profile form",
  component: ProfileForm,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "Longitudinal history, not today's vitals: named and free-text diseases, repeatable surgeries/allergies/medications, and lifestyle. All controls lock while the caller's save promise is pending; errors unlock retained entries and the unsaved-changes guard stays active until acknowledgement. Empty repeater rows are filtered when the real form builds its request.",
      },
    },
  },
  args: { initial: profile, submitting: false, onSubmit: fn(), onCancel: fn() },
} satisfies Meta<typeof ProfileForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ExistingProfile: Story = {};
export const NewProfile: Story = { args: { initial: null } };
export const AddUnlistedCondition: Story = {
  args: { initial: null },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add other" }));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Other condition 1" }),
      "Synthetic unlisted condition",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Create profile" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          diseaseHistory: [{ code: "other", text: "Synthetic unlisted condition" }],
        }),
      ),
    );
  },
};
export const IncompleteClinicalRows: Story = {
  args: { initial: null },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add allergy" }));
    await userEvent.type(canvas.getByLabelText("Allergen"), "Latex");
    await userEvent.click(canvas.getByRole("button", { name: "Add medication" }));
    await userEvent.type(canvas.getByLabelText("Dosage"), "5 mg");
    await userEvent.click(canvas.getByRole("button", { name: "Create profile" }));
    await canvas.findByText("Choose an allergy type before saving.");
    await canvas.findByText("Enter the medication name before saving.");
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await expect(canvas.getByLabelText("Allergen")).toHaveValue("Latex");
    await expect(canvas.getByLabelText("Dosage")).toHaveValue("5 mg");
    const originalConfirm = window.confirm;
    const stay = fn(() => false);
    window.confirm = stay;
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
      await expect(stay).toHaveBeenCalledOnce();
      await expect(args.onCancel).not.toHaveBeenCalled();
      await expect(canvas.getByLabelText("Dosage")).toHaveValue("5 mg");
    } finally {
      window.confirm = originalConfirm;
    }

    await userEvent.selectOptions(canvas.getByLabelText("Type"), "other");
    await userEvent.type(canvas.getByLabelText("Drug"), "Amlodipine");
    await userEvent.click(canvas.getByRole("button", { name: "Create profile" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          allergies: [expect.objectContaining({ type: "other", name: "Latex" })],
          medications: [expect.objectContaining({ drug: "Amlodipine", dosage: "5 mg" })],
        }),
      ),
    );
  },
};
export const Saving: Story = { args: { submitting: true } };
export const SaveError: Story = {
  args: { errorMessage: "The profile could not be saved. Please try again." },
};
export const PendingSaveRetainsCorrections: Story = {
  args: { onSaved: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const allergen = canvas.getByLabelText("Allergen");
    await userEvent.clear(allergen);
    await userEvent.type(allergen, "Synthetic corrected allergen");
    const { promise: pending, reject: rejectSave } = Promise.withResolvers<void>();
    args.onSubmit.mockImplementationOnce(() => pending);
    await userEvent.click(canvas.getByRole("button", { name: "Save profile" }));
    try {
      await waitFor(() => expect(allergen).toBeDisabled());
      for (const control of canvasElement.querySelectorAll("input, select, textarea, button")) {
        await expect(control).toBeDisabled();
      }
      await expect(args.onSaved).not.toHaveBeenCalled();
      const refresh = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(refresh);
      await expect(refresh.defaultPrevented).toBe(true);
      await expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          allergies: [expect.objectContaining({ name: "Synthetic corrected allergen" })],
        }),
      );
    } finally {
      rejectSave(new Error("Synthetic rejected profile request"));
    }
    await waitFor(() => expect(allergen).toBeEnabled());
    await expect(allergen).toHaveValue("Synthetic corrected allergen");
    await expect(canvas.getByText("Unsaved changes")).toBeVisible();
    await expect(args.onSaved).not.toHaveBeenCalled();

    await userEvent.type(allergen, " retained after failure");
    const accepted = Promise.withResolvers<void>();
    args.onSubmit.mockImplementationOnce(() => accepted.promise);
    await userEvent.click(canvas.getByRole("button", { name: "Save profile" }));
    try {
      await waitFor(() => expect(allergen).toBeDisabled());
      await expect(args.onSaved).not.toHaveBeenCalled();
    } finally {
      accepted.resolve();
    }
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledOnce());
    await expect(args.onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allergies: [
          expect.objectContaining({
            name: "Synthetic corrected allergen retained after failure",
          }),
        ],
      }),
    );
    await expect(allergen).toHaveValue("Synthetic corrected allergen retained after failure");
    await expect(canvas.getByText("No unsaved changes")).toBeVisible();
    const refresh = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(refresh);
    await expect(refresh.defaultPrevented).toBe(false);
  },
};
