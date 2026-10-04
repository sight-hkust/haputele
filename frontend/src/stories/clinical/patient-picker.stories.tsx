import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { PatientPicker } from "@/components/healthworker/patient-picker";
import type { Patient } from "@/types/api";
import { patient } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Patients/Patient picker",
  component: PatientPicker,
  parameters: scenario(),
  args: { picked: null, onPick: fn(), onClear: fn() },
  render: function Picker(args) {
    const [picked, setPicked] = useState<Patient | null>(args.picked);
    return (
      <PatientPicker
        {...args}
        picked={picked}
        onPick={(value) => {
          setPicked(value);
          args.onPick(value);
        }}
        onClear={() => {
          setPicked(null);
          args.onClear();
        }}
      />
    );
  },
} satisfies Meta<typeof PatientPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SearchAndSelect: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText("Search by name or NID…"), patient.given);
    await userEvent.click(await canvas.findByRole("button", { name: /Nimal Perera/ }));
    await waitFor(() =>
      expect(args.onPick).toHaveBeenCalledWith(expect.objectContaining({ id: patient.id })),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Change" }));
    await expect(args.onClear).toHaveBeenCalled();
    await expect(canvas.getByRole("textbox")).toHaveValue("");
  },
};
export const Selected: Story = { args: { picked: patient } };
export const NoMatches: Story = {
  parameters: scenario({ empty: true }),
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("textbox"), "Unmatched patient");
  },
};
export const Searching: Story = {
  parameters: scenario({ loading: true }),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("textbox"));
  },
};
