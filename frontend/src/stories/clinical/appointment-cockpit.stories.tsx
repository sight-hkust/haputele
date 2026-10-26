import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { AppointmentCockpit } from "@/components/healthworker/cockpit";
import type { AppointmentDetail, AppointmentStatus } from "@/types/api";
import { appointmentDetail, timestamp } from "../fixtures";
import { scenario } from "../scenario";

function detail(status: AppointmentStatus): AppointmentDetail {
  return {
    ...appointmentDetail,
    appointment: {
      ...appointmentDetail.appointment,
      status,
      ...(status === "cancelled" ? { cancellationReason: "Patient requested cancellation." } : {}),
    },
    preconsult:
      status === "scheduled" || status === "consent_pending" ? null : appointmentDetail.preconsult,
    consultation:
      status === "completed" && appointmentDetail.consultation
        ? { ...appointmentDetail.consultation, status: "completed", signedAt: timestamp }
        : appointmentDetail.consultation,
  };
}
const meta = {
  title: "Clinical/Appointments/Cockpit",
  component: AppointmentCockpit,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "The actual healthworker workflow for all seven appointment states: scheduled → consent_pending → data_collection → in_progress → awaiting_notes → completed, plus cancelled. Session consent gates vitals; master re-consent gates session consent. Capturing consent requires the patient's real drawn signature; these stories do not manufacture consent. LiveKit buttons remain production components, but token failure is simulated: no call, camera/microphone stream, or other participant is claimed. Completed prescriptions use synthetic PDF bytes; downloads exercise browser rendering, not backend PDF generation or medical validity.",
      },
    },
  },
  args: { data: detail("data_collection") },
} satisfies Meta<typeof AppointmentCockpit>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Scheduled: Story = {
  args: { data: detail("scheduled") },
  parameters: scenario({ appointmentStatus: "scheduled", sessionConsent: false }),
};
export const ConsentPending: Story = {
  args: { data: detail("consent_pending") },
  parameters: scenario({ appointmentStatus: "consent_pending" }),
};
export const DataCollection: Story = {};
export const InProgress: Story = {
  args: { data: detail("in_progress") },
  parameters: scenario({ appointmentStatus: "in_progress", livekitUnavailable: true }),
};
export const AwaitingNotes: Story = {
  args: { data: detail("awaiting_notes") },
  parameters: scenario({ appointmentStatus: "awaiting_notes" }),
};
export const Completed: Story = {
  args: { data: detail("completed") },
  parameters: scenario({ appointmentStatus: "completed" }),
};
export const Cancelled: Story = {
  args: { data: detail("cancelled") },
  parameters: scenario({ appointmentStatus: "cancelled" }),
};
export const NeedsReconsent: Story = {
  args: { data: { ...detail("scheduled"), masterConsentStatus: "needs_reconsent" } },
  parameters: scenario({
    appointmentStatus: "scheduled",
    needsReconsent: true,
    sessionConsent: false,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Record consent" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Re-record" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Patient agreed" })).toBeDisabled();
  },
};
export const SessionSignatureRequired: Story = {
  ...Scheduled,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Record consent" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Patient agreed" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "Patient declined" })).toBeEnabled();
  },
};
export const PrescriptionLoadError: Story = {
  args: { data: detail("completed") },
  parameters: scenario({ appointmentStatus: "completed", error: true }),
};
export const ReadyButReconsentRequired: Story = {
  args: { data: { ...detail("data_collection"), masterConsentStatus: "needs_reconsent" } },
  parameters: scenario({ appointmentStatus: "data_collection", needsReconsent: true }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Start meeting" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Re-record" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Patient agreed" })).toBeDisabled();
  },
};
export const CompletedPrescriptionDisclosure: Story = {
  ...Completed,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("link", { name: "Open" });
    const preview = canvas.getByTitle("Prescription for appointment 1");
    await expect(preview).not.toBeVisible();
    await userEvent.click(canvas.getByText("Preview signed prescription"));
    await expect(preview).toBeVisible();
    await userEvent.click(canvas.getByText("Preview signed prescription"));
    await expect(preview).not.toBeVisible();
  },
};
