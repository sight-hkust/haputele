import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Label } from "@/components/primitives/input";
import { Textarea } from "@/components/primitives/select";

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: {
    id: "clinical-notes",
    rows: 4,
    placeholder: "Describe the patient's main concern",
    disabled: false,
  },
  render: (args) => (
    <div className="flex w-full max-w-lg flex-col gap-2">
      <Label htmlFor={args.id}>Primary complaint</Label>
      <Textarea {...args} />
    </div>
  ),
  parameters: {
    controls: { include: ["rows", "placeholder", "disabled", "defaultValue"] },
    docs: {
      description: {
        component:
          "Resizable native multiline field using the same production tokens as Input and Select.",
      },
    },
  },
} satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Filled: Story = {
  args: { defaultValue: "Blood pressure review. No new symptoms reported." },
};
export const Disabled: Story = { args: { defaultValue: "Submitted notes", disabled: true } };
