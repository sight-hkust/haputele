import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { RubberStampUploader } from "@/components/admin/rubber-stamp-uploader";
import { demoSignature } from "../fixtures";
import { scenario } from "../scenario";

const meta = {
  title: "Clinical/Doctor assets/Stamp uploader",
  component: RubberStampUploader,
  args: { value: null, onChange: fn(), enableQrCapture: false },
  parameters: {
    ...scenario({ role: "admin" }),
    docs: {
      description: {
        component:
          "Real stamp asset intake: PNG/JPEG under 1 MB, drag/drop or picker, local camera, authenticated companion-phone QR, crop/edit, preview and clear. Public onboarding disables QR. Existing preview is an illustration, not a doctor's stamp.",
      },
    },
  },
  render: function Uploader(args) {
    const [value, setValue] = useState(args.value);
    return (
      <RubberStampUploader
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof RubberStampUploader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PublicUpload: Story = {};
export const AuthenticatedPhoneCapture: Story = { args: { enableQrCapture: true } };
export const ExistingIllustration: Story = {
  args: { value: `data:image/svg+xml,${encodeURIComponent(demoSignature)}` },
};
