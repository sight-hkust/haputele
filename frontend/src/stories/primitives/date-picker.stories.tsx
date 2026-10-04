import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { DatePicker } from "@/components/primitives/date-picker";
import { Label } from "@/components/primitives/input";

function CalendarField(args: ComponentProps<typeof DatePicker>) {
  const [value, setValue] = useState(args.value);
  return (
    <div className="flex min-h-[30rem] w-full max-w-md flex-col gap-2">
      <Label htmlFor={args.id}>{args.mode === "week" ? "Target week" : "Appointment date"}</Label>
      <DatePicker
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    </div>
  );
}
const meta = {
  title: "Primitives/DatePicker",
  component: DatePicker,
  tags: ["autodocs"],
  args: {
    id: "appointment-date",
    value: "2026-10-14",
    onChange: fn(),
    mode: "date",
    ariaLabel: "Choose appointment date",
    trigger: "field",
    align: "start",
  },
  argTypes: {
    mode: { control: "select", options: ["date", "week"] },
    trigger: { control: "select", options: ["field", "icon"] },
    align: { control: "select", options: ["start", "end"] },
    value: { control: "text" },
    min: { control: "text" },
    max: { control: "text" },
  },
  render: (args) => <CalendarField key={`${args.value}-${args.mode}`} {...args} />,
  parameters: {
    controls: { include: ["value", "mode", "min", "max", "placeholder", "trigger", "align"] },
    docs: {
      description: {
        component:
          "Production calendar. Date selection closes the popup; week selection highlights Monday–Sunday and stays open until Done. Arrows move by day/week, Home/End jump within a week, PageUp/PageDown change month, and Escape closes. Bounds disable day cells, not month navigation.",
      },
    },
  },
} satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DaySelection: Story = {};
export const Empty: Story = { args: { value: "", placeholder: "Choose date of birth" } };
export const Week: Story = { args: { mode: "week", ariaLabel: "Choose target week" } };
export const IconTrigger: Story = { args: { trigger: "icon", align: "end" } };
export const BoundedKeyboardSelection: Story = {
  args: { min: "2026-10-12", max: "2026-10-16" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Choose appointment date" }));
    const dialog = within(await canvas.findByRole("dialog"));
    await expect(dialog.getByRole("gridcell", { name: "Sunday, 11 October 2026" })).toBeDisabled();
    await expect(
      dialog.getByRole("gridcell", { name: "Saturday, 17 October 2026" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("gridcell", { name: "Monday, 12 October 2026" }));
    await expect(args.onChange).toHaveBeenCalledWith("2026-10-12");
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Choose appointment date" }));
    const selected = within(await canvas.findByRole("dialog")).getByRole("gridcell", {
      name: "Monday, 12 October 2026",
    });
    await waitFor(() => expect(selected).toHaveFocus());
    await userEvent.keyboard("{ArrowLeft}");
    await expect(selected).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    const next = canvas.getByRole("gridcell", { name: "Tuesday, 13 October 2026" });
    await waitFor(() => expect(next).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith("2026-10-13");
    await expect(canvas.getByRole("button", { name: "Choose appointment date" })).toHaveTextContent(
      "13 Oct 2026",
    );
  },
};
