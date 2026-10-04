import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SectionLabel } from "@/components/primitives/section-label";

const meta = {
  title: "Primitives/SectionLabel",
  component: SectionLabel,
  tags: ["autodocs"],
  args: { children: "Patient details", pulse: false },
  argTypes: { children: { control: "text" } },
  parameters: {
    docs: {
      description: {
        component:
          "Shared uppercase mono section pill with accent dot. Pulse is an explicit opt-in for live workflow labels.",
      },
    },
  },
} satisfies Meta<typeof SectionLabel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Static: Story = {};
export const Pulsing: Story = { args: { children: "Consultation live", pulse: true } };
