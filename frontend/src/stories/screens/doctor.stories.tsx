import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Screen } from "../screen";
import { scenario } from "../scenario";

const meta = {
  title: "Screens/Doctor",
  component: Screen,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: { path: { control: false } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TodayWorklist: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor" }),
};
export const EmptyWorklist: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor", empty: true }),
};
export const WorklistError: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor", error: true }),
};
export const ReadyPatientWorklist: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor", appointmentStatus: "data_collection" }),
};
export const UnfinishedNotesWorklist: Story = {
  args: { path: "/doctor" },
  parameters: scenario({ role: "doctor", appointmentStatus: "awaiting_notes" }),
};
export const WaitingForHealthworker: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "scheduled" }),
};
export const PatientReady: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "awaiting_notes" }),
};
export const ReadyNeedsConsentRenewal: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({
    role: "doctor",
    appointmentStatus: "data_collection",
    needsReconsent: true,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: /renew patient consent/i });
    await expect(canvas.queryByRole("heading", { name: /^Ready/ })).not.toBeInTheDocument();
    // Recording renewed consent changes the gate, not the appointment status.
    await fetch("/api/patients/1/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agreed: true }),
    });
    await userEvent.click(canvas.getByRole("button", { name: "Refresh status" }));
    await canvas.findByRole("heading", { name: /^Ready/ });
  },
};
export const LiveAppointment: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "in_progress" }),
};
export const ConsultationDraft: Story = {
  args: { path: "/doctor/consultations/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "awaiting_notes" }),
};
export const ConsultationKeyboardFocus: Story = {
  ...ConsultationDraft,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const complaint = await canvas.findByLabelText("Primary complaint");
    const symptoms = canvas.getByLabelText("Associated symptoms");
    const doc = canvasElement.ownerDocument;
    await waitFor(() => expect(doc.documentElement.style.scrollPaddingTop).not.toBe(""));
    await userEvent.click(symptoms);
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await expect(complaint).toHaveFocus();
    await waitFor(() => {
      const field = complaint.getBoundingClientRect();
      const safety = canvas
        .getByLabelText("Patient identity and allergy safety")
        .getBoundingClientRect();
      const actionBar = canvasElement.querySelector("[data-consultation-actions]");
      if (!actionBar) throw new Error("Consultation actions are unavailable");
      const actions = actionBar.getBoundingClientRect();
      expect(field.top).toBeGreaterThanOrEqual(safety.bottom);
      expect(field.bottom).toBeLessThanOrEqual(actions.top);
      expect(doc.elementFromPoint(field.left + field.width / 2, field.top + field.height / 2)).toBe(
        complaint,
      );
    });
  },
};
export const ConsultationWithCallPanel: Story = {
  args: { path: "/doctor/consultations/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "in_progress" }),
};
export const LockedConsultation: Story = {
  args: { path: "/doctor/consultations/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "completed" }),
};
export const CompletedAppointment: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "completed" }),
};
export const AvailabilityPlanner: Story = {
  args: { path: "/doctor/availability" },
  parameters: scenario({ role: "doctor" }),
};
export const PracticeProfile: Story = {
  args: { path: "/doctor/profile" },
  parameters: scenario({ role: "doctor" }),
};
