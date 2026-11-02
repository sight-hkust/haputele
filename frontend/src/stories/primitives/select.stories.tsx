import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { Label } from "@/components/primitives/input";
import { Select } from "@/components/primitives/select";

function SelectField(args: ComponentProps<typeof Select>) {
  const [value, setValue] = useState("si");
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <Label htmlFor="patient-language">Language</Label>
      <Select
        {...args}
        id="patient-language"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          args.onChange?.(event);
        }}
      >
        <option value="si">Sinhala</option>
        <option value="ta">Tamil</option>
        <option value="en">English</option>
      </Select>
    </div>
  );
}
const meta = {
  title: "Primitives/Select",
  component: Select,
  tags: ["autodocs"],
  args: { disabled: false },
  render: (args) => <SelectField {...args} />,
  parameters: {
    controls: { include: ["disabled"] },
    docs: {
      description: {
        component:
          "Native select with production arrow and focus treatment. This controlled harness updates the selected language without replacing the real control.",
      },
    },
  },
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Language: Story = {};
export const Disabled: Story = { args: { disabled: true } };
