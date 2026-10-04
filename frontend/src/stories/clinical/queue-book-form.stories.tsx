import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { QueueBookForm } from "@/components/healthworker/queue-book-form";
import { queueEntry } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Queue/Book appointment",
  component: QueueBookForm,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "Preferred doctor and target date prefill the real slot picker. Booking calls the queue-book endpoint: the backend atomically creates the appointment and marks the entry booked. Storybook simulates its response, not a server transaction.",
      },
    },
  },
  args: { entry: queueEntry, onBooked: fn(), onCancel: fn() },
} satisfies Meta<typeof QueueBookForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PreferredDoctor: Story = {};
export const NoPreference: Story = {
  args: { entry: { ...queueEntry, preferredDoctorId: null, targetDate: null } },
};
export const BookPrefilled: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("option", { name: /preferred/ });
    await userEvent.click(canvas.getByRole("button", { name: "Book appointment" }));
    await waitFor(() =>
      expect(args.onBooked).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: queueEntry.patientId }),
      ),
    );
  },
};
export const BookingConflict: Story = {
  parameters: scenario({ error: true }),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Book appointment" }));
  },
};
