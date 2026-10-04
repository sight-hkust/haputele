import type { Preview } from "@storybook/nextjs-vite";
import { mswLoader } from "msw-storybook-addon/csf3";
import { setupWorker } from "msw/browser";
import { QueryProvider } from "@/lib/query-client";
import { AuthProvider } from "@/lib/auth";
import { createHandlers, scenario } from "@/stories/scenario";
import "@/app/globals.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/calistoga/400.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./preview.css";

const loadMsw = mswLoader(async () => {
  const worker = setupWorker();
  await worker.start({
    quiet: true,
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith("/api/")) print.error();
    },
  });
  return worker;
});
const preview: Preview = {
  tags: ["autodocs"],
  loaders: [
    async (context) => {
      const configured = context.parameters.msw;
      const handlers = Array.isArray(configured)
        ? configured
        : Array.isArray(configured?.handlers)
          ? configured.handlers
          : Object.values(configured?.handlers ?? {}).flat();
      // New server state for every render/replay; local error overrides stay first.
      await loadMsw({
        ...context,
        parameters: {
          ...context.parameters,
          msw: { handlers: [...handlers, ...createHandlers(context.parameters.haputele)] },
        },
      });
      return { scenarioKey: crypto.randomUUID() };
    },
  ],
  parameters: {
    ...scenario(),
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: "todo" },
    options: {
      storySort: {
        order: ["Start here", "Journeys", "Screens", "Clinical", "Primitives", "Shell"],
      },
    },
  },
  decorators: [
    (Story, context) => (
      <QueryProvider key={`${context.id}-${context.loaded.scenarioKey}`}>
        <AuthProvider>
          <Story />
        </AuthProvider>
      </QueryProvider>
    ),
  ],
};
export default preview;
