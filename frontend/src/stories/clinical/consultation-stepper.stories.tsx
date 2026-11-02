import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConsultationStepper } from "@/components/doctor/consultation-stepper";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Consultation/Stepper",
  component: ConsultationStepper,
  parameters: {
    ...scenario({ role: "doctor" }),
    docs: {
      description: {
        component:
          "Production progress indicator for Notes, prescription (rx), and Review. It is an ordered progress display, not clickable navigation; ConsultationFlow owns transitions and draft saving.",
      },
    },
  },
  args: { current: "notes" },
} satisfies Meta<typeof ConsultationStepper>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Notes: Story = {};
export const Prescription: Story = { args: { current: "rx" } };
export const Review: Story = { args: { current: "review" } };
