import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Topbar } from "@/components/shell/topbar";
import { scenario } from "@/stories/scenario";

const meta = {
  title: "Shell/Topbar",
  component: Topbar,
  tags: ["autodocs"],
  parameters: {
    ...scenario({ role: "healthworker" }),
    layout: "fullscreen",
    controls: { disable: true },
    docs: {
      description: {
        component:
          "Actual authenticated topbar using the real AuthProvider and synthetic session API. The brand links to each role's home; Sign out calls the real logout flow against MSW. Username is hidden below md and the role badge/Sign out text below sm, as in production. A signed-out session renders nothing.",
      },
    },
  },
} satisfies Meta<typeof Topbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Healthworker: Story = {};
export const Doctor: Story = {
  parameters: scenario({ role: "doctor", path: "/doctor/appointments" }),
};
export const Admin: Story = { parameters: scenario({ role: "admin", path: "/admin/doctors" }) };
export const SysAdmin: Story = {
  parameters: scenario({ role: "sys-admin", path: "/sys-admin/accounts" }),
};
export const SignedOut: Story = { parameters: scenario({ role: null, path: "/login" }) };
