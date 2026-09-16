"use client";

import { useEffect, useRef } from "react";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

const TRAIL_COUNT = 8;
const RING_DAMPING = 0.18;
const DOT_DAMPING = 0.55;
const TRAIL_DAMPING = 0.28;

const HOVER_SELECTOR = "a, button, [data-cursor-hover], [data-ecosystem-node]";

/**
 * Desktop-only enhancement (fine pointer + hover-capable + no reduced
 * motion — spec #93). Normal cursor is only hidden once all three hold,
 * and everything runs off a single RAF loop (spec #57: one loop, not one
 * per particle).
 */
export function CustomCursor() {
  const { reducedMotion, finePointer } = useMotionCapabilities();
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<Array<HTMLDivElement | null>>([]);
  const active = !reducedMotion && finePointer;

  useEffect(() => {
    if (!active) return;

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "none";

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ring = { x: pointer.x, y: pointer.y };
    const dot = { x: pointer.x, y: pointer.y };
    const trail = Array.from({ length: TRAIL_COUNT }, () => ({ x: pointer.x, y: pointer.y }));

    let rafId = 0;
    let hovering = false;
    let pressed = false;

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      const target = event.target as Element | null;
      hovering = Boolean(target?.closest(HOVER_SELECTOR));
    };

    const onPointerDown = () => {
      pressed = true;
    };
    const onPointerUp = () => {
      pressed = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);

    const tick = () => {
      ring.x += (pointer.x - ring.x) * RING_DAMPING;
      ring.y += (pointer.y - ring.y) * RING_DAMPING;
      dot.x += (pointer.x - dot.x) * DOT_DAMPING;
      dot.y += (pointer.y - dot.y) * DOT_DAMPING;

      let prevX = pointer.x;
      let prevY = pointer.y;
      trail.forEach((particle, index) => {
        particle.x += (prevX - particle.x) * TRAIL_DAMPING;
        particle.y += (prevY - particle.y) * TRAIL_DAMPING;
        prevX = particle.x;
        prevY = particle.y;

        const el = trailRefs.current[index];
        if (el) {
          el.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0) translate(-50%, -50%)`;
        }
      });

      if (ringRef.current) {
        const scale = pressed ? 0.62 : hovering ? 2 : 1;
        ringRef.current.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%) scale(${scale})`;
        ringRef.current.style.borderColor = hovering
          ? "rgba(200, 245, 39, 0.85)"
          : "rgba(200, 245, 39, 0.4)";
      }

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${dot.x}px, ${dot.y}px, 0) translate(-50%, -50%)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = previousCursor;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div aria-hidden="true" className={styles.cursorRoot}>
      {Array.from({ length: TRAIL_COUNT }).map((_, index) => (
        <div
          key={index}
          ref={(el) => {
            trailRefs.current[index] = el;
          }}
          className={styles.cursorTrailDot}
          style={{
            width: 6 - (index / TRAIL_COUNT) * 4,
            height: 6 - (index / TRAIL_COUNT) * 4,
            opacity: 0.35 * (1 - index / TRAIL_COUNT),
          }}
        />
      ))}
      <div ref={dotRef} className={styles.cursorDot} />
      <div ref={ringRef} className={styles.cursorRing} />
    </div>
  );
}
