import { getBestSide, midpoint } from "@/lib/form-coach/geometry";
import type { Landmark, PoseFrame } from "@/lib/setvision/types";

/**
 * Shared normalization helpers for velocity.ts and bar-path.ts.
 *
 * Monocular video gives pixel coordinates with an unknown, per-video
 * scale (camera distance/zoom vary shot to shot). Rather than
 * pretending those pixels are real-world units, every distance is
 * expressed as a multiple of the lifter's OWN torso length in that
 * same frame — a body-relative unit that stays roughly comparable
 * across different camera setups for the SAME lifter, though not
 * across different lifters with different proportions. This is the
 * "normalized velocity metric" option from spec §18, chosen because
 * it needs no extra calibration input to produce something
 * meaningful, while still being explicit that it isn't true m/s
 * (see VelocityResult.calibrated in types.ts).
 */

export function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shoulder-midpoint to hip-midpoint distance, in the same pixel units as the pose landmarks. Null if either side isn't visible. */
export function estimateTorsoLength(frame: PoseFrame): number | null {
  const shoulder = getBestSide(frame, "shoulder");
  const hip = getBestSide(frame, "hip");

  if (!shoulder || !hip) return null;

  return distance(shoulder, hip);
}

export function averageTorsoLength(frames: PoseFrame[]): number | null {
  const lengths = frames
    .map(estimateTorsoLength)
    .filter((v): v is number => v !== null && v > 0);

  if (lengths.length === 0) return null;

  return lengths.reduce((sum, v) => sum + v, 0) / lengths.length;
}

export { midpoint };
