import type { ExerciseConfig } from "@/lib/setvision/exercise-config";
import type { CompletedRep, RepRom } from "@/lib/setvision/types";

/**
 * Range of Motion (spec Part B §15).
 *
 * rangeDeg is the rep's observed 2D range of the exercise's primary joint
 * angle: from the standing/lockout angle just before the descent to the
 * deepest angle. romPercent is that range as a % of a rough per-exercise
 * reference range (exercise-config.ts) — NOT clinical biomechanics and not
 * calibrated: full-depth reps on real side-view squats read 169–191%, so the
 * UI shows rangeDeg and never presents romPercent as a ROM score.
 *
 * A rep whose range is not a real joint range (non-finite, ≤ 0° or > 180°,
 * which no 2D joint angle can span) gets NO ROM entry — never a made-up 0.
 */

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function computeRepRom(rep: CompletedRep, config: ExerciseConfig): RepRom | null {
  const observedRangeDeg = rep.maxAngleDeg - rep.minAngleDeg;

  if (!Number.isFinite(observedRangeDeg) || observedRangeDeg <= 0 || observedRangeDeg > 180) {
    return null;
  }

  return {
    repNumber: rep.repNumber,
    rangeDeg: round(observedRangeDeg),
    romPercent: round((observedRangeDeg / config.referenceRangeDeg) * 100),
  };
}

export function computeAllRepRom(
  reps: CompletedRep[],
  config: ExerciseConfig,
): RepRom[] {
  return reps.map((rep) => computeRepRom(rep, config)).filter((r): r is RepRom => r !== null);
}

/**
 * ROM consistency across reps: 1 - coefficient of variation, clamped
 * to [0, 1]. Requires at least 2 reps — a single rep has nothing to
 * be "consistent" with, so this returns null rather than a
 * meaningless 1.0.
 */
export function computeRomConsistency(repRoms: RepRom[]): number | null {
  if (repRoms.length < 2) {
    return null;
  }

  const values = repRoms.map((r) => r.romPercent);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  if (mean <= 0) {
    return null;
  }

  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  return round(Math.min(1, Math.max(0, 1 - coefficientOfVariation)), 2);
}
