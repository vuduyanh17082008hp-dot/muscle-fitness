"use client";

import { useEffect, useRef } from "react";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

const TRAIL_COUNT = 8;
const RING_DAMPING = 0.18;
const TRAIL_DAMPING = 0.28;

const HOVER_SELECTOR = "a, button, [data-cursor-hover], [data-ecosystem-node]";

/**
 * Desktop-only decorative halo (fine pointer + hover-capable + no reduced
 * motion — spec #93) that trails the native cursor. The OS cursor is never
 * hidden, so text/pointer/disabled affordances and tracking latency stay
 * native. Everything runs off a single RAF loop (spec #57: one loop, not
 * one per particle).
 */
export function CustomCursor() {
  const { reducedMotion, finePointer } = useMotionCapabilities();
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<Array<HTMLDivElement | null>>([]);
  const active = !reducedMotion && finePointer;

  useEffect(() => {
    if (!active) return;

    const pointer = { x: 0, y: 0 };
    const ring = { x: 0, y: 0 };
    const trail = Array.from({ length: TRAIL_COUNT }, () => ({ x: 0, y: 0 }));

    let rafId = 0;
    let hovering = false;
    let pressed = false;
    let visible = false;

    // Hidden until the pointer is in the window, so no halo parks mid-screen or at the exit edge.
    const setVisible = (next: boolean) => {
      visible = next;
      if (rootRef.current) rootRef.current.style.opacity = next ? "1" : "0";
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!visible) {
        ring.x = pointer.x;
        ring.y = pointer.y;
        trail.forEach((particle) => {
          particle.x = pointer.x;
          particle.y = pointer.y;
        });
        setVisible(true);
      }

      const target = event.target as Element | null;
      hovering = Boolean(target?.closest(HOVER_SELECTOR));
    };

    const onPointerDown = () => {
      pressed = true;
    };
    const onPointerUp = () => {
      pressed = false;
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) setVisible(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointerout", onPointerOut);

    const tick = () => {
      ring.x += (pointer.x - ring.x) * RING_DAMPING;
      ring.y += (pointer.y - ring.y) * RING_DAMPING;

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

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointerout", onPointerOut);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div ref={rootRef} aria-hidden="true" className={styles.cursorRoot} style={{ opacity: 0 }}>
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
      <div ref={ringRef} className={styles.cursorRing} />
    </div>
  );
}
