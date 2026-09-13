"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * AnimatedMetric — a number that cross-fades/rises into place when it
 * changes (e.g. a macro total updating after logging food, a rep
 * count updating after a SetVision analysis). Deliberately NOT a
 * digit-by-digit counting animation — that reads as a gimmick on a
 * performance-data surface; a quick, honest transition to the new
 * value is more legible and trustworthy. Sibling of Reveal/
 * StaggerContainer/StaggerItem in this same module.
 */
export function AnimatedMetric({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <span className={className}>{value}</span>;
  }

  return (
    <motion.span
      key={String(value)}
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {value}
    </motion.span>
  );
}
