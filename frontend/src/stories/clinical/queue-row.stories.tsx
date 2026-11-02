import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { QueueRow } from "@/components/healthworker/queue-row";
import { queueEntry } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Queue/Entry row",
  component: QueueRow,
  parameters: scenario(),
  args: { entry: queueEntry, onBook: fn(), onCancel: fn() },
  decorators: [
    (Story) => (
      <ul>
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof QueueRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Screening: Story = {};
export const UrgentWalkIn: Story = {
  args: { entry: { ...queueEntry, source: "walk_in", priority: "urgent" } },
};
export const FollowUp: Story = { args: { entry: { ...queueEntry, source: "follow_up" } } };
export const Booked: Story = {
  args: { entry: { ...queueEntry, status: "booked", appointmentId: 1 } },
};
export const Cancelled: Story = {
  args: {
    entry: {
      ...queueEntry,
      status: "cancelled",
      cancellationReason: "Patient declined the visit.",
    },
  },
};
export const Compact: Story = { args: { compact: true } };
export const BookAction: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Book" }));
    await expect(args.onBook).toHaveBeenCalled();
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};
