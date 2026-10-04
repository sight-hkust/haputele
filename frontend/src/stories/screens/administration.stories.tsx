import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Screen } from "../screen";
import { scenario } from "../scenario";

const meta = {
  title: "Screens/Administration",
  component: Screen,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: { path: { control: false } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DoctorRoster: Story = {
  args: { path: "/admin" },
  parameters: scenario({ role: "admin" }),
};
export const EmptyDoctorRoster: Story = {
  args: { path: "/admin" },
  parameters: scenario({ role: "admin", empty: true }),
};
export const DoctorRosterError: Story = {
  args: { path: "/admin" },
  parameters: scenario({ role: "admin", error: true }),
};
export const InviteDoctor: Story = {
  args: { path: "/admin/doctors/new" },
  parameters: scenario({ role: "admin" }),
};
export const DoctorProfile: Story = {
  args: { path: "/admin/doctors/1" },
  parameters: scenario({ role: "admin" }),
};
export const AwaitingApproval: Story = {
  args: { path: "/admin/doctors/1" },
  parameters: scenario({ role: "admin", doctorStatus: "awaiting_approval" }),
};
export const AwaitingSetup: Story = {
  args: { path: "/admin/doctors/1" },
  parameters: scenario({ role: "admin", doctorStatus: "awaiting_setup" }),
};
export const RejectedApplication: Story = {
  args: { path: "/admin/doctors/1" },
  parameters: scenario({ role: "admin", doctorStatus: "rejected" }),
};
export const HealthworkerAccounts: Story = {
  args: { path: "/admin/healthworkers" },
  parameters: scenario({ role: "admin" }),
};
export const SystemConfiguration: Story = {
  args: { path: "/sysadmin" },
  parameters: scenario({ role: "sys-admin" }),
};
export const SystemConfigurationError: Story = {
  args: { path: "/sysadmin" },
  parameters: scenario({ role: "sys-admin", error: true }),
};
export const AllAccounts: Story = {
  args: { path: "/sysadmin/accounts" },
  parameters: scenario({ role: "sys-admin" }),
};
export const EmptyAccounts: Story = {
  args: { path: "/sysadmin/accounts" },
  parameters: scenario({ role: "sys-admin", empty: true }),
};
export const OperatorDoctorInvite: Story = {
  args: { path: "/sysadmin/doctors/new" },
  parameters: scenario({ role: "sys-admin" }),
};
export const OperatorManualDoctor: Story = {
  args: { path: "/sysadmin/doctors/new?mode=manual" },
  parameters: scenario({ role: "sys-admin" }),
};
