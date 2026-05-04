"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { SectionLabel } from "@/components/primitives/section-label";
import { fadeInUp, staggerTight } from "@/lib/motion";

// Consistent page-header treatment — section label, gradient-highlighted title,
// optional subtitle, optional action slot. Keeps every screen on-design.
export function PageHeader({
  label,
  title,
  highlight,
  subtitle,
  action,
  pulseLabel = false,
}: {
  label?: string;
  title: ReactNode;
  highlight?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  pulseLabel?: boolean;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerTight}
      className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="flex flex-col gap-4">
        {label && (
          <motion.div variants={fadeInUp}>
            <SectionLabel pulse={pulseLabel}>{label}</SectionLabel>
          </motion.div>
        )}
        <motion.h1
          variants={fadeInUp}
          className="font-display text-[2rem] leading-[1.08] tracking-[-0.02em] sm:text-[2.75rem]"
        >
          {title}
          {highlight && (
            <>
              {" "}
              <span className="gradient-text">{highlight}</span>
            </>
          )}
        </motion.h1>
        {subtitle && (
          <motion.p
            variants={fadeInUp}
            className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
      {action && (
        <motion.div variants={fadeInUp} className="flex shrink-0 items-center gap-2">
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
