import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Plus } from "lucide-react";
import { fn } from "storybook/test";
import { Button } from "@/components/primitives/button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "Book appointment",
    variant: "primary",
    size: "md",
    disabled: false,
    onClick: fn(),
  },
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "ghost", "destructive"] },
    size: { control: "select", options: ["sm", "md", "lg", "xl", "icon"] },
    children: { control: "text" },
  },
  parameters: {
    controls: { include: ["children", "variant", "size", "disabled"] },
    docs: {
      description: {
        component:
          "Production button tokens, gradient, focus ring, hover motion and native disabled behavior. Icon-only callers must provide an accessible name.",
      },
    },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary", children: "Save draft" } };
export const Ghost: Story = { args: { variant: "ghost", children: "Cancel" } };
export const Destructive: Story = {
  args: { variant: "destructive", children: "Cancel appointment" },
};
export const Disabled: Story = { args: { disabled: true, children: "Saving…" } };
export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };
export const ExtraLarge: Story = { args: { size: "xl" } };
export const IconOnly: Story = {
  args: {
    size: "icon",
    children: <Plus className="h-4 w-4" aria-hidden />,
    "aria-label": "Add appointment",
  },
  argTypes: { children: { control: false } },
};
