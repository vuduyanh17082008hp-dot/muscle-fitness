import { distance } from "@/lib/setvision/normalization";
import type { CompletedRep } from "@/lib/setvision/types";

/**
 * Bar path (spec Part B §17) — explicitly labeled MVP method.
 *
 * There is no real barbell detection here (no object-detection model,
 * no colored-marker requirement, no manual calibration UI in this
 * pass). `barProxyTrack` on each CompletedRep is a body-relative
 * landmark chosen per exercise in exercise-config.ts (wrist midpoint
 * for bench/deadlift, shoulder midpoint for squat) — it approximates
 * where the bar is because the lifter's hands/shoulders move with it,
 * but it is NOT the bar itself and will drift further from the true
 * bar path the more the lifter's grip/rack position differs from the
 * assumption. This is stated here and in docs/setvision.md rather
 * than presented as bar tracking.
 *
 * What this module actually measures: how much the bar-proxy drifts
 * horizontally from its own rep-start position — a genuinely useful,
 * exercise-agnostic signal (a wandering horizontal path usually means
 * a technique or balance issue) even though the ABSOLUTE path isn't
 * the real bar.
 */

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Max horizontal deviation of the bar-proxy from its rep-start x
 * position, normalized by torso length so it's comparable across
 * different camera distances. Null if the rep has fewer than 2
 * tracked points.
 */
export function computeRepHorizontalDeviation(
  rep: CompletedRep,
  torsoLength: number | null,
): number | null {
  if (rep.barProxyTrack.length < 2 || !torsoLength || torsoLength <= 0) {
    return null;
  }

  const startX = rep.barProxyTrack[0].landmark.x;

  const maxDeviation = rep.barProxyTrack.reduce((max, point) => {
    const deviation = Math.abs(point.landmark.x - startX);
    return Math.max(max, deviation);
  }, 0);

  return round(maxDeviation / torsoLength);
}

/**
 * Consistency across reps: 1 - coefficient of variation of each rep's
 * max horizontal deviation. Null with fewer than 2 reps that have a
 * valid deviation measurement.
 */
export function computeBarPathConsistency(
  reps: CompletedRep[],
  torsoLength: number | null,
): number | null {
  const deviations = reps
    .map((rep) => computeRepHorizontalDeviation(rep, torsoLength))
    .filter((v): v is number => v !== null);

  if (deviations.length < 2) {
    return null;
  }

  const mean = deviations.reduce((sum, v) => sum + v, 0) / deviations.length;

  if (mean === 0) {
    return 1;
  }

  const variance =
    deviations.reduce((sum, v) => sum + (v - mean) ** 2, 0) / deviations.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  return round(Math.min(1, Math.max(0, 1 - coefficientOfVariation)), 2);
}

export { distance };
