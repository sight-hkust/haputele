import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { SignatureCanvas, type SignatureCanvasHandle } from "@/components/doctor/signature-canvas";
import { Button } from "@/components/primitives/button";

function DoctorSignature(args: ComponentProps<typeof SignatureCanvas>) {
  const pad = useRef<SignatureCanvasHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <SignatureCanvas
        {...args}
        ref={pad}
        onChange={(next) => {
          setHasInk(next);
          setImage(null);
          args.onChange?.(next);
        }}
      />
      <Button disabled={!hasInk} onClick={() => setImage(pad.current?.toDataURL() ?? null)}>
        Preview drawn doctor signature
      </Button>
      {image && (
        <img
          src={image}
          alt="Doctor signature drawn in this story"
          className="max-w-full rounded-xl border border-[var(--border)]"
        />
      )}
    </div>
  );
}
const meta = {
  title: "Primitives/Signatures/Doctor SignatureCanvas",
  component: SignatureCanvas,
  tags: ["autodocs"],
  args: { height: 200, onChange: fn() },
  render: (args) => <DoctorSignature {...args} />,
  parameters: {
    controls: { include: ["height"] },
    docs: {
      description: {
        component:
          "Real consultation signing canvas, HiDPI backing store, signed/not-signed state and Clear. Draw with a pointer, then preview its actual PNG via the imperative ref. Unlike consent SignaturePad, onChange reports hasInk and a stroke must move to mark it signed.",
      },
    },
  },
} satisfies Meta<typeof SignatureCanvas>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DrawAndExport: Story = {};
export const TallerCanvas: Story = { args: { height: 280 } };
