import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LoginHeroGraphic } from "@/components/marketing/login-hero-graphic";

const meta = {
  title: "Marketing/LoginHeroGraphic",
  component: LoginHeroGraphic,
  tags: ["autodocs"],
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          "Unmodified decorative login brand graphic: orbiting lifecycle icons, shared gradient and animation tokens, no fabricated clinical readings. aria-hidden keeps it out of the accessibility tree. The login page hides its containing column below lg; this isolated story keeps the actual graphic visible for inspection. Use the browser's reduced-motion preference to inspect the application's global motion rules.",
      },
    },
  },
  render: () => (
    <div className="relative isolate mx-auto w-full max-w-lg overflow-hidden">
      <LoginHeroGraphic />
    </div>
  ),
} satisfies Meta<typeof LoginHeroGraphic>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DesktopOrbit: Story = {};
