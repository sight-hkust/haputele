import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DoctorSlotPicker } from "@/components/doctor/doctor-slot-picker";
import { doctor, today } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Scheduling/Doctor slot picker",
  component: DoctorSlotPicker,
  parameters: {
    ...scenario(),
    docs: {
      description: {
        component:
          "Production 15-minute picker subtracts booked/past slots from declared availability and offers custom dates/times with an outside-availability warning. Dates are relative; remaining slots depend on actual current time. A custom date without a time is not a complete selection. The parent receives application-timezone datetime-local values.",
      },
    },
  },
  args: { doctorId: doctor.id, value: "", onChange: fn() },
  render: function Picker(args) {
    const [value, setValue] = useState(args.value);
    return (
      <DoctorSlotPicker
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof DoctorSlotPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OpenSlots: Story = {};
export const OutsideDeclaredAvailability: Story = { args: { value: `${today}T18:00` } };
export const FollowUpInFourWeeks: Story = { args: { defaultWeeksAhead: 4 } };
export const NoAvailability: Story = { parameters: scenario({ empty: true }) };
export const Loading: Story = { parameters: scenario({ loading: true }) };
export const BrowseWeeks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Previous week" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Next week" }));
    await expect(canvas.getByRole("button", { name: "Previous week" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "This week" }));
    await expect(canvas.getByRole("button", { name: "Previous week" })).toBeDisabled();
  },
};
