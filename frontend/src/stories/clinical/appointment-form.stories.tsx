import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppointmentForm } from "@/components/healthworker/appointment-form";
import { appLocalToUtcIso } from "@/lib/format";
import { doctor, patient, today } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Appointments/Booking form",
  component: AppointmentForm,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "Real patient search, active-doctor filtering, and 15-minute slot picker. Selected wall-clock times are interpreted in the configured application timezone, not the browser timezone. The API remains authoritative for appointment conflicts.",
      },
    },
  },
  args: {
    doctors: [doctor],
    submitting: false,
    onSubmit: fn(),
    onCancel: fn(),
    onPatientChange: fn(),
  },
} satisfies Meta<typeof AppointmentForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NewBooking: Story = {};
export const ForRegisteredPatient: Story = {
  args: {
    defaultPatientId: patient.id,
    hidePatientPicker: true,
    patientLabel: `${patient.given} ${patient.family}`,
    defaultDoctorId: doctor.id,
  },
};
export const SubmitPrefilledBooking: Story = {
  args: {
    defaultPatientId: patient.id,
    hidePatientPicker: true,
    patientLabel: `${patient.given} ${patient.family}`,
    defaultDoctorId: doctor.id,
    defaultScheduledAt: `${today}T18:00`,
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Book appointment" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        patientId: patient.id,
        doctorId: doctor.id,
        scheduledAt: appLocalToUtcIso(`${today}T18:00`),
      }),
    );
  },
};
export const NoActiveDoctors: Story = { args: { doctors: [{ ...doctor, active: false }] } };
export const Booking: Story = { args: { submitting: true } };
export const SlotConflict: Story = {
  args: { errorMessage: "That slot is already booked. Choose another time." },
};
