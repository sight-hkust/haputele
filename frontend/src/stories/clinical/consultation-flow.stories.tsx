import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { ConsultationFlow } from "@/components/doctor/consultation-flow";
import { appointment, consultation, timestamp } from "../fixtures";
import { scenario } from "../scenario";

async function prescriptionStage(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Save & continue" }));
  await canvas.findByRole("button", { name: "Add diagnosis" });
  return canvas;
}
async function reviewStage(canvasElement: HTMLElement) {
  const canvas = await prescriptionStage(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Save & continue" }));
  await canvas.findByRole("button", { name: "Sign & submit" });
  return canvas;
}
const meta = {
  title: "Clinical/Consultation/Flow",
  component: ConsultationFlow,
  parameters: {
    ...scenario({
      role: "doctor",
      path: "/doctor/appointments/1/consultation",
      appointmentStatus: "awaiting_notes",
    }),
    docs: {
      description: {
        component:
          "The real three-stage consultation form. Leaving notes or prescription persists a draft; review offers no follow-up, an exact appointment, or a queue recommendation in 1–52 weeks. Every nonempty medication needs a generic name. The fixture doctor has a saved signature; a one-off signature requires an actual canvas stroke. API save/submit responses and saved signature image are synthetic, not legal signatures or backend PDF generation. These focused stories do not connect to a video service.",
      },
    },
  },
  args: { consultation, appointmentId: appointment.id },
} satisfies Meta<typeof ConsultationFlow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DraftNotes: Story = {};
export const EditNotesAndPersist: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText("Primary complaint"));
    await userEvent.type(canvas.getByLabelText("Primary complaint"), "Synthetic follow-up review");
    await reviewStage(canvasElement);
    await expect(canvas.getByText("Synthetic follow-up review")).toBeInTheDocument();
  },
};
export const PrescriptionStage: Story = {
  play: async ({ canvasElement }) => {
    await prescriptionStage(canvasElement);
  },
};
export const ReviewWithSavedSignature: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reviewStage(canvasElement);
    await canvas.findByRole("img", { name: "Your saved e-signature" });
    await expect(canvas.getByRole("button", { name: "Sign & submit" })).toBeEnabled();
  },
};
export const OneOffSignatureRequired: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reviewStage(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Draw a one-off signature instead" }),
    );
    await expect(canvas.getByRole("button", { name: "Sign & submit" })).toBeDisabled();
  },
};
export const FollowUpQueue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reviewStage(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /In N weeks/ }));
    await userEvent.click(canvas.getByRole("button", { name: "6 weeks" }));
    await expect(canvas.getByRole("spinbutton")).toHaveValue(6);
  },
};
export const ExactFollowUpAppointment: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reviewStage(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Book appointment/ }));
    await canvas.findByRole("button", { name: "Choose another appointment date" });
    await expect(canvas.getByRole("button", { name: "Sign & submit" })).toBeDisabled();
  },
};
export const InvalidMedicationBlocksSigning: Story = {
  args: { consultation: { ...consultation, medications: [{ genericName: "", dose: "500 mg" }] } },
  play: async ({ canvasElement }) => {
    const canvas = await reviewStage(canvasElement);
    await expect(canvas.getByRole("button", { name: "Sign & submit" })).toBeDisabled();
  },
};
export const InvalidFollowUpWeeks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reviewStage(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /In N weeks/ }));
    await userEvent.clear(canvas.getByRole("spinbutton"));
    await userEvent.type(canvas.getByRole("spinbutton"), "53");
    await expect(canvas.getByRole("button", { name: "Sign & submit" })).toBeDisabled();
  },
};
export const CompletedReadOnly: Story = {
  args: {
    consultation: { ...consultation, status: "completed", signedAt: timestamp },
    readOnly: true,
  },
  parameters: scenario({ role: "doctor", appointmentStatus: "completed" }),
};
export const FailedDraftSave: Story = {
  parameters: scenario({ role: "doctor", error: true }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save & continue" }));
    await canvas.findByRole("alert");
    await expect(canvas.getByLabelText("Primary complaint")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add diagnosis" })).not.toBeInTheDocument();
  },
};
