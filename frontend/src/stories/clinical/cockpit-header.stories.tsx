import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CockpitHeader } from "@/components/healthworker/cockpit";
import { appointmentDetail, doctor } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Appointments/Detail header",
  component: CockpitHeader,
  parameters: scenario(),
  args: { data: appointmentDetail, doctorName: `Dr. ${doctor.givenName} ${doctor.familyName}` },
} satisfies Meta<typeof CockpitHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PatientAndAssignedDoctor: Story = {};
export const MissingPatient: Story = { args: { data: { ...appointmentDetail, patient: null } } };
