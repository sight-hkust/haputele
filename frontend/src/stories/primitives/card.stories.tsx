import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/primitives/card";
import { StatusBadge } from "@/components/primitives/status-badge";

const meta = {
  title: "Primitives/Card family",
  component: Card,
  subcomponents: { CardHeader, CardTitle, CardDescription, CardContent, CardFooter },
  tags: ["autodocs"],
  args: { variant: "default", interactive: false },
  argTypes: {
    variant: { control: "select", options: ["default", "elevated", "flat", "featured"] },
  },
  parameters: {
    controls: { include: ["variant", "interactive"] },
    docs: {
      description: {
        component:
          "All six production card components composed together. The interactive flag adds hover elevation only; it does not turn the div into a button or link.",
      },
    },
  },
  render: (args) => (
    <Card {...args} className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Upcoming appointment</CardTitle>
        <CardDescription>Synthetic patient · Nimal Perera</CardDescription>
      </CardHeader>
      <CardContent>
        <StatusBadge status="scheduled" />
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          Blood pressure review with Dr Anjali Silva.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="secondary" size="sm">
          View appointment
        </Button>
      </CardFooter>
    </Card>
  ),
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Elevated: Story = { args: { variant: "elevated" } };
export const Flat: Story = { args: { variant: "flat" } };
export const Featured: Story = { args: { variant: "featured" } };
export const InteractiveHover: Story = { args: { interactive: true } };
