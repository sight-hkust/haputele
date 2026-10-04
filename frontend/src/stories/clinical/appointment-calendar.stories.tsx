import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppointmentCalendar } from "@/components/healthworker/appointment-calendar";
import type { AppointmentStatus, CalendarAppointment } from "@/types/api";
import { appLocalToUtcIso } from "@/lib/format";
import { availability, calendarAppointment, today } from "../fixtures";
import { scenario } from "../scenario";
const statuses: AppointmentStatus[] = [
  "scheduled",
  "consent_pending",
  "data_collection",
  "in_progress",
  "awaiting_notes",
  "completed",
  "cancelled",
];
const rows: CalendarAppointment[] = statuses.map((status, index) => ({
  ...calendarAppointment,
  id: index + 1,
  status,
  scheduledAt: appLocalToUtcIso(`${today}T${String(8 + index).padStart(2, "0")}:00`),
}));
const meta = {
  title: "Clinical/Appointments/Calendar",
  component: AppointmentCalendar,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "Production calendar with appointment-state styling, doctor availability, week/day/month navigation, and appointment link routing. Selecting a list row can focus and ring its corresponding calendar event. Navigation is supplied by Storybook's Next router, not a route page.",
      },
    },
  },
  args: {
    appointments: rows,
    availability: [availability],
    focusId: calendarAppointment.id,
    focusAt: calendarAppointment.scheduledAt,
  },
} satisfies Meta<typeof AppointmentCalendar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllAppointmentStates: Story = {};
export const Empty: Story = { args: { appointments: [], availability: [] } };
export const AvailabilityOnly: Story = { args: { appointments: [] } };
export const DoctorCalendar: Story = {
  args: { basePath: "/doctor/appointments" },
  parameters: scenario({ role: "doctor", path: "/doctor/appointments" }),
};
