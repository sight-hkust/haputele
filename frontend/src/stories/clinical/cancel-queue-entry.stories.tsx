import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { CancelQueueEntryForm } from "@/components/healthworker/cancel-queue-entry-form";
import { queueEntry } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Queue/Cancel entry",
  component: CancelQueueEntryForm,
  parameters: scenario(),
  args: { entry: queueEntry, onCancelled: fn(), onClose: fn() },
} satisfies Meta<typeof CancelQueueEntryForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OptionalReason: Story = {};
export const CancelWithReason: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox"), "Patient declined the synthetic visit");
    await userEvent.click(canvas.getByRole("button", { name: "Cancel entry" }));
    await waitFor(() => expect(args.onCancelled).toHaveBeenCalled());
  },
};
export const FailedCancellation: Story = {
  parameters: scenario({ error: true }),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Cancel entry" }));
  },
};
