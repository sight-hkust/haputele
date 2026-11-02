import { useState } from "react";
import { addWeeks, startOfWeek } from "date-fns";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { WeekGrid, type CellKey } from "@/components/doctor/week-grid";
import { scenario } from "../scenario";
const meta = {
  title: "Clinical/Scheduling/Availability week grid",
  component: WeekGrid,
  parameters: {
    ...scenario({ role: "doctor", path: "/doctor/availability" }),
    docs: {
      description: {
        component:
          "30-minute availability painter with date-aware labels, disabled past/read-only cells, roving arrow-key focus and Enter/Space toggles. Native 44px day/start/end interval controls provide a touch alternative; striped booked cells remain informational. Edits preserve the existing Save week transaction.",
      },
    },
  },
  args: {
    weekStart: addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1),
    cells: new Set<CellKey>(["0-4", "0-5", "0-6", "2-8", "2-9"]),
    bookedCells: new Set<CellKey>(["0-5", "4-10"]),
    onChange: fn(),
  },
  render: function Grid(args) {
    const [cells, setCells] = useState(args.cells);
    return (
      <WeekGrid
        {...args}
        cells={cells}
        onChange={(next) => {
          setCells(next);
          args.onChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof WeekGrid>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Paintable: Story = {};
export const Empty: Story = {
  args: { cells: new Set<CellKey>(), bookedCells: new Set<CellKey>() },
};
export const ReadOnly: Story = { args: { readOnly: true } };
export const CurrentWeekPastDays: Story = {
  args: { weekStart: startOfWeek(new Date(), { weekStartsOn: 1 }) },
};
export const PaintOneCell: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const monday = canvas.getAllByRole("button", { name: /07:00 to 07:30, not available/ })[0];
    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: monday },
      { keys: "[/MouseLeft]", target: monday },
    ]);
    await expect(args.onChange).toHaveBeenCalledWith(expect.any(Set));
    await expect(monday).toHaveAttribute("aria-pressed", "true");
  },
};
export const KeyboardAndIntervalEditing: Story = {
  args: { cells: new Set<CellKey>(), bookedCells: new Set<CellKey>() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const first = canvas.getAllByRole("button", { name: /07:00 to 07:30, not available/ })[0];
    first.focus();
    await userEvent.keyboard("{Enter}{ArrowDown}");
    await expect(first).toHaveAttribute("aria-pressed", "true");
    const second = canvas.getAllByRole("button", { name: /07:30 to 08:00, not available/ })[0];
    await expect(second).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await userEvent.selectOptions(canvas.getByLabelText("Start time"), "6");
    await userEvent.selectOptions(canvas.getByLabelText("End time"), "8");
    await userEvent.click(canvas.getByRole("button", { name: "Mark interval available" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(new Set(["0-0", "0-1", "0-6", "0-7"]));
    await userEvent.click(canvas.getByRole("button", { name: "Remove interval" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(new Set(["0-0", "0-1"]));
  },
};
