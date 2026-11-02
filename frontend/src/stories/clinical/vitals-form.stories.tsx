import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
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
          "Optional numeric observations with production clinical bounds, cross-field diastolic/systolic validation, and server field-error mapping. Empty numbers submit as null; an empty complaint explicitly clears its prior value. All fields lock during pending saves and failed saves preserve entries. The cockpit, not this standalone form, enforces session consent.",
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

function DeferredVitalsSave(args: ComponentProps<typeof VitalsForm>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <VitalsForm
      {...args}
      submitting={saving}
      errorMessage={error}
      onSubmit={async (request) => {
        setSaving(true);
        setError(null);
        try {
          await args.onSubmit(request);
        } catch {
          setError("Synthetic vitals request rejected; entries retained.");
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}

export const PendingSaveLocksAndRetainsValues: Story = {
  render: (args) => <DeferredVitalsSave {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const complaint = canvas.getByLabelText("Primary complaint");
    await userEvent.clear(complaint);
    await userEvent.type(complaint, "Synthetic corrected complaint");
    const failed = Promise.withResolvers<void>();
    args.onSubmit.mockImplementationOnce(() => failed.promise);
    await userEvent.click(canvas.getByRole("button", { name: "Update vitals" }));
    try {
      await waitFor(() => expect(complaint).toBeDisabled());
      for (const control of canvasElement.querySelectorAll("input, textarea, button")) {
        await expect(control).toBeDisabled();
      }
      await expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ primaryComplaint: "Synthetic corrected complaint" }),
      );
    } finally {
      failed.reject(new Error("Synthetic rejected vitals request"));
    }
    await canvas.findByText("Synthetic vitals request rejected; entries retained.");
    await expect(complaint).toBeEnabled();
    await expect(complaint).toHaveValue("Synthetic corrected complaint");

    await userEvent.type(complaint, " retained after failure");
    const accepted = Promise.withResolvers<void>();
    args.onSubmit.mockImplementationOnce(() => accepted.promise);
    await userEvent.click(canvas.getByRole("button", { name: "Update vitals" }));
    try {
      await waitFor(() => expect(complaint).toBeDisabled());
      await expect(args.onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          primaryComplaint: "Synthetic corrected complaint retained after failure",
        }),
      );
    } finally {
      accepted.resolve();
    }
    await waitFor(() => expect(complaint).toBeEnabled());
    await expect(complaint).toHaveValue("Synthetic corrected complaint retained after failure");
  },
};
