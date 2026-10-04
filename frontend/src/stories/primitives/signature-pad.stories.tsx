import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useCallback, useRef, useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { SignaturePad, type SignaturePadHandle } from "@/components/consent/signature-pad";
import { Button } from "@/components/primitives/button";

function ConsentSignature(args: ComponentProps<typeof SignaturePad>) {
  const pad = useRef<SignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const [image, setImage] = useState<string | null>(null);
  const changed = useCallback(
    (next: boolean) => {
      setEmpty(next);
      setImage(null);
      args.onChange?.(next);
    },
    [args.onChange],
  );
  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <SignaturePad {...args} ref={pad} onChange={changed} />
      <Button
        disabled={empty || args.disabled}
        onClick={() => setImage(pad.current?.toDataURL() ?? null)}
      >
        Preview drawn consent signature
      </Button>
      {image && (
        <img
          src={image}
          alt="Signature drawn in this story"
          className="max-w-full rounded-xl border border-[var(--border)]"
        />
      )}
    </div>
  );
}
const meta = {
  title: "Primitives/Signatures/Consent SignaturePad",
  component: SignaturePad,
  tags: ["autodocs"],
  args: { label: "Patient signature", height: 180, disabled: false, onChange: fn() },
  parameters: {
    controls: { include: ["label", "height", "disabled"] },
    docs: {
      description: {
        component:
          "Real finger/stylus/mouse consent canvas with imperative PNG export and Clear. Preview is enabled only after actual pointer ink. Consent onChange reports isEmpty (the inverse of the doctor's hasInk). Resizing the parent clears the canvas by design; no synthetic signature is injected.",
      },
    },
  },
  render: (args) => <ConsentSignature {...args} />,
} satisfies Meta<typeof SignaturePad>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DrawAndExport: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const TallerPad: Story = { args: { height: 260 } };
