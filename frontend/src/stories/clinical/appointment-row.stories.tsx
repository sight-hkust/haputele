import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppointmentRow } from "@/components/healthworker/appointment-row";
import { calendarAppointment } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Appointments/List row",
  component: AppointmentRow,
  parameters: scenario(),
  args: { appointment: calendarAppointment },
  render: (args) => (
    <ul>
      <AppointmentRow {...args} />
    </ul>
  ),
} satisfies Meta<typeof AppointmentRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Scheduled: Story = {
  args: { appointment: { ...calendarAppointment, status: "scheduled" } },
};
export const Completed: Story = {
  args: { appointment: { ...calendarAppointment, status: "completed" } },
};
export const Cancelled: Story = {
  args: { appointment: { ...calendarAppointment, status: "cancelled" } },
};
export const ReadyForDoctor: Story = {
  args: {
    appointment: { ...calendarAppointment, status: "data_collection" },
    viewerRole: "doctor",
    basePath: "/doctor/appointments",
  },
};
export const UnfinishedDoctorNotes: Story = {
  args: {
    appointment: { ...calendarAppointment, status: "awaiting_notes" },
    viewerRole: "doctor",
    basePath: "/doctor/appointments",
  },
};
