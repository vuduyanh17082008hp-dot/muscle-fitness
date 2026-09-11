"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

type ParallaxVisualProps = {
  children: ReactNode;
  className?: string;
  /** Relative scroll speed. 0.15-0.25 for images, 0.25-0.4 for overlays, per docs/VISUAL_SYSTEM.md. */
  speed?: number;
};

/**
 * Subtle parallax wrapper — never scroll-jacks, never moves more than
 * a few percent of viewport height, and disables itself entirely
 * under prefers-reduced-motion.
 */
export function ParallaxVisual({ children, className = "", speed = 0.2 }: ParallaxVisualProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [`${-speed * 60}px`, `${speed * 60}px`]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={reduceMotion ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}
