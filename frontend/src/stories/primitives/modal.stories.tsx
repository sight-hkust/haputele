import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/components/primitives/button";
import { Input, Label } from "@/components/primitives/input";
import { Modal } from "@/components/primitives/modal";

function ModalHarness(args: ComponentProps<typeof Modal>) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal
        {...args}
        open={open}
        onClose={() => {
          setOpen(false);
          args.onClose();
        }}
      >
        {args.children}
      </Modal>
    </>
  );
}
const meta = {
  title: "Primitives/Modal",
  component: Modal,
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
    title: "Appointment details",
    description: "Review the details before saving.",
    children: (
      <div className="flex flex-col gap-2">
        <Label htmlFor="modal-reason">Reason for visit</Label>
        <Input id="modal-reason" placeholder="Enter primary complaint" />
      </div>
    ),
  },
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    children: { control: false },
  },
  parameters: {
    layout: "fullscreen",
    controls: { include: ["open", "title", "description"] },
    docs: {
      description: {
        component:
          "Real animated modal and body-scroll lock. It deliberately closes only through X or a caller's explicit action, not Escape or backdrop. The component does not implement a focus trap. The harness handles open/close without replacing the modal.",
      },
    },
  },
  render: (args) => (
    <div className="p-6">
      <ModalHarness key={String(args.open)} {...args} />
    </div>
  ),
} satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const Closed: Story = { args: { open: false } };
export const LongScrollableContent: Story = {
  args: {
    children: (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 16 }, (_, index) => (
          <p key={index} className="text-sm text-[var(--muted-foreground)]">
            Section {index + 1}: the body scrolls while the modal title and close button remain
            available.
          </p>
        ))}
      </div>
    ),
  },
};
export const ExplicitClose: Story = {
  args: { open: false },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open modal" }));
    const dialog = await canvas.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Reason for visit"), "Routine review");
    await userEvent.keyboard("{Escape}");
    await expect(dialog).toBeInTheDocument();
    await expect(within(dialog).getByLabelText("Reason for visit")).toHaveValue("Routine review");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
