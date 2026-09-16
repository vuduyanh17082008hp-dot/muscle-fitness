"use client";

import { useEffect, useRef } from "react";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

type Wave = { y: number; amp: number; length: number; speed: number; alpha: number };

const WAVES: Wave[] = [
  { y: 0.35, amp: 12, length: 180, speed: 0.9, alpha: 0.15 },
  { y: 0.5, amp: 18, length: 240, speed: 0.6, alpha: 0.23 },
  { y: 0.65, amp: 8, length: 140, speed: 1.3, alpha: 0.31 },
];

const DPR_CAP = 1.5;

/** True modulo (always in [0, mod)) — JS `%` keeps the sign of the
 * dividend, so a negative input returns a negative result instead of
 * wrapping forward. */
function positiveModulo(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

/**
 * Effect #9c — three layered sine waves + a central pulse dot with
 * radiating rings, per spec section 37. Canvas 2D only. Reduced motion
 * renders one static signal line instead of animating (spec: disable
 * for reduced motion, but content/layout stays).
 */
export function LiquidSignalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { reducedMotion } = useMotionCapabilities();

  useEffect(() => {
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    let rafId = 0;
    let disposed = false;
    const start = performance.now();

    const draw = (now: number) => {
      if (disposed) return;

      if (document.hidden) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      // Canvas size guard — width/height can be 0 for a frame during
      // initial layout or a mid-resize reflow; drawing against that
      // (createLinearGradient(0,0,0,0), a zero-radius min()) is safe on
      // its own, but skipping is cheaper and avoids acting on stale
      // geometry.
      if (width <= 0 || height <= 0) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      // `now` is the timestamp the current frame started, which can
      // occasionally land a hair before the `start` we captured
      // synchronously moments earlier in the same task (a documented
      // rAF quirk, not a clock going backwards) — clamping keeps a
      // one-off negative delta on the first frame from ever reaching
      // the trig below instead of masking a real bug with Math.abs.
      const t = Math.max(0, (now - start) / 1000);
      ctx.clearRect(0, 0, width, height);

      for (const wave of WAVES) {
        const baseY = height * wave.y;
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, `rgba(200, 245, 39, 0)`);
        gradient.addColorStop(0.5, `rgba(200, 245, 39, ${wave.alpha})`);
        gradient.addColorStop(1, `rgba(200, 245, 39, 0)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        let started = false;
        for (let x = 0; x <= width; x += 4) {
          const y = baseY + Math.sin(x / wave.length + t * wave.speed) * wave.amp;
          if (!Number.isFinite(y)) continue;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      const cx = width / 2;
      const cy = height / 2;
      const ringSpan = Math.min(width, height) * 0.42;

      for (let ring = 0; ring < 3; ring += 1) {
        // positiveModulo, not `%`, so the phase is intrinsically in
        // [0, 1) — the radius derived from it can never go negative,
        // regardless of any future drift in `t`.
        const phase = positiveModulo(t * 0.6 + ring / 3, 1);
        const radius = phase * ringSpan;

        if (!Number.isFinite(radius) || radius <= 0) continue;

        ctx.strokeStyle = `rgba(200, 245, 39, ${Math.max(0, 0.35 * (1 - phase))})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      const pulse = 3 + Math.sin(t * 3) * 1.2;
      if (Number.isFinite(pulse) && pulse > 0) {
        ctx.fillStyle = "rgba(200, 245, 39, 0.9)";
        ctx.beginPath();
        ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [reducedMotion]);

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.02] sm:h-48">
      {reducedMotion ? (
        <div className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-[var(--mf-brand)]/40" aria-hidden="true" />
      ) : (
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      )}

      <p
        className={`${styles.monoLabel} pointer-events-none absolute bottom-3 left-4 text-[10px] uppercase tracking-[0.16em] text-[var(--mf-pub-text-muted)]`}
      >
        signal · live · training load
      </p>
    </div>
  );
}
