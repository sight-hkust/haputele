import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { Button } from "@/components/primitives/button";
import { ImagePreviewModal } from "@/components/primitives/image-preview-modal";
import { demoImage } from "@/stories/fixtures";

function PreviewHarness(args: ComponentProps<typeof ImagePreviewModal>) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Preview attachment
      </Button>
      <ImagePreviewModal
        {...args}
        open={open}
        onClose={() => {
          setOpen(false);
          args.onClose();
        }}
      />
    </>
  );
}
const meta = {
  title: "Primitives/ImagePreviewModal",
  component: ImagePreviewModal,
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoImage)}`,
    alt: "Synthetic report illustration, not a medical record",
    title: "demo-report.svg",
  },
  parameters: {
    layout: "fullscreen",
    controls: { include: ["open", "title", "alt"] },
    docs: {
      description: {
        component:
          "Production attachment lightbox with explicit close, scroll lock and contained image sizing. The in-memory illustration is synthetic. Escape/backdrop do not close; an omitted title falls back to alt text.",
      },
    },
  },
  render: (args) => (
    <div className="p-6">
      <PreviewHarness key={String(args.open)} {...args} />
    </div>
  ),
} satisfies Meta<typeof ImagePreviewModal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Attachment: Story = {};
export const Closed: Story = { args: { open: false } };
export const AltTextHeading: Story = { args: { title: null } };
