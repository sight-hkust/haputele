import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { VisitHistoryPanel } from "@/components/doctor/visit-history";
import { patient } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Doctor/Visit history",
  component: VisitHistoryPanel,
  parameters: scenario({ role: "doctor", path: "/doctor/appointments/1" }),
  args: { patientId: patient.id, excludeAppointmentId: 1 },
} satisfies Meta<typeof VisitHistoryPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PreviousConsultation: Story = {};
export const Empty: Story = { parameters: scenario({ role: "doctor", empty: true }) };
export const ExcludesCurrentVisit: Story = { args: { excludeAppointmentId: 10 } };
export const NoPatientSelected: Story = { args: { patientId: null } };
export const Loading: Story = { parameters: scenario({ role: "doctor", loading: true }) };
export const LoadError: Story = { parameters: scenario({ role: "doctor", error: true }) };
export const CollapseHistory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  },
};
