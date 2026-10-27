import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/stories/**/*.mdx", "../src/stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    // A preview must never inherit an operator's production API URL.
    config.define = { ...config.define, "process.env.NEXT_PUBLIC_API_URL": JSON.stringify("/api") };
    config.resolve = {
      ...config.resolve,
      alias: { ...config.resolve?.alias, "@": resolve(import.meta.dirname, "../src") },
    };
    return config;
  },
};
export default config;
