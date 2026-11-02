import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Screen } from "./screen";
import { scenario } from "./scenario";

const meta = {
  title: "Journeys/End to end",
  component: Screen,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: { path: { control: false } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InitializeClinic: Story = {
  args: { path: "/setup" },
  parameters: scenario({ role: null, initialized: false }),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("Verify the one-time setup token", async () => {
      await userEvent.type(await canvas.findByLabelText("Setup token"), "storybook-setup-token");
      await userEvent.click(canvas.getByRole("button", { name: "Verify token" }));
    });
    await step("Configure the institute and system administrator", async () => {
      await userEvent.type(await canvas.findByLabelText("Username"), "demo.operator");
      await userEvent.type(canvas.getByLabelText("Password", { exact: true }), "Demo-Clinic-2026!");
      await userEvent.type(canvas.getByLabelText("Confirm password"), "Demo-Clinic-2026!");
      await userEvent.type(canvas.getByLabelText("Institute name"), "Storybook Clinic");
      await userEvent.type(canvas.getByPlaceholderText("Address line"), "Synthetic clinic address");
      await userEvent.type(canvas.getByLabelText("Contact phone"), "0700000000");
      await userEvent.type(canvas.getByLabelText("Contact email"), "clinic@example.test");
      await userEvent.click(canvas.getByRole("button", { name: "Initialize system" }));
    });
    await step("Finish optional team setup and enter the system workspace", async () => {
      await userEvent.click(await canvas.findByRole("button", { name: "Skip — finish setup" }));
      await canvas.findByDisplayValue("Storybook Clinic");
      await expect(canvas.queryByLabelText("Setup token")).not.toBeInTheDocument();
    });
  },
};

export const SignInAndSearchPatients: Story = {
  args: { path: "/login" },
  parameters: scenario({ role: "healthworker", signedOut: true }),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("Sign in to the healthworker workspace", async () => {
      await userEvent.type(await canvas.findByLabelText("Username"), "demo.healthworker");
      await userEvent.type(canvas.getByLabelText("Password"), "Demo-Clinic-2026!");
      await userEvent.click(canvas.getByRole("button", { name: /Sign in/ }));
      await canvas.findByRole("link", { name: "Patients" });
    });
    await step("Find a registered patient and open the record", async () => {
      await userEvent.click(canvas.getByRole("link", { name: "Patients" }));
      await userEvent.type(await canvas.findByPlaceholderText(/Search/), "Nimal");
      await userEvent.click(await canvas.findByText("Nimal Perera"));
      await canvas.findByRole("heading", { name: "Nimal Perera" });
      await expect(canvas.queryByRole("button", { name: /Sign in/ })).not.toBeInTheDocument();
    });
  },
};

export const RegisterPatientWithConsent: Story = {
  args: { path: "/healthworker/patients/new" },
  parameters: scenario(),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("Capture a real synthetic signature stroke before continuing", async () => {
      const agree = await canvas.findByRole("button", { name: "Patient agreed — continue" });
      await expect(agree).toBeDisabled();
      const pad = canvasElement.querySelector("canvas");
      if (!pad) throw new Error("Consent canvas missing");
      // Let the production ResizeObserver finish its initial canvas sizing.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const bounds = pad.getBoundingClientRect();
      await userEvent.pointer([
        {
          target: pad,
          keys: "[MouseLeft>]",
          coords: { clientX: bounds.left + 30, clientY: bounds.top + 60 },
        },
        { target: pad, coords: { clientX: bounds.left + 120, clientY: bounds.top + 90 } },
        { target: pad, keys: "[/MouseLeft]" },
      ]);
      await waitFor(() => expect(agree).toBeEnabled());
      await userEvent.click(agree);
    });
    await step("Register demographics and open the newly created record", async () => {
      await userEvent.type(await canvas.findByLabelText("Given name"), "Mala");
      await userEvent.type(canvas.getByLabelText("Family name"), "Fernando");
      await userEvent.type(canvas.getByLabelText("Date of birth"), "18051974");
      await userEvent.selectOptions(canvas.getByLabelText("Gender"), "female");
      await userEvent.selectOptions(canvas.getByLabelText("Preferred language"), "si");
      await userEvent.click(canvas.getByRole("button", { name: "Register patient" }));
      await canvas.findByText("Mala Fernando");
      await expect(
        canvas.queryByRole("button", { name: "Register patient" }),
      ).not.toBeInTheDocument();
    });
  },
};

