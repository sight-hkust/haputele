"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { SectionLabel } from "@/components/primitives/section-label";
import { fadeInUp, staggerTight } from "@/lib/motion";

// Task-first heading with optional context, supporting text and an action.
export function PageHeader({
  label,
  title,
  subtitle,
  action,
  pulseLabel = false,
}: {
  label?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  pulseLabel?: boolean;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerTight}
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-2">
        {label && (
          <motion.div variants={fadeInUp}>
            <SectionLabel pulse={pulseLabel}>{label}</SectionLabel>
          </motion.div>
        )}
        <motion.h1 variants={fadeInUp} className="text-page-heading text-balance">
          {title}
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
