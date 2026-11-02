import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatusBadge } from "@/components/primitives/status-badge";

const statuses = [
  "scheduled",
  "consent_pending",
  "data_collection",
  "in_progress",
  "awaiting_notes",
  "completed",
  "cancelled",
];
const meta = {
  title: "Primitives/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  args: { status: "scheduled" },
  argTypes: { status: { control: "select", options: statuses } },
  parameters: {
    docs: {
      description: {
        component:
          "The seven production appointment states. Only in_progress pulses. Copy comes from the shared statusLabel formatter; unknown values retain the scheduled visual treatment.",
      },
    },
  },
} satisfies Meta<typeof StatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Scheduled: Story = {};
export const ConsentPending: Story = { args: { status: "consent_pending" } };
export const DataCollection: Story = { args: { status: "data_collection" } };
export const InProgress: Story = { args: { status: "in_progress" } };
export const AwaitingNotes: Story = { args: { status: "awaiting_notes" } };
export const Completed: Story = { args: { status: "completed" } };
export const Cancelled: Story = { args: { status: "cancelled" } };
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {statuses.map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
