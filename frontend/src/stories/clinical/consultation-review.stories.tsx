import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConsultationReview } from "@/components/doctor/consultation-review";
import { consultationValues } from "./consultation-values";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Consultation/Review",
  component: ConsultationReview,
  parameters: {
    ...scenario({ role: "doctor" }),
    docs: {
      description: {
        component:
          "The actual final structured summary before signing: notes, diagnoses, medication instructions, investigations, and referrals. This HTML summary is not a prescription PDF or proof of a legally signed clinical record.",
      },
    },
  },
  args: { values: consultationValues },
} satisfies Meta<typeof ConsultationReview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Populated: Story = {};
export const NoStructuredEntries: Story = {
  args: {
    values: {
      notes: { complaint: "", onset: "", symptoms: "", observations: "" },
      diagnoses: [],
      medications: [],
      labs: [],
      referrals: [],
    },
  },
};
export const OtherDiagnosisAndReferral: Story = {
  args: {
    values: {
      ...consultationValues,
      diagnoses: [{ code: "others", text: "Synthetic unlisted diagnosis" }],
      referrals: [
        { specialistOrDepartment: "General medicine", instructions: "Synthetic review request" },
      ],
    },
  },
};
