"use client";

import { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

function parseNumeric(value: string | number): { n: number; suffix: string } | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { n: value, suffix: "" };
  }

  const match = String(value).trim().match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return { n, suffix: match[2] ?? "" };
}

function formatInterpolated(n: number, sample: string | number): string {
  if (typeof sample === "number") {
    return Number.isInteger(sample)
      ? String(Math.round(n))
      : n.toFixed(sample.toString().split(".")[1]?.length ?? 1);
  }

  if (sample.includes(".")) {
    const decimals = sample.split(".")[1]?.replace(/\D/g, "").length ?? 1;
    return n.toFixed(decimals);
  }

  return String(Math.round(n));
}

export function AnimatedNumber({
  value,
  className,
  durationMs = 400,
}: {
  value: string | number;
  className?: string;
  durationMs?: number;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const parsed = parseNumeric(value);
    const next = String(value);

    if (!parsed || reduceMotion) {
      el.textContent = next;
      return;
    }

    el.textContent = `${formatInterpolated(0, value)}${parsed.suffix}`;

    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      el.textContent = `${formatInterpolated(parsed.n * eased, value)}${parsed.suffix}`;
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value, durationMs, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {String(value)}
    </span>
  );
}
