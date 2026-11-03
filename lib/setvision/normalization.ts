import { midpoint } from "@/lib/form-coach/geometry";
import { sameSidePoints } from "@/lib/setvision/exercise-config";
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

/**
 * Shoulder-to-hip distance on ONE clearly tracked body side (score ≥ 0.4,
 * same floor as the primary angles), in landmark pixel units. Null when
 * neither side is clearly tracked — a low-score shoulder or hip can make the
 * torso near-zero and blow normalized speeds up to implausible values.
 */
export function estimateTorsoLength(frame: PoseFrame): number | null {
  const points = sameSidePoints(frame, ["shoulder", "hip"]);
  if (!points) return null;

  const length = distance(points[0], points[1]);
  return Number.isFinite(length) && length > 0 ? length : null;
}

export function averageTorsoLength(frames: PoseFrame[]): number | null {
  const lengths = frames
    .map(estimateTorsoLength)
    .filter((v): v is number => v !== null);

  if (lengths.length === 0) return null;

  return lengths.reduce((sum, v) => sum + v, 0) / lengths.length;
}

export { midpoint };
