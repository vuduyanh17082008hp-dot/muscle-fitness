"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";

export function NutritionSectionReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function NutritionResultGlow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 rounded-[32px] bg-[radial-gradient(ellipse_at_top,rgba(212,255,0,0.12),transparent_68%)] opacity-80 motion-reduce:opacity-40"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
