import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Screen } from "../screen";
import { scenario } from "../scenario";

const meta = {
  title: "Screens/Public",
  component: Screen,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: { path: { control: false } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RoleEntry: Story = { args: { path: "/" }, parameters: scenario() };
export const Login: Story = {
  args: { path: "/login" },
  parameters: scenario({ role: null, path: "/login" }),
};
export const InvalidCredentials: Story = {
  args: { path: "/login" },
  parameters: scenario({ role: null, path: "/login", loginError: "invalid_credentials" }),
};
export const DoctorAwaitingApproval: Story = {
  args: { path: "/login" },
  parameters: scenario({ role: null, path: "/login", loginError: "account_pending_approval" }),
};
export const DoctorRejected: Story = {
  args: { path: "/login" },
  parameters: scenario({ role: null, path: "/login", loginError: "account_rejected" }),
};
export const FirstRunSetup: Story = {
  args: { path: "/setup" },
  parameters: scenario({ role: null, path: "/setup", initialized: false }),
};
export const NewDoctorOnboarding: Story = {
  args: { path: "/doctor-onboarding/storybook-invite" },
  parameters: scenario({
    role: null,
    path: "/doctor-onboarding/storybook-invite",
    inviteMode: "new",
  }),
};
export const DoctorPasswordRotation: Story = {
  args: { path: "/doctor-onboarding/storybook-invite" },
  parameters: scenario({
    role: null,
    path: "/doctor-onboarding/storybook-invite",
    inviteMode: "rotation",
  }),
};
export const ExpiredDoctorInvite: Story = {
  args: { path: "/doctor-onboarding/storybook-invite" },
  parameters: scenario({
    role: null,
    path: "/doctor-onboarding/storybook-invite",
    inviteMode: "expired",
  }),
};
export const PhoneCapture: Story = {
  args: { path: "/capture/storybook-capture" },
  parameters: scenario({ role: null, path: "/capture/storybook-capture" }),
};
export const ExpiredPhoneCapture: Story = {
  args: { path: "/capture/storybook-capture" },
  parameters: scenario({ role: null, path: "/capture/storybook-capture", captureExpired: true }),
};
export const NotFound: Story = {
  args: { path: "/missing" },
  parameters: scenario({ path: "/missing" }),
};
