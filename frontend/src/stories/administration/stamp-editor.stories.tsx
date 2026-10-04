import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { RubberStampEditor } from "@/components/admin/rubber-stamp-editor";
import { demoSignature } from "../fixtures";

const meta = {
  title: "Clinical/Doctor assets/Stamp editor",
  component: RubberStampEditor,
  args: {
    source: `data:image/svg+xml,${encodeURIComponent(demoSignature)}`,
    onCancel: fn(),
    onSave: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          "Production crop, rotation, transparency and threshold editor. The source is an explicitly synthetic illustration. Saving runs the real canvas encoder and emits PNG or JPEG; no clinical stamp/signature is asserted.",
      },
    },
  },
} satisfies Meta<typeof RubberStampEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CropAndRemoveBackground: Story = {};
export const SignaturePngOutput: Story = {
  args: {
    forcePng: true,
    description: "Crop the synthetic signature. Signature assets must remain PNG.",
  },
};
