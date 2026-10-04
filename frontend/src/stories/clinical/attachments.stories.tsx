import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AttachmentsPanel } from "@/components/healthworker/attachments-panel";
import { appointment } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Preconsult/Attachments",
  component: AttachmentsPanel,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "Real image attachment panel: file staging, rotation, full-size preview, deletion confirmation, browser camera and QR-based phone hand-off. Camera requires browser permission and a real device; QR hand-off needs the companion capture route and a reachable application origin, so Storybook does not claim a completed remote upload. API responses and image bytes are synthetic; completed/cancelled appointments are read-only. This is an image workflow, not a general PDF viewer.",
      },
    },
  },
  args: { appointmentId: appointment.id, status: "data_collection" },
} satisfies Meta<typeof AttachmentsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Editable: Story = {};
export const AwaitingDoctorNotes: Story = {
  args: { status: "awaiting_notes" },
  parameters: scenario({ appointmentStatus: "awaiting_notes" }),
};
export const CompletedReadOnly: Story = {
  args: { status: "completed" },
  parameters: scenario({ appointmentStatus: "completed" }),
};
export const CancelledReadOnly: Story = {
  args: { status: "cancelled" },
  parameters: scenario({ appointmentStatus: "cancelled" }),
};
export const Empty: Story = { parameters: scenario({ empty: true }) };
export const Loading: Story = { parameters: scenario({ loading: true }) };
export const LoadError: Story = { parameters: scenario({ error: true }) };
