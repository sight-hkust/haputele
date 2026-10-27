import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { delay, http, HttpResponse } from "msw";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { Button } from "@/components/primitives/button";
import { QrCaptureModal } from "@/components/primitives/qr-capture-modal";
import { scenario } from "@/stories/scenario";
import type { CapturePurpose, CaptureSession, CaptureSessionStatus } from "@/types/api";

function captureParameters(
  state: "waiting" | "expired" | "error" | "loading",
  role: "healthworker" | "admin" = "healthworker",
) {
  const base = scenario({ role });
  let purpose: CapturePurpose = "appointment_attachment";
  const expiresAt = new Date(Date.now() + 600_000).toISOString();
  return {
    ...base,
    msw: {
      handlers: [
        http.post("/api/capture/sessions", async ({ request }) => {
          if (state === "loading") await delay("infinite");
          if (state === "error")
            return HttpResponse.json({ detail: { error: "network_error" } }, { status: 503 });
          purpose = ((await request.json()) as { purpose: CapturePurpose }).purpose;
          return HttpResponse.json({
            id: 901,
            token: "storybook-inert-capture-token",
            purpose,
            expiresAt,
          } satisfies CaptureSession);
        }),
        http.get("/api/capture/sessions/:id", () =>
          HttpResponse.json({
            id: 901,
            purpose,
            expiresAt,
            closed: state === "expired",
            uploadCount: 0,
            relayReady: false,
          } satisfies CaptureSessionStatus),
        ),
        http.delete("/api/capture/sessions/:id", () => new HttpResponse(null, { status: 204 })),
        ...base.msw.handlers,
      ],
    },
  };
}
function QrHarness(args: ComponentProps<typeof QrCaptureModal>) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Use phone camera
      </Button>
      <QrCaptureModal
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
  title: "Primitives/QRCaptureModal",
  component: QrCaptureModal,
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: fn(),
    purpose: "appointment_attachment",
    appointmentId: 1,
    onRelayReceived: fn(),
  },
  argTypes: { purpose: { control: "select", options: ["appointment_attachment", "rubber_stamp"] } },
  render: (args) => (
    <div className="p-6">
      <QrHarness key={`${args.open}-${args.purpose}`} {...args} />
    </div>
  ),
  parameters: {
    ...captureParameters("waiting"),
    layout: "fullscreen",
    controls: { include: ["open", "purpose", "title"] },
    docs: {
      description: {
        component:
          "Real QR-session modal, session creation/polling, expiry, regeneration, retry and teardown. MSW returns an inert story-only token and zero photos; scanning it cannot provide a working phone capture endpoint. No phone upload or relay success is claimed. End-to-end transfer requires the deployed backend and a phone able to reach it; camera permission is requested on that phone, not by this desktop component.",
      },
    },
  },
} satisfies Meta<typeof QrCaptureModal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WaitingForAttachment: Story = {};
export const WaitingForStampRelay: Story = {
  args: { purpose: "rubber_stamp", appointmentId: undefined, title: "Photograph rubber stamp" },
  parameters: captureParameters("waiting", "admin"),
};
export const ExpiredCode: Story = { parameters: captureParameters("expired") };
export const SessionCreationError: Story = { parameters: captureParameters("error") };
export const GeneratingCode: Story = { parameters: captureParameters("loading") };
export const Closed: Story = { args: { open: false } };
