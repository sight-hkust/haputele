import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Screen } from "../screen";
import { scenario } from "../scenario";
import { doctor as fixtureDoctor } from "../fixtures";
import { doctorName } from "@/lib/format";

const meta = {
  title: "Screens/Healthworker",
  component: Screen,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: { path: { control: false } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BookingWorkspace: Story = {
  args: { path: "/healthworker/appointments" },
  parameters: scenario(),
};
export const EmptyWorkspace: Story = {
  args: { path: "/healthworker/appointments" },
  parameters: scenario({ empty: true }),
};
export const WorkspaceError: Story = {
  args: { path: "/healthworker/appointments" },
  parameters: scenario({ error: true }),
};
export const WorkspaceLoading: Story = {
  args: { path: "/healthworker/appointments" },
  parameters: scenario({ loading: true }),
};
export const BookingFromQueue: Story = {
  args: { path: "/healthworker/appointments?bookFromQueue=1" },
  parameters: scenario(),
};
export const BookingForPatient: Story = {
  args: { path: "/healthworker/appointments?patientId=1" },
  parameters: scenario(),
};
export const PreserveWorkspaceDrafts: Story = {
  args: { path: "/healthworker/appointments" },
  parameters: scenario(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /^Book appointment$/ }));
    const doctor = await canvas.findByRole("combobox", { name: "Doctor" });
    await canvas.findByRole("option", { name: doctorName(fixtureDoctor) });
    await userEvent.selectOptions(doctor, "1");
    await userEvent.click(canvas.getByRole("button", { name: "Hide booking" }));
    await userEvent.click(canvas.getByRole("button", { name: /^Pending queue/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Add to queue" }));
    const notes = canvas.getByPlaceholderText(/^What did the patient ask for/);
    await userEvent.type(notes, "Patient requests a morning appointment");
    await userEvent.click(canvas.getByRole("button", { name: "Today worklist" }));
    await userEvent.click(canvas.getByRole("button", { name: /^Pending queue/ }));
    await expect(notes).toHaveValue("Patient requests a morning appointment");
    await userEvent.click(canvas.getByRole("button", { name: /^Book appointment$/ }));
    await expect(doctor).toHaveValue("1");
  },
};
export const PatientRoster: Story = {
  args: { path: "/healthworker/patients" },
  parameters: scenario(),
};
export const EmptyPatientRoster: Story = {
  args: { path: "/healthworker/patients" },
  parameters: scenario({ empty: true }),
};
export const PatientRegistration: Story = {
  args: { path: "/healthworker/patients/new" },
  parameters: scenario(),
};
export const PatientRecord: Story = {
  args: { path: "/healthworker/patients/1" },
  parameters: scenario(),
};
export const PatientIntake: Story = {
  args: { path: "/healthworker/patients/1/profile" },
  parameters: scenario(),
};
export const Queue: Story = { args: { path: "/healthworker/queue" }, parameters: scenario() };
export const EmptyQueue: Story = {
  args: { path: "/healthworker/queue" },
  parameters: scenario({ empty: true }),
};
export const AvailabilityPlanner: Story = {
  args: { path: "/healthworker/availability" },
  parameters: scenario(),
};
export const PrescriptionExports: Story = {
  args: { path: "/healthworker/exports" },
  parameters: scenario(),
};
export const ExportFailure: Story = {
  args: { path: "/healthworker/exports" },
  parameters: scenario({ error: true }),
};
export const ConsentRequired: Story = {
  args: { path: "/healthworker/appointments/1" },
  parameters: scenario({ appointmentStatus: "scheduled", sessionConsent: false }),
};
export const MasterConsentExpired: Story = {
  args: { path: "/healthworker/appointments/1" },
  parameters: scenario({
    appointmentStatus: "scheduled",
    needsReconsent: true,
    sessionConsent: false,
  }),
};
export const RecordingVitals: Story = {
  args: { path: "/healthworker/appointments/1" },
  parameters: scenario({ appointmentStatus: "consent_pending" }),
};
export const ReadyToMeet: Story = {
  args: { path: "/healthworker/appointments/1" },
  parameters: scenario({ appointmentStatus: "data_collection" }),
};
export const InProgress: Story = {
  args: { path: "/healthworker/appointments/1" },
  parameters: scenario({ appointmentStatus: "in_progress" }),
};
export const AwaitingDoctorNotes: Story = {
  args: { path: "/healthworker/appointments/1" },
  parameters: scenario({ appointmentStatus: "awaiting_notes" }),
};
export const SignedPrescription: Story = {
  args: { path: "/healthworker/appointments/1" },
  parameters: scenario({ appointmentStatus: "completed" }),
};
export const CancelledAppointment: Story = {
  args: { path: "/healthworker/appointments/1" },
  parameters: scenario({ appointmentStatus: "cancelled" }),
};
