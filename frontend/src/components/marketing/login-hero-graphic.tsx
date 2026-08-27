"use client";

import { motion } from "framer-motion";
import { Stethoscope } from "lucide-react";

// The login page's brand moment. Composition mirrors the design-system spec:
// rotating dashed ring, dot grid backdrop, gradient corner block.
// Hidden on mobile (the form takes the screen).
export function LoginHeroGraphic() {
  return (
    <div className="relative h-[560px] w-full" aria-hidden>
      {/* Ambient radial glows */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-[var(--accent)]/[0.08] blur-[120px]" />
        <div className="absolute bottom-0 left-12 h-72 w-72 rounded-full bg-[var(--accent-secondary)]/[0.10] blur-[120px]" />
      </div>

      {/* Background dot grid (lighter — backdrop, not pattern) */}
      <div
        className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(15, 23, 42, 0.18) 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Outer rotating dashed ring — 60s glacial speed */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[var(--accent)]/25"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />

      {/* Inner static ring */}
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--accent)]/15" />

      {/* Central gradient block */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-8 shadow-accent-lg">
        <Stethoscope className="h-12 w-12 text-white" strokeWidth={1.5} />
      </div>

      {/* Corner accent block */}
      <div className="absolute bottom-0 right-0 h-20 w-20 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] shadow-accent-lg" />
    </div>
  );
}
