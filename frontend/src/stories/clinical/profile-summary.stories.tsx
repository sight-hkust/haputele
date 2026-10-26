import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProfileSummary } from "@/components/healthworker/profile-summary";
import { profile } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Patients/Profile summary",
  component: ProfileSummary,
  parameters: scenario(),
  args: { profile, editHref: "/healthworker/patients/1/profile" },
} satisfies Meta<typeof ProfileSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Populated: Story = {};
export const MissingProfile: Story = { args: { profile: null } };
export const EmptyProfile: Story = {
  args: {
    profile: {
      ...profile,
      diseaseHistory: [],
      surgicalHistory: [],
      allergies: [],
      medications: [],
      lifestyle: {},
    },
  },
};
