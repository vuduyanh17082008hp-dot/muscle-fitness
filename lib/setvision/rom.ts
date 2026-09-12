import type { ExerciseConfig } from "@/lib/setvision/exercise-config";
import type { CompletedRep, RepRom } from "@/lib/setvision/types";

/**
 * Range of Motion (spec Part B §15).
 *
 * romPercent is the rep's observed angle range (max - min of the
 * exercise's primary joint angle) divided by a rough per-exercise
 * reference range (see exercise-config.ts). This is NOT clinical
 * biomechanics — it's a consistent, comparable, per-lifter proxy.
 * It is deliberately left unclamped above 100%: a lifter with more
 * mobility than the reference range shouldn't have that silently
 * hidden.
 */

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function computeRepRom(rep: CompletedRep, config: ExerciseConfig): RepRom {
  const observedRangeDeg = rep.maxAngleDeg - rep.minAngleDeg;
  const romPercent = round((observedRangeDeg / config.referenceRangeDeg) * 100);

  return { repNumber: rep.repNumber, romPercent };
}

export function computeAllRepRom(
  reps: CompletedRep[],
  config: ExerciseConfig,
): RepRom[] {
  return reps.map((rep) => computeRepRom(rep, config));
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
