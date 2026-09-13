"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * AnimatedProgress — a single progress/metric bar that eases to its
 * new width. Shared by MetricCard/PerformanceCard/ProgressMetric
 * rather than each hand-rolling its own transition (PerformanceCard's
 * own inline bar predates this and can migrate opportunistically).
 */
export function AnimatedProgress({
  percent,
  color = "var(--mf-sunset)",
  trackClassName,
  barClassName,
}: {
  /** 0-100. Clamped internally. */
  percent: number;
  /** Any valid CSS color — a hex, an mf-* token, or a gradient class applied via barClassName instead. */
  color?: string;
  trackClassName?: string;
  barClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-white/[0.06]", trackClassName)}>
      <motion.div
        className={cn("h-full rounded-full", barClassName)}
        style={barClassName ? undefined : { backgroundColor: color }}
        initial={reduceMotion ? { width: `${clamped}%` } : { width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: reduceMotion ? 0 : 0.6, ease: "easeOut" }}
      />
    </div>
  );
}
