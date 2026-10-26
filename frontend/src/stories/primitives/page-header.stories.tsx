import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/primitives/button";
import { PageHeader } from "@/components/primitives/page-header";

const meta = {
  title: "Primitives/PageHeader",
  component: PageHeader,
  tags: ["autodocs"],
  args: {
    label: "Healthworker",
    title: "Your appointments",
    subtitle: "Schedule consultations and prepare patient details.",
    pulseLabel: false,
  },
  argTypes: {
    title: { control: "text" },
    subtitle: { control: "text" },
    action: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Task heading with a readable context label, supporting text and an optional action. Uses the shared sans-serif heading scale and stacks on smaller viewports.",
      },
    },
  },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithAction: Story = {
  args: { action: <Button onClick={fn()}>Book appointment</Button> },
};
export const LiveLabel: Story = { args: { label: "Consultation in progress", pulseLabel: true } };
export const Minimal: Story = {
  args: { label: undefined, title: "Patient profile", subtitle: undefined },
};
