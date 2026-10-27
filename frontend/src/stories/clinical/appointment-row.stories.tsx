import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppointmentRow } from "@/components/healthworker/appointment-row";
import { calendarAppointment } from "../fixtures";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Appointments/List row",
  component: AppointmentRow,
  parameters: scenario(),
  args: { appointment: calendarAppointment, selected: false, onSelect: fn() },
  render: function Row(args) {
    const [selected, setSelected] = useState(args.selected);
    return (
      <ul>
        <AppointmentRow
          {...args}
          selected={selected}
          onSelect={() => {
            setSelected(true);
            args.onSelect();
          }}
        />
      </ul>
    );
  },
} satisfies Meta<typeof AppointmentRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unselected: Story = {};
export const Selected: Story = { args: { selected: true } };
export const Completed: Story = {
  args: { appointment: { ...calendarAppointment, status: "completed" } },
};
export const Cancelled: Story = {
  args: { appointment: { ...calendarAppointment, status: "cancelled" } },
};
export const SelectForCalendar: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await expect(args.onSelect).toHaveBeenCalled();
  },
};
