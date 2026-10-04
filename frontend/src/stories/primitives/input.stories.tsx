import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Input, Label } from "@/components/primitives/input";

const meta = {
  title: "Primitives/Input and Label",
  component: Input,
  subcomponents: { Label },
  tags: ["autodocs"],
  args: { id: "foundation-input", type: "text", placeholder: "Enter a name", disabled: false },
  argTypes: {
    type: { control: "select", options: ["text", "email", "tel", "password", "number"] },
  },
  parameters: {
    controls: { include: ["type", "placeholder", "disabled", "defaultValue"] },
    docs: {
      description: {
        component:
          "The real Input paired with the shared uppercase Label. Password fields own their reveal toggle; number inputs reject exponent and signed-number keys.",
      },
    },
  },
  render: (args) => (
    <div className="flex w-full max-w-md flex-col gap-2">
      <Label htmlFor={args.id}>Patient name</Label>
      <Input {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {};
export const Filled: Story = { args: { defaultValue: "Nimal Perera" } };
export const Disabled: Story = { args: { defaultValue: "Read only during save", disabled: true } };
export const Email: Story = { args: { type: "email", placeholder: "doctor@example.test" } };
export const Telephone: Story = { args: { type: "tel", placeholder: "0700000001" } };
export const Numeric: Story = {
  args: { type: "number", min: 0, step: 0.1, placeholder: "36.7" },
  render: (args) => (
    <div className="flex w-full max-w-md flex-col gap-2">
      <Label htmlFor={args.id}>Temperature (°C)</Label>
      <Input {...args} />
    </div>
  ),
};
export const PasswordReveal: Story = {
  args: { type: "password", placeholder: "Enter password", defaultValue: "SyntheticPassword42" },
  render: (args) => (
    <div className="flex w-full max-w-md flex-col gap-2">
      <Label htmlFor={args.id}>Password</Label>
      <Input {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Password", { selector: "input" });
    await expect(input).toHaveAttribute("type", "password");
    await userEvent.click(canvas.getByRole("button", { name: "Show password" }));
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("SyntheticPassword42");
    await expect(canvas.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Hide password" }));
    await expect(input).toHaveAttribute("type", "password");
  },
};
export const DisabledPassword: Story = {
  ...PasswordReveal,
  args: { ...PasswordReveal.args, disabled: true },
  play: undefined,
};
