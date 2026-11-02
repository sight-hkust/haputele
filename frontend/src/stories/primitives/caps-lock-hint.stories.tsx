import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CapsLockHint } from "@/components/primitives/caps-lock-hint";
import { Input, Label } from "@/components/primitives/input";
import { useCapsLock } from "@/lib/use-caps-lock";

function KeyboardPassword() {
  const { capsLockOn, capsLockProps, hintId } = useCapsLock();
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <Label htmlFor="keyboard-password">Password</Label>
      <Input id="keyboard-password" type="password" {...capsLockProps} />
      <CapsLockHint id={hintId} show={capsLockOn} />
    </div>
  );
}
const meta = {
  title: "Primitives/CapsLockHint",
  component: CapsLockHint,
  tags: ["autodocs"],
  args: { id: "caps-lock-warning", show: true },
  parameters: {
    controls: { include: ["show"] },
    docs: {
      description: {
        component:
          "Polite status hint, not an interrupting alert. Visible/Hidden isolate the presentational prop; KeyboardDetection uses the real useCapsLock hook and only displays after the focused input receives a browser event reporting Caps Lock. Storybook cannot determine an OS lock state without that event.",
      },
    },
  },
  render: (args) => (
    <div className="flex w-full max-w-md flex-col gap-2">
      <Label htmlFor="caps-password">Password</Label>
      <Input
        id="caps-password"
        type="password"
        aria-describedby={args.show ? args.id : undefined}
      />
      <CapsLockHint {...args} />
    </div>
  ),
} satisfies Meta<typeof CapsLockHint>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Visible: Story = {};
export const Hidden: Story = { args: { show: false } };
export const KeyboardDetection: Story = { render: () => <KeyboardPassword /> };
