import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
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
          "Native modal dialog with initial heading focus, platform focus containment/restoration, nested top-layer ordering and shared body-scroll lock. Escape and Close ask before discarding edited input; caller onClose can also refuse dismissal while saving. Backdrop clicks never dismiss; only the content body scrolls.",
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
    const trigger = canvas.getByRole("button", { name: "Open modal" });
    await userEvent.click(trigger);
    const dialog = await canvas.findByRole("dialog");
    await expect(dialog.matches(":modal")).toBe(true);
    await expect(
      within(dialog).getByRole("heading", { name: "Appointment details" }),
    ).toHaveFocus();
    await userEvent.type(within(dialog).getByLabelText("Reason for visit"), "Routine review");
    const originalConfirm = window.confirm;
    const confirm = fn(() => false);
    window.confirm = confirm;
    try {
      // userEvent does not synthesize the browser's dialog cancel default.
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      await expect(confirm).toHaveBeenCalledOnce();
      await expect(dialog.matches(":modal")).toBe(true);
      await expect(within(dialog).getByLabelText("Reason for visit")).toHaveValue("Routine review");
      confirm.mockReturnValue(true);
      await userEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
      await expect(args.onClose).toHaveBeenCalledOnce();
      await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
      await expect(trigger).toHaveFocus();
    } finally {
      window.confirm = originalConfirm;
    }
  },
};
export const KeyboardCloseReturnsFocus: Story = {
  args: { open: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open modal" });
    await userEvent.click(trigger);
    const dialog = await canvas.findByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};
