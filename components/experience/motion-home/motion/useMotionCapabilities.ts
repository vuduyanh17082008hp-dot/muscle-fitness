"use client";

import { useEffect, useState } from "react";

export type MotionCapabilities = {
  reducedMotion: boolean;
  finePointer: boolean;
};

/**
 * Single source of truth for "can this device run the heavier Gold
 * Master effects" (custom cursor, canvas particles/liquid, 3D tilt).
 * Read once via matchMedia + re-checked on change — never per animation
 * frame, and never accessed during SSR (spec: no window/matchMedia
 * access during SSR).
 */
export function useMotionCapabilities(): MotionCapabilities {
  const [caps, setCaps] = useState<MotionCapabilities>({
    reducedMotion: false,
    finePointer: false,
  });

  useEffect(() => {
    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

    const update = () =>
      setCaps({
        reducedMotion: reduceQuery.matches,
        finePointer: pointerQuery.matches,
      });

    update();
    reduceQuery.addEventListener("change", update);
    pointerQuery.addEventListener("change", update);

    return () => {
      reduceQuery.removeEventListener("change", update);
      pointerQuery.removeEventListener("change", update);
    };
  }, []);

  return caps;
}
