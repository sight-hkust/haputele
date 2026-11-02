import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { DoctorCallPanel } from "@/components/meeting/doctor-call-panel";
import { scenario } from "../scenario";

const meta = {
  title: "Clinical/Meeting/Doctor call panel",
  component: DoctorCallPanel,
  args: { appointmentId: 1, status: "scheduled" },
  parameters: {
    ...scenario({ role: "doctor" }),
    docs: {
      description: {
        component:
          "Production call availability and error surface. Storybook deliberately never mints a usable video token or connects to a clinical room. LiveKit media, reconnect, device warnings and full-screen meeting room require a real configured service and browser permissions.",
      },
    },
  },
} satisfies Meta<typeof DoctorCallPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WaitingForHealthworker: Story = {};
export const JoinAvailable: Story = { args: { status: "in_progress" } };
export const CallEnded: Story = { args: { status: "awaiting_notes" } };
export const LivekitNotConfigured: Story = {
  args: { status: "in_progress" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Join call" }));
    await canvas.findByRole("alert");
    await expect(canvas.getByRole("button", { name: "Join call" })).toBeEnabled();
  },
};
