"use client";

import { useRef, type ReactNode } from "react";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";

const MAX_TILT_DEG = 4;
const TRANSLATE_Z = 4;

/**
 * Effect #8b — problem-card only 3D tilt. Desktop/fine-pointer only,
 * disabled under reduced motion. Deliberately DOM-direct (no React
 * state per pointer move) and scoped to this one card type — the spec
 * forbids applying this to Ecosystem, Recovery, Adapt, Dante or Nav.
 */
export function TiltCard({ className, children }: { className?: string; children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { reducedMotion, finePointer } = useMotionCapabilities();
  const active = !reducedMotion && finePointer;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;

    card.style.transform = `perspective(900px) translateY(-2px) rotateX(${(-py * MAX_TILT_DEG * 2).toFixed(2)}deg) rotateY(${(px * MAX_TILT_DEG * 2).toFixed(2)}deg) translateZ(${TRANSLATE_Z}px)`;
  };

  const onPointerLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = "perspective(900px) translateY(0px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={className}
      style={{ transition: "transform 0.35s cubic-bezier(.25,.46,.45,.94)", willChange: "transform" }}
    >
      {children}
    </div>
  );
}
