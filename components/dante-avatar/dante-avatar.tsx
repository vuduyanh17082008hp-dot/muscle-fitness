"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";

import type { DanteAppState, DantePoseName } from "@/components/dante-avatar/poses";
import { APP_STATE_POSE } from "@/components/dante-avatar/poses";

/**
 * Public Dante 3D entry point (spec Part D).
 *
 * Performance (spec §32): the entire Three.js/R3F bundle is lazy
 * loaded via next/dynamic(ssr:false) — Dante 3D is NEVER in the
 * initial bundle of a page that doesn't render this component, and
 * even on a page that does, the 3D code splits into its own chunk.
 *
 * Accessibility (spec §33): respects prefers-reduced-motion by
 * skipping the animated scene entirely and rendering a static badge
 * instead — a purely decorative avatar is exactly the case
 * reduced-motion should suppress.
 */

const DanteAvatarScene = dynamic(
  () => import("./dante-avatar-scene").then((mod) => mod.DanteAvatarScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-amber-500" />
      </div>
    ),
  },
);

function useReducedMotion(): boolean {
  // Lazy initializer reads the real value on first render (client-
  // only component, so window exists) — the effect below only
  // subscribes to later changes, it never sets state synchronously
  // on mount.
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}

export type DanteAvatarProps = {
  /** Either a named app state (spec §23) or an explicit pose override. */
  appState?: DanteAppState;
  pose?: DantePoseName;
  className?: string;
};

export function DanteAvatar({ appState = "ready", pose, className }: DanteAvatarProps) {
  const reducedMotion = useReducedMotion();
  const resolvedPose = pose ?? APP_STATE_POSE[appState];

  if (reducedMotion) {
    return (
      <div
        className={className}
        role="img"
        aria-label="Dante, the Muscle Fitness performance coach"
      >
        <div className="flex size-full items-center justify-center rounded-2xl border border-amber-400/20 bg-gradient-to-br from-zinc-900 to-black">
          <span className="text-4xl font-black text-amber-400">D</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className} aria-hidden="true">
      <Suspense fallback={null}>
        <DanteAvatarScene pose={resolvedPose} className="size-full" />
      </Suspense>
    </div>
  );
}
