import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { ConsultationFlow } from "@/components/doctor/consultation-flow";
import { Button } from "@/components/primitives/button";
import type { Consultation } from "@/types/api";
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

function ReopenableDraft(args: ComponentProps<typeof ConsultationFlow>) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(args.consultation);
  const [revision, setRevision] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <a
          href={`/doctor/appointments/${args.appointmentId}`}
          className="text-sm text-[var(--accent)]"
        >
          Back to appointment
        </a>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const saved = queryClient.getQueryData<Consultation>(["consultations", draft.id]);
            if (!saved) return;
            setDraft(saved);
            setRevision((value) => value + 1);
          }}
        >
          Reopen saved draft
        </Button>
      </div>
      <ConsultationFlow key={revision} {...args} consultation={draft} />
    </div>
  );
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
          "The real consultation form: explicit draft saves and stage transitions preserve clinical notes and partial prescriptions. Unsaved navigation offers stay/discard, with platform refresh/close protection. Every nonempty medication needs a generic name to sign. Follow-up and drawn signatures are saved only by signing, not by Save draft. The fixture doctor has a saved signature; API responses, images, and reopen-from-response are synthetic, not legal signatures, durable backend storage, PDF generation, or video calls.",
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

export const UnsavedExitCanStayThenSave: Story = {
  render: (args) => <ReopenableDraft {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const complaint = canvas.getByLabelText("Primary complaint");
    await userEvent.clear(complaint);
    await userEvent.type(complaint, "Synthetic interrupted encounter note");
    const originalConfirm = window.confirm;
    const stay = fn(() => false);
    window.confirm = stay;
    try {
      await userEvent.click(canvas.getByRole("link", { name: "Back to appointment" }));
      await expect(stay).toHaveBeenCalledOnce();
      await expect(complaint).toHaveValue("Synthetic interrupted encounter note");
    } finally {
      window.confirm = originalConfirm;
    }
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await canvas.findByText(/Clinical draft saved/);
    await userEvent.click(canvas.getByRole("button", { name: "Reopen saved draft" }));
    await expect(canvas.getByLabelText("Primary complaint")).toHaveValue(
      "Synthetic interrupted encounter note",
    );
  },
};

export const DoseOnlyMedicationSurvivesReopen: Story = {
  render: (args) => <ReopenableDraft {...args} />,
  args: { consultation: { ...consultation, medications: [] } },
  play: async ({ canvasElement }) => {
    const canvas = await prescriptionStage(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add medication" }));
    await userEvent.type(canvas.getByLabelText("Dose"), "500 mg");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await canvas.findByText(/Clinical draft saved/);
    await userEvent.click(canvas.getByRole("button", { name: "Reopen saved draft" }));
    await prescriptionStage(canvasElement);
    await expect(canvas.getByLabelText("Dose")).toHaveValue("500 mg");
    await expect(canvas.getByLabelText("Generic name *")).toHaveValue("");
    await userEvent.click(canvas.getByRole("button", { name: "Save & continue" }));
    await expect(await canvas.findByRole("button", { name: "Sign & submit" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await userEvent.type(canvas.getByLabelText("Generic name *"), "Paracetamol");
    await userEvent.click(canvas.getByRole("button", { name: "Save & continue" }));
    await expect(await canvas.findByRole("button", { name: "Sign & submit" })).toBeEnabled();
  },
};

export const FollowUpIsNotSavedWithDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reviewStage(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /In N weeks/ }));
    await userEvent.click(canvas.getByRole("button", { name: "6 weeks" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await canvas.findByText(/Clinical draft saved/);
    await expect(
      canvas.getByText(/Signing adds a follow-up recommendation in 6 weeks/),
    ).toBeInTheDocument();
    const originalConfirm = window.confirm;
    const stay = fn(() => false);
    window.confirm = stay;
    try {
      const refresh = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(refresh);
      await expect(refresh.defaultPrevented).toBe(true);
      const leave = new Event("app:confirm-leave", { cancelable: true });
      window.dispatchEvent(leave);
      await expect(leave.defaultPrevented).toBe(true);
      await expect(stay).toHaveBeenCalledOnce();
    } finally {
      window.confirm = originalConfirm;
    }
  },
};
