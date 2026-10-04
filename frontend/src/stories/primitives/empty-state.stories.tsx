import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CalendarDays } from "lucide-react";
import { fn } from "storybook/test";
import { Button } from "@/components/primitives/button";
import { EmptyState } from "@/components/primitives/empty-state";

const meta = {
  title: "Primitives/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  args: {
    title: "No appointments yet",
    description: "Book a patient's first consultation to get started.",
    Icon: CalendarDays,
  },
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    Icon: { control: false },
    action: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Shared dashed empty surface with optional icon, explanatory copy and recovery/action slot.",
      },
    },
  },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithIcon: Story = {};
export const WithAction: Story = {
  args: { action: <Button onClick={fn()}>Book appointment</Button> },
};
export const TextOnly: Story = {
  args: { Icon: undefined, description: "No results match the current filters." },
};
export const TitleOnly: Story = { args: { Icon: undefined, description: undefined } };
