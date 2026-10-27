import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";

const meta = {
  title: "Primitives/ErrorBanner",
  component: ErrorBanner,
  tags: ["autodocs"],
  args: {
    children: "The appointment could not be saved. Your entered details have been kept.",
    tone: "rose",
  },
  argTypes: {
    tone: { control: "select", options: ["rose", "amber"] },
    children: { control: "text" },
  },
  parameters: {
    controls: { include: ["children", "tone", "requestId"] },
    docs: {
      description: {
        component:
          "Shared alert surface with rose/amber tones, optional support reference and a caller-owned recovery action.",
      },
    },
  },
} satisfies Meta<typeof ErrorBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Failure: Story = {};
export const Warning: Story = {
  args: { tone: "amber", children: "Patient consent must be renewed before continuing." },
};
export const SupportReference: Story = { args: { requestId: "storybook-request-001" } };
export const RecoveryAction: Story = {
  args: {
    requestId: "storybook-request-001",
    action: (
      <Button variant="secondary" size="sm" onClick={fn()}>
        Try again
      </Button>
    ),
  },
};
