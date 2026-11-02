import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { Button } from "@/components/primitives/button";
import { CameraCaptureModal } from "@/components/primitives/camera-capture-modal";

function blockCamera(name: "NotAllowedError" | "NotReadableError" | null) {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: name
      ? {
          getUserMedia: fn(async () => {
            throw new DOMException("Storybook camera simulation; no device opened", name);
          }),
        }
      : undefined,
  });
  return () => {
    if (descriptor) Object.defineProperty(navigator, "mediaDevices", descriptor);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  };
}
function CameraHarness(args: ComponentProps<typeof CameraCaptureModal>) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open camera
      </Button>
      <CameraCaptureModal
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
  title: "Primitives/CameraCaptureModal",
  component: CameraCaptureModal,
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
    onCapture: fn(),
    maxDimension: 1920,
    quality: 0.92,
    filename: "storybook-photo.jpg",
  },
  beforeEach: () => blockCamera("NotAllowedError"),
  render: (args) => (
    <div className="p-6">
      <CameraHarness key={String(args.open)} {...args} />
    </div>
  ),
  parameters: {
    layout: "fullscreen",
    controls: { include: ["open", "maxDimension", "quality", "filename"] },
    docs: {
      description: {
        component:
          "Real camera modal in deterministic safe error states. Story-local getUserMedia rejects and is restored on cleanup: no permission prompt, video stream, capture or uploaded file is fabricated. Live capture requires a secure context, permission and real camera hardware and must be exercised in the application. Capture remains disabled on these paths.",
      },
    },
  },
} satisfies Meta<typeof CameraCaptureModal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PermissionDenied: Story = {};
export const DeviceUnavailable: Story = { beforeEach: () => blockCamera("NotReadableError") };
export const UnsupportedBrowser: Story = { beforeEach: () => blockCamera(null) };
export const Closed: Story = { args: { open: false } };
