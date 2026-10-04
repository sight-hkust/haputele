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
          "Longitudinal history, not today's vitals: named and free-text diseases, repeatable surgeries/allergies/medications, and lifestyle. Empty repeater rows are filtered when the real form builds its request.",
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
