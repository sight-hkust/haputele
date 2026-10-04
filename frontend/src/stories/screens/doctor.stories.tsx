import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Screen } from "../screen";
import { scenario } from "../scenario";

const meta = {
  title: "Screens/Doctor",
  component: Screen,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: { path: { control: false } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TodayWorklist: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor" }),
};
export const EmptyWorklist: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor", empty: true }),
};
export const WorklistError: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor", error: true }),
};
export const ReadyPatientWorklist: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor", appointmentStatus: "data_collection" }),
};
export const UnfinishedNotesWorklist: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor", appointmentStatus: "awaiting_notes" }),
};
export const WaitingForHealthworker: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "scheduled" }),
};
export const PatientReady: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "awaiting_notes" }),
};
export const LiveAppointment: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "in_progress" }),
};
export const ConsultationDraft: Story = {
  args: { path: "/doctor/consultations/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "awaiting_notes" }),
};
export const ConsultationWithCallPanel: Story = {
  args: { path: "/doctor/consultations/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "in_progress" }),
};
export const LockedConsultation: Story = {
  args: { path: "/doctor/consultations/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "completed" }),
};
export const CompletedAppointment: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "completed" }),
};
export const AvailabilityPlanner: Story = {
  args: { path: "/doctor/availability" },
  parameters: scenario({ role: "doctor" }),
};
export const PracticeProfile: Story = {
  args: { path: "/doctor/profile" },
  parameters: scenario({ role: "doctor" }),
};
