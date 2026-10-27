import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { delay, http, HttpResponse } from "msw";
import { AppVersion } from "@/components/shell/app-version";
import { scenario } from "@/stories/scenario";
import type { Health } from "@/types/api";

function healthParameters(state: "deployed" | "local" | "loading" | "error") {
  const base = scenario();
  return {
    ...base,
    msw: {
      handlers: [
        http.get("/api/health", async () => {
          if (state === "loading") await delay("infinite");
          if (state === "error")
            return HttpResponse.json({ detail: { error: "internal_error" } }, { status: 503 });
          return HttpResponse.json({
            status: "ok",
            uptime: 3600,
            version: "storybook-demo",
            build_date: "2026-09-01T04:30:00Z",
            hostname: "isolated-preview",
            commit: state === "local" ? "unknown" : "a1b2c3d4e5f6",
          } satisfies Health);
        }),
        ...base.msw.handlers,
      ],
    },
  };
}
const meta = {
  title: "Shell/AppVersion",
  component: AppVersion,
  tags: ["autodocs"],
  parameters: {
    ...healthParameters("deployed"),
    controls: { disable: true },
    docs: {
      description: {
        component:
          "Real backend-health version label with story-only responses. Commit is truncated to seven characters, and unknown is omitted for local builds. Loading and unavailable responses intentionally render no label; the production footer supplies layout stability.",
      },
    },
  },
  render: () => (
    <footer className="min-h-8">
      <AppVersion />
    </footer>
  ),
} satisfies Meta<typeof AppVersion>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DeployedCommit: Story = {};
export const LocalBuild: Story = { parameters: healthParameters("local") };
export const LoadingHidden: Story = { parameters: healthParameters("loading") };
export const UnavailableHidden: Story = { parameters: healthParameters("error") };
