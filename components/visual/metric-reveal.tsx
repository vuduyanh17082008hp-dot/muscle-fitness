"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

type MetricRevealProps = {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
};

/**
 * Counts up to `value` once when scrolled into view. Runs once,
 * never re-triggers, and jumps straight to the final value under
 * prefers-reduced-motion.
 */
export function MetricReveal({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  duration = 1.1,
  className = "",
}: MetricRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || reduceMotion) {
      return;
    }

    const start = performance.now();

    let frame: number;

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - progress) ** 3; // ease-out cubic

      setDisplay(value * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [inView, reduceMotion, value, duration]);

  const shown = reduceMotion ? value : display;

  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
