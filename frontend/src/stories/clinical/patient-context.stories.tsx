import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PatientContext } from "@/components/healthworker/patient-context";
import { fn } from "storybook/test";
import { patient } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Patients/Booking context",
  component: PatientContext,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "The existing booking-context warning loads upcoming appointments and pending queue entries for the selected patient. It intentionally renders nothing while loading or when both lists are empty. Upcoming means later than the actual current time; the relative fixture appointment can drop out after its scheduled time, while the queue entry remains visible.",
      },
    },
  },
  args: { patientId: patient.id, onBookQueueEntry: fn() },
} satisfies Meta<typeof PatientContext>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PendingCare: Story = {};
export const NoPendingCare: Story = { parameters: scenario({ empty: true }) };
export const LoadingRendersNothing: Story = { parameters: scenario({ loading: true }) };
