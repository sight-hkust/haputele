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
          "The real availability painter uses 30-minute cells (07:00–20:00). Pointer drag paints or erases rectangles; striped booked cells are informational, not a restriction on painting. Past days/read-only mode ignore pointer edits. This grid is distinct from the booking picker's 15-minute appointment slots.",
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
    const monday = canvas.getAllByRole("button", { name: "07:00 free" })[0];
    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: monday },
      { keys: "[/MouseLeft]", target: monday },
    ]);
    await expect(args.onChange).toHaveBeenCalledWith(expect.any(Set));
    await expect(canvas.getByRole("button", { name: "07:00 available" })).toBeInTheDocument();
  },
};
