"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/primitives/card";
import { SectionLabel } from "@/components/primitives/section-label";
import { fadeInUp, staggerTight } from "@/lib/motion";

export type PhaseFeature = { Icon: LucideIcon; title: string; description: string };

// Reusable post-login landing while phases 2–4 are in flight. Shows the design
// system's bones (section label, gradient headline, asymmetric grid, hover lift)
// so what ships next slots into a coherent shell.
export function PhasePlaceholder({
  phaseLabel,
  title,
  highlight,
  subtitle,
  features,
}: {
  phaseLabel: string;
  title: string;
  highlight: string;
  subtitle: string;
  features: PhaseFeature[];
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerTight}
      className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28"
    >
      {/* Ambient glow at the top-right corner of the section */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 -z-10 h-80 w-80 rounded-full bg-[var(--accent)]/[0.05] blur-[120px]"
      />

      <motion.div variants={fadeInUp}>
        <SectionLabel pulse>{phaseLabel}</SectionLabel>
      </motion.div>

      <motion.h1
        variants={fadeInUp}
        className="mt-6 max-w-3xl font-display text-[2.5rem] leading-[1.08] tracking-[-0.02em] sm:text-[3.25rem]"
      >
        {title}{" "}
        <span className="gradient-text">{highlight}</span>
      </motion.h1>

      <motion.p
        variants={fadeInUp}
        className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg"
      >
        {subtitle}
      </motion.p>

      <motion.div
        variants={fadeInUp}
        className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {features.map((f, i) => {
          const { Icon } = f;
          return (
            <Card
              key={i}
              interactive
              className="group relative overflow-hidden p-6"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[0.03] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex flex-col gap-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] text-white shadow-accent transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.01em]">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {f.description}
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  Coming soon
                  <ArrowUpRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </div>
            </Card>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
