import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

import { DANTE_POSES, type DantePoseName, type LimbRotations } from "@/components/dante-avatar/poses";

/**
 * Smooth pose blending (spec §22: "Transitions should be blended
 * smoothly. Avoid robotic snap transitions."). Each limb group's
 * current rotation is exponentially damped toward the target pose's
 * rotation every frame — a standard, dependency-free way to get a
 * smooth ease without adding an animation-clip library for a
 * procedural placeholder figure (see poses.ts's honesty note).
 */

export type LimbRefs = Record<keyof LimbRotations, React.RefObject<Group | null>>;

const DAMPING = 4; // higher = snappier, lower = slower/floatier

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// How many seconds of side-to-side forearm motion play once the
// "wave" pose becomes active — tuned together with WAVE_FREQUENCY so
// this plays out to almost exactly 2 full cycles, then holds still
// (still raised) until the caller switches back to idle_breathing.
const WAVE_FREQUENCY = 8; // rad/s
const WAVE_AMPLITUDE = 0.35; // radians
const WAVE_CYCLES = 2;
const WAVE_DURATION = (WAVE_CYCLES * 2 * Math.PI) / WAVE_FREQUENCY;

export function useDantePose(refs: LimbRefs, pose: DantePoseName, timeScale = 1) {
  const elapsed = useRef(0);
  const wavePhaseStart = useRef<number | null>(null);
  const prevPose = useRef<DantePoseName>(pose);

  // Directly mutating each ref's .rotation every frame is the
  // standard, documented react-three-fiber pattern for animation —
  // driving this through React state instead would re-render the
  // component tree at 60fps, which is exactly what useFrame exists to
  // avoid. The lint rule below is tuned for React state immutability,
  // not this imperative-scene-graph case.
  /* eslint-disable react-hooks/immutability -- standard r3f useFrame mutation pattern, see comment above */
  useFrame((_, delta) => {
    elapsed.current += delta * timeScale;

    // Reset the wave's own clock the instant the pose becomes
    // "wave" — never reuse `elapsed`, which keeps counting up for the
    // whole component lifetime, so the wave always starts its phase
    // fresh at 0 regardless of how long the page has been open.
    if (pose === "wave" && prevPose.current !== "wave") {
      wavePhaseStart.current = elapsed.current;
    }
    if (pose !== "wave") {
      wavePhaseStart.current = null;
    }
    prevPose.current = pose;

    const target = DANTE_POSES[pose];
    const t = Math.min(1, delta * DAMPING);

    for (const key of Object.keys(target) as Array<keyof LimbRotations>) {
      const ref = refs[key].current;
      if (!ref) continue;

      let [tx, ty] = target[key];
      const [, , tz] = target[key];

      // Idle breathing: a subtle chest/spine oscillation so Dante
      // never looks perfectly frozen even in the "neutral" pose.
      if (pose === "idle_breathing" && key === "spine") {
        ty += Math.sin(elapsed.current * 1.2) * 0.01;
      }

      // Walk-in: a simple leg/arm swing cycle layered on the neutral pose.
      if (pose === "walk_in") {
        const swing = Math.sin(elapsed.current * 6);
        if (key === "hipL") tx = swing * 0.5;
        if (key === "hipR") tx = -swing * 0.5;
        if (key === "shoulderL") tx = -swing * 0.3;
        if (key === "shoulderR") tx = swing * 0.3;
      }

      // Wave: the shoulder holds its raised target above; the
      // forearm (elbow group) swings side to side for a fixed
      // number of cycles, then settles and holds — it does not loop.
      if (pose === "wave" && key === "elbowR" && wavePhaseStart.current !== null) {
        const waveT = elapsed.current - wavePhaseStart.current;
        const swing = waveT < WAVE_DURATION ? Math.sin(waveT * WAVE_FREQUENCY) * WAVE_AMPLITUDE : 0;
        ref.rotation.x = lerp(ref.rotation.x, tx, t);
        ref.rotation.y = lerp(ref.rotation.y, ty, t);
        ref.rotation.z = lerp(ref.rotation.z, tz + swing, t);
        continue;
      }

      ref.rotation.x = lerp(ref.rotation.x, tx, t);
      ref.rotation.y = lerp(ref.rotation.y, ty, t);
      ref.rotation.z = lerp(ref.rotation.z, tz, t);
    }
  });
  /* eslint-enable react-hooks/immutability */
}
