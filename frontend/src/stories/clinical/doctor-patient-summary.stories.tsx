import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PatientSummary } from "@/components/doctor/patient-summary";
import { attachment, appointment, patient, preconsult, profile } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Doctor/Patient summary",
  component: PatientSummary,
  parameters: {
    ...scenario({ role: "doctor", path: "/doctor/appointments/1" }),
    docs: {
      description: {
        component:
          "The doctor's compact companion to consultation notes: demographics, chief complaint, current vitals, longitudinal history, and attachment previews. Image bytes and clinical data are explicitly synthetic.",
      },
    },
  },
  args: { patient, preconsult, profile, attachments: [attachment], appointmentId: appointment.id },
} satisfies Meta<typeof PatientSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CompleteContext: Story = {};
export const NoIntakeOrProfile: Story = {
  args: { preconsult: null, profile: null, attachments: [] },
};
export const LegacyDemographics: Story = {
  args: { patient: { ...patient, dob: null, contact: null, address: null } },
};
export const AttachmentFailure: Story = {
  parameters: scenario({ role: "doctor", path: "/doctor/appointments/1", error: true }),
};
export const UnrecordedAllergies: Story = {
  args: { profile: { ...profile, allergies: [] } },
};
