import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RoleBadge } from "@/components/shell/role-badge";
import type { Role } from "@/lib/auth";

const meta = {
  title: "Shell/RoleBadge",
  component: RoleBadge,
  tags: ["autodocs"],
  args: { role: "healthworker" },
  argTypes: {
    role: { control: "select", options: ["healthworker", "doctor", "admin", "sys-admin"] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Production role labels and Lucide icons shared by the application topbar. These badges describe a role; they do not implement permission checks.",
      },
    },
  },
} satisfies Meta<typeof RoleBadge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Healthworker: Story = {};
export const Doctor: Story = { args: { role: "doctor" } };
export const Admin: Story = { args: { role: "admin" } };
export const SysAdmin: Story = { args: { role: "sys-admin" } };
export const AllRoles: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(["healthworker", "doctor", "admin", "sys-admin"] satisfies Role[]).map((role) => (
        <RoleBadge key={role} role={role} />
      ))}
    </div>
  ),
};
