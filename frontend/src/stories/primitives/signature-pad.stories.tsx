import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useCallback, useRef, useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SignaturePad, type SignaturePadHandle } from "@/components/consent/signature-pad";
import { Button } from "@/components/primitives/button";

function ConsentSignature(args: ComponentProps<typeof SignaturePad>) {
  const pad = useRef<SignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const [image, setImage] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
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
      <Button variant="secondary" onClick={() => setNarrow((value) => !value)}>
        Resize capture area
      </Button>
      <div style={{ width: narrow ? "65%" : "100%" }}>
        <SignaturePad {...args} ref={pad} onChange={changed} />
      </div>
      <Button
        disabled={empty || args.disabled}
        onClick={() => setImage(pad.current?.toDataURL() ?? null)}
      >
        Preview patient signature
      </Button>
      {image && (
        <img
          src={image}
          alt="Captured patient signature preview"
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
          "Patient finger/stylus/mouse capture or PNG/JPEG upload with the existing crop editor. Exports the actual artifact as PNG ≤200 KiB. Capture state and strokes survive parent width, orientation and DPR changes; no PHI is persisted.",
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
export const ResizePreservesCapture: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const drawing = canvas.getByRole("img", { name: /drawing area/ }) as HTMLCanvasElement;
    const rect = drawing.getBoundingClientRect();
    const oldWidth = drawing.width;
    await userEvent.pointer([
      {
        keys: "[MouseLeft>]",
        target: drawing,
        coords: { clientX: rect.left + 20, clientY: rect.top + 50 },
      },
      { target: drawing, coords: { clientX: rect.left + 90, clientY: rect.top + 80 } },
      { keys: "[/MouseLeft]", target: drawing },
    ]);
    const preview = canvas.getByRole("button", { name: "Preview patient signature" });
    await expect(preview).toBeEnabled();
    await userEvent.click(preview);
    const originalImage = canvas.getByRole("img", {
      name: "Captured patient signature preview",
    }) as HTMLImageElement;
    const originalPng = originalImage.src;
    await userEvent.click(canvas.getByRole("button", { name: "Resize capture area" }));
    await waitFor(() => expect(drawing.width).not.toBe(oldWidth));
    await expect(preview).toBeEnabled();
    await userEvent.click(preview);
    const image = canvas.getByRole("img", {
      name: "Captured patient signature preview",
    }) as HTMLImageElement;
    await expect(image.src).toMatch(/^data:image\/png;base64,/);
    await expect(image.src).toBe(originalPng);
    await expect(atob(image.src.split(",")[1]).length).toBeLessThanOrEqual(200 * 1024);
  },
};
export const UploadPatientSignatureArtifact: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Test-only handwritten strokes in a genuine PNG, not a typed attestation.
    const artifact = document.createElement("canvas");
    artifact.width = 240;
    artifact.height = 100;
    const context = artifact.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    context.fillStyle = "white";
    context.fillRect(0, 0, 240, 100);
    context.strokeStyle = "#0f172a";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(20, 70);
    context.bezierCurveTo(80, 10, 10, 10, 50, 75);
    context.bezierCurveTo(100, 25, 130, 85, 210, 35);
    context.stroke();
    const blob = await new Promise<Blob | null>((resolve) => artifact.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encoding unavailable");
    await userEvent.upload(
      canvas.getByLabelText("Upload image of patient signature"),
      new File([blob], "synthetic-patient-signature.png", { type: "image/png" }),
    );
    const dialog = await canvas.findByRole("dialog", { name: "Crop patient signature" });
    const apply = within(dialog).getByRole("button", { name: "Apply" });
    await waitFor(() => expect(apply).toBeEnabled());
    await userEvent.click(apply);
    const preview = canvas.getByRole("button", { name: "Preview patient signature" });
    await expect(preview).toBeEnabled();
    await userEvent.click(preview);
    const image = canvas.getByRole("img", {
      name: "Captured patient signature preview",
    }) as HTMLImageElement;
    await expect(image.src).toMatch(/^data:image\/png;base64,/);
    await expect(atob(image.src.split(",")[1]).length).toBeLessThanOrEqual(200 * 1024);
  },
};