export const BookPendingQueueEntry: Story = {
  args: { path: "/healthworker/appointments?bookFromQueue=1" },
  parameters: scenario(),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("Book the selected patient from the pending queue", async () => {
      const book = await canvas.findByRole("button", { name: "Book from queue" });
      await waitFor(() => expect(book).toBeEnabled());
      await userEvent.click(book);
      await canvas.findByRole("button", { name: "Record consent" });
    });
    await step("Return to the queue and observe that the entry is no longer pending", async () => {
      await userEvent.click(canvas.getByRole("link", { name: "Queue" }));
      await waitFor(() =>
        expect(canvas.queryByText("Blood pressure review")).not.toBeInTheDocument(),
      );
      await canvas.findByText("Synthetic urgent walk-in");
    });
  },
};

export const WriteSignAndQueueFollowUp: Story = {
  args: { path: "/doctor/appointments/1" },
  parameters: scenario({ role: "doctor", appointmentStatus: "awaiting_notes" }),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("Begin the patient consultation and persist notes", async () => {
      await userEvent.click(
        await canvas.findByRole("button", { name: /^(Begin|Resume) consultation$/ }),
      );
      const complaint = await canvas.findByLabelText("Primary complaint");
      await userEvent.clear(complaint);
      await userEvent.type(complaint, "Synthetic blood pressure follow-up");
      await userEvent.click(canvas.getByRole("button", { name: "Save & continue" }));
    });
    await step("Review the prescription and recommend review in six weeks", async () => {
      await canvas.findByRole("button", { name: "Add diagnosis" });
      await userEvent.click(canvas.getByRole("button", { name: "Save & continue" }));
      await userEvent.click(await canvas.findByRole("button", { name: /In N weeks/ }));
      await userEvent.click(canvas.getByRole("button", { name: "6 weeks" }));
      await canvas.findByRole("img", { name: "Your saved e-signature" });
      await userEvent.click(canvas.getByRole("button", { name: "Sign & submit" }));
    });
    await step("Observe the completed appointment and locked clinical record", async () => {
      await canvas.findByRole("link", { name: "View record" });
      await canvas.findByText(/Requested in 6 weeks/);
      await expect(
        canvas.queryByRole("button", { name: /^(Begin|Resume) consultation$/ }),
      ).not.toBeInTheDocument();
    });
  },
};

export const InviteDoctorAndReturnToRoster: Story = {
  args: { path: "/admin/doctors/new" },
  parameters: scenario({ role: "admin" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText(/Doctor.s email/),
      "journey.doctor@example.test",
    );
    await userEvent.type(canvas.getByLabelText("Family name (optional)"), "Demo");
    await userEvent.click(canvas.getByRole("button", { name: "Send invite" }));
    await canvas.findByText("journey.doctor@example.test");
    await expect(canvas.queryByRole("button", { name: "Send invite" })).not.toBeInTheDocument();
  },
};

export const ApproveDoctorApplication: Story = {
  args: { path: "/admin/doctors/1" },
  parameters: scenario({ role: "admin", doctorStatus: "awaiting_approval" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Approve" }));
    await canvas.findByRole("button", { name: /Deactivate/ });
    await expect(canvas.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  },
};

export const UpdateInstituteIdentity: Story = {
  args: { path: "/sysadmin" },
  parameters: scenario({ role: "sys-admin" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByDisplayValue("HapuTele Demo Clinic");
    await userEvent.clear(name);
    await userEvent.type(name, "Storybook Outreach Clinic");
    const save = canvas
      .getAllByRole("button", { name: "Save changes" })
      .find((button) => !button.hasAttribute("disabled"));
    if (!save) throw new Error("Institute save action missing");
    await userEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    await expect(canvas.getByDisplayValue("Storybook Outreach Clinic")).toBeInTheDocument();
  },
};
