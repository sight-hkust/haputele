"use client";

import { motion } from "framer-motion";
import { Activity, HeartPulse, Stethoscope } from "lucide-react";

// The login page's brand moment. Composition mirrors the design-system spec:
// rotating dashed ring, 3 floating cards on staggered timings, dot grid backdrop,
// gradient corner block. Hidden on mobile (the form takes the screen).
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
          backgroundImage: "radial-gradient(circle, rgba(15, 23, 42, 0.18) 1.5px, transparent 1.5px)",
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

      {/* Floating card 1 — "live consultation" */}
      <motion.div
        className="absolute left-2 top-12 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-lg"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
          </span>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              Consultation
            </div>
            <div className="text-sm font-semibold tracking-[-0.01em]">In progress</div>
          </div>
        </div>
      </motion.div>

      {/* Floating card 2 — "vitals" */}
      <motion.div
        className="absolute right-0 top-32 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-lg"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--accent)]/10 p-2">
            <HeartPulse className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              Vitals
            </div>
            <div className="text-sm font-semibold tracking-[-0.01em]">
              120/80 <span className="font-normal text-[var(--muted-foreground)]">mmHg</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating card 3 — "today" */}
      <motion.div
        className="absolute bottom-12 left-12 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-lg"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-2">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              Today
            </div>
            <div className="text-sm font-semibold tracking-[-0.01em]">12 appointments</div>
          </div>
        </div>
      </motion.div>

      {/* Corner accent block */}
      <div className="absolute bottom-0 right-0 h-20 w-20 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] shadow-accent-lg" />
    </div>
  );
}
