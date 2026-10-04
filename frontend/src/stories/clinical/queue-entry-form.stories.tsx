import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { http, HttpResponse } from "msw";
import type { QueueEntryCreateRequest } from "@/types/api";
import { QueueEntryForm } from "@/components/healthworker/queue-entry-form";
import { patient, queueEntry } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Queue/Intake",
  component: QueueEntryForm,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "Capture a registered patient's walk-in or screening request, urgency, optional preferred doctor/target week, and notes. The server can return duplicate_pending, which opens the real confirmation UI before a forced separate entry is created.",
      },
    },
  },
  args: { defaultPatient: patient, onCreated: fn(), onCancel: fn() },
} satisfies Meta<typeof QueueEntryForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RegisteredPatient: Story = {};
export const ChoosePatientFirst: Story = { args: { defaultPatient: undefined } };
export const AddWalkIn: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox"), "Synthetic morning-clinic request");
    await userEvent.click(canvas.getByRole("button", { name: "Add to queue" }));
    await waitFor(() =>
      expect(args.onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: patient.id }),
      ),
    );
  },
};
export const RequestError: Story = {
  parameters: scenario({ error: true }),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add to queue" }));
  },
};
const duplicateScenario = scenario();
export const DuplicatePendingConfirmation: Story = {
  parameters: {
    ...duplicateScenario,
    msw: {
      handlers: [
        http.post("/api/queue", async ({ request }) => {
          const input = (await request.json()) as QueueEntryCreateRequest;
          if (!input.force)
            return HttpResponse.json(
              {
                detail: {
                  error: "duplicate_pending",
                  existing: [{ ...queueEntry, source: input.source }],
                },
              },
              { status: 409 },
            );
          return HttpResponse.json({ ...queueEntry, ...input, id: 3 }, { status: 201 });
        }),
        ...duplicateScenario.msw.handlers,
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add to queue" }));
    const confirm = await canvas.findByRole("button", { name: "Add as a separate entry" });
    await expect(args.onCreated).not.toHaveBeenCalled();
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(args.onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3, patientId: patient.id }),
      ),
    );
  },
};
