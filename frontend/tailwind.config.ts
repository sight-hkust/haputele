import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      // Type scale raised one step app-wide (#58, #55). The clinic's users are
      // largely seniors, and the UI had drifted to 10-14px almost everywhere.
      // Overriding the scale here lifts every text-xs/sm/base/lg call site at
      // once. Sizes carry an explicit line-height — bumping size alone leaves
      // the old leading and reads cramped. xl and above are deliberately left
      // at Tailwind's defaults: headings are already large enough, and holding
      // them fixed keeps reflow contained to body copy.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.125rem" }],   // 13px / 18px
        sm: ["0.9375rem", { lineHeight: "1.375rem" }],   // 15px / 22px
        base: ["1.0625rem", { lineHeight: "1.625rem" }], // 17px / 26px
        lg: ["1.1875rem", { lineHeight: "1.75rem" }],    // 19px / 28px
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          secondary: "var(--accent-secondary)",
          foreground: "var(--accent-foreground)",
        },
        border: "var(--border)",
        card: "var(--card)",
        ring: "var(--ring)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-calistoga)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        accent: "0 4px 14px rgba(0, 82, 255, 0.25)",
        "accent-lg": "0 8px 24px rgba(0, 82, 255, 0.35)",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.3)", opacity: "0.7" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
