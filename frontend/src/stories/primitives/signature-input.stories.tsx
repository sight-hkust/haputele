import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { SignatureInput } from "@/components/doctor/signature-input";
import { demoSignature } from "@/stories/fixtures";

function SavedSignature(args: ComponentProps<typeof SignatureInput>) {
  const [value, setValue] = useState(args.value);
  return (
    <div className="w-full max-w-2xl">
      <SignatureInput
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
  title: "Primitives/Signatures/Doctor SignatureInput",
  component: SignatureInput,
  tags: ["autodocs"],
  args: { value: null, onChange: fn() },
  argTypes: { value: { control: false } },
  render: (args) => <SavedSignature key={args.value ?? "blank"} {...args} />,
  parameters: {
    docs: {
      description: {
        component:
          "Production optional saved-signature input with Draw/Upload modes, actual canvas capture, PNG/JPEG validation, crop/background-removal editor and clearable preview. Upload accepts at most 1 MB; the editor's final PNG is capped at 200 KB. SavedPreview uses an explicitly synthetic illustration only; it is not an uploaded signature or consent artifact.",
      },
    },
  },
} satisfies Meta<typeof SignatureInput>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Draw: Story = {};
export const SavedPreview: Story = {
  args: { value: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoSignature)}` },
};
export const UploadAndRejectUnsupportedFile: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Upload" }));
    await expect(canvas.getByRole("button", { name: "Upload" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(canvas.getByRole("button", { name: /Upload signature/ })).toBeInTheDocument();
    const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("SignatureInput did not render its file input");
    await userEvent.upload(input, new File(["Not an image"], "demo.txt", { type: "text/plain" }), {
      applyAccept: false,
    });
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Use a PNG or JPEG image.");
  },
};
