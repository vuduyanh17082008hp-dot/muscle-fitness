import { distance } from "@/lib/setvision/normalization";
import type { CompletedRep, RepVelocity, VelocityResult } from "@/lib/setvision/types";

/**
 * Velocity (spec Part B §18-19).
 *
 * TRUE ESTIMATED VELOCITY vs. NORMALIZED MOTION SPEED, kept explicit:
 *
 *   - By default (no calibration), speed is measured in
 *     "torso-lengths per second" — the bar-proxy's concentric-phase
 *     path length divided by torso length and by time. This is
 *     `calibrated: false`, `unit: "torso-lengths/s"`. It is
 *     comparable across sessions for the SAME lifter, and unrelated
 *     to actual m/s.
 *   - If the caller supplies `metersPerTorsoLength` (e.g. the user
 *     measured their own torso length once, spec §18 option C, or a
 *     known plate-diameter reference was used to derive it, option
 *     B), speeds are converted to real m/s and marked
 *     `calibrated: true`. Never displayed as m/s otherwise — this is
 *     the one rule this module cannot be talked out of by a UI
 *     wanting a "nicer" unit.
 *
 * Only the CONCENTRIC phase is measured, matching standard
 * velocity-based-training practice (concentric velocity is what
 * training tools like this are normally used for).
 */

/**
 * A barbell's mean concentric speed is roughly 0.2–2 m/s and a torso roughly
 * 0.4–0.6 m, i.e. well under 10 torso-lengths/s. A higher normalized speed means
 * the proxy jumped between mis-tracked points, so the rep gets no speed at all.
 */
// ponytail: a-priori bound, not fitted to labeled clips.
export const MAX_PLAUSIBLE_TORSO_LENGTHS_PER_SEC = 10;

/** Velocity loss is (first − final) / first: ≤ 1, negative when the final rep is faster. Lower bound = what setvision_analyses.velocity_loss numeric(4,3) holds. */
export const MIN_VELOCITY_LOSS = -9.999;

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeRepConcentricSpeed(
  rep: CompletedRep,
  torsoLength: number | null,
): RepVelocity | null {
  if (!torsoLength || torsoLength <= 0) {
    return null;
  }

  const ascentPoints = rep.barProxyTrack.filter(
    (p) => p.timestampMs >= rep.ascentStartAtMs,
  );

  if (ascentPoints.length < 2) {
    return null;
  }

  let pathLength = 0;

  for (let i = 1; i < ascentPoints.length; i += 1) {
    pathLength += distance(ascentPoints[i - 1].landmark, ascentPoints[i].landmark);
  }

  const durationSec =
    (ascentPoints[ascentPoints.length - 1].timestampMs - ascentPoints[0].timestampMs) /
    1000;

  if (durationSec <= 0) {
    return null;
  }

  const speedTorsoLengthsPerSec = pathLength / torsoLength / durationSec;

  // Not a value: tracking noise, not motion (see MAX_PLAUSIBLE_TORSO_LENGTHS_PER_SEC).
  if (!Number.isFinite(speedTorsoLengthsPerSec) || speedTorsoLengthsPerSec > MAX_PLAUSIBLE_TORSO_LENGTHS_PER_SEC) {
    return null;
  }

  return { repNumber: rep.repNumber, meanSpeed: round(speedTorsoLengthsPerSec) };
}

function computeVelocityLoss(perRep: RepVelocity[]): number | null {
  if (perRep.length < 2) {
    return null;
  }

  const first = perRep[0].meanSpeed;
  const last = perRep[perRep.length - 1].meanSpeed;

  if (first <= 0) {
    return null;
  }

  const loss = round((first - last) / first, 3);
  // A final rep >11x faster than the first is a tracking artefact, not a speed gain (and won't fit numeric(4,3)).
  return loss >= MIN_VELOCITY_LOSS ? loss : null;
}

export function computeVelocity(
  reps: CompletedRep[],
  torsoLength: number | null,
  options: { metersPerTorsoLength?: number | null } = {},
): VelocityResult {
  const rawPerRep = reps
    .map((rep) => computeRepConcentricSpeed(rep, torsoLength))
    .filter((v): v is RepVelocity => v !== null);

  const calibrated =
    typeof options.metersPerTorsoLength === "number" &&
    options.metersPerTorsoLength > 0;

  const perRep = calibrated
    ? rawPerRep.map((v) => ({
        ...v,
        meanSpeed: round(v.meanSpeed * (options.metersPerTorsoLength as number)),
      }))
    : rawPerRep;

  if (perRep.length === 0) {
    return {
      calibrated,
      unit: calibrated ? "m/s" : "torso-lengths/s",
      perRep: [],
      mean: null,
      peak: null,
      final: null,
      velocityLoss: null,
    };
  }

  const speeds = perRep.map((v) => v.meanSpeed);

  return {
    calibrated,
    unit: calibrated ? "m/s" : "torso-lengths/s",
    perRep,
    mean: round(speeds.reduce((sum, v) => sum + v, 0) / speeds.length),
    peak: round(Math.max(...speeds)),
    final: round(speeds[speeds.length - 1]),
    velocityLoss: computeVelocityLoss(perRep),
  };
}
