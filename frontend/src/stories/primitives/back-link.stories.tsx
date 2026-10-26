import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BackLink } from "@/components/primitives/back-link";
import { scenario } from "@/stories/scenario";

const meta = {
  title: "Primitives/BackLink",
  component: BackLink,
  tags: ["autodocs"],
  args: { href: "/healthworker/appointments", children: "Back to appointments" },
  argTypes: { children: { control: "text" } },
  parameters: {
    ...scenario({ path: "/healthworker/appointments/1" }),
    docs: {
      description: {
        component:
          "Real Next Link sharing the secondary button treatment. Storybook's App Router mock records navigation instead of loading a production route.",
      },
    },
  },
} satisfies Meta<typeof BackLink>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Appointments: Story = {};
export const Patients: Story = {
  args: { href: "/healthworker/patients", children: "Back to patients" },
};
