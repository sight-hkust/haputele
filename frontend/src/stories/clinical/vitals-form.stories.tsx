import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { VitalsForm } from "@/components/healthworker/vitals-form";
import { preconsult } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Preconsult/Vitals",
  component: VitalsForm,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "Optional numeric observations with production clinical bounds, cross-field diastolic/systolic validation, and server field-error mapping. Empty numbers submit as null; an empty complaint explicitly clears its prior value. The cockpit, not this standalone form, enforces session consent.",
      },
    },
  },
  args: { initial: preconsult, submitting: false, onSubmit: fn() },
} satisfies Meta<typeof VitalsForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Recorded: Story = {};
export const New: Story = { args: { initial: null } };
export const EditAndSave: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText("Temperature (°C)"));
    await userEvent.type(canvas.getByLabelText("Temperature (°C)"), "37.2");
    await userEvent.click(canvas.getByRole("button", { name: "Update vitals" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 37.2,
          sysBp: preconsult.sysBp,
          primaryComplaint: preconsult.primaryComplaint,
        }),
      ),
    );
  },
};
export const InvalidBloodPressurePair: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const diastolic = canvas.getByLabelText("Diastolic BP (mmHg)");
    await userEvent.clear(diastolic);
    await userEvent.type(diastolic, "140");
    await userEvent.click(canvas.getByRole("button", { name: "Update vitals" }));
    await waitFor(() => expect(diastolic).toHaveAttribute("aria-invalid", "true"));
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
export const ReadOnly: Story = { args: { disabled: true } };
export const Saving: Story = { args: { submitting: true } };
export const ServerFieldError: Story = {
  args: {
    errorMessage: "Check the highlighted measurement.",
    serverFieldErrors: { temperature: "Temperature is outside the accepted range." },
  },
};
