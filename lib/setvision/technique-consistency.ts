import { angleAt } from "@/lib/form-coach/geometry";
import { computeBarPathConsistency } from "@/lib/setvision/bar-path";
import { computeRomConsistency, computeAllRepRom } from "@/lib/setvision/rom";
import { computeTempoConsistency } from "@/lib/setvision/tempo";
import type { ExerciseConfig } from "@/lib/setvision/exercise-config";
import type {
  CompletedRep,
  RepRom,
  RepTempo,
  TechniqueConsistency,
} from "@/lib/setvision/types";

/**
 * Technique Consistency (spec Part B §20).
 *
 * Deliberately NOT a single arbitrary "form score" — three
 * independently interpretable sub-metrics, each already computed and
 * documented in its own module (rom.ts, tempo.ts, bar-path.ts). This
 * module is purely a composer, plus the one additional signal
 * (asymmetry) that needs a raw pose frame instead of already-derived
 * rep summaries.
 */

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Left/right knee-angle asymmetry at each rep's bottom, averaged
 * across reps. Squat-only in this pass (spec §20 "when reliable") —
 * bench/deadlift asymmetry would need different joint pairs and a
 * camera angle that actually shows both sides equally well, which
 * isn't assumed here. Returns null when not computable, never a
 * fabricated 0.
 */
function computeSquatKneeAsymmetry(reps: CompletedRep[]): number | null {
  const perRepAsymmetry: number[] = [];

  for (const rep of reps) {
    const frame = rep.bottomFrame;
    if (!frame) continue;

    const leftHip = frame.left_hip;
    const leftKnee = frame.left_knee;
    const leftAnkle = frame.left_ankle;
    const rightHip = frame.right_hip;
    const rightKnee = frame.right_knee;
    const rightAnkle = frame.right_ankle;

    if (
      !leftHip || !leftKnee || !leftAnkle ||
      !rightHip || !rightKnee || !rightAnkle
    ) {
      continue;
    }

    const leftAngle = angleAt(leftHip, leftKnee, leftAnkle);
    const rightAngle = angleAt(rightHip, rightKnee, rightAnkle);

    perRepAsymmetry.push(Math.abs(leftAngle - rightAngle));
  }

  if (perRepAsymmetry.length === 0) {
    return null;
  }

  return round(
    perRepAsymmetry.reduce((sum, v) => sum + v, 0) / perRepAsymmetry.length,
  );
}

export function computeTechniqueConsistency(
  reps: CompletedRep[],
  config: ExerciseConfig,
  torsoLength: number | null,
  precomputed?: { rom?: RepRom[]; tempo?: RepTempo[] },
): TechniqueConsistency {
  const repRoms = precomputed?.rom ?? computeAllRepRom(reps, config);
  const romConsistency = computeRomConsistency(repRoms);
  const tempoConsistency = precomputed?.tempo
    ? computeTempoConsistency(precomputed.tempo)
    : null;
  const barPathConsistency = computeBarPathConsistency(reps, torsoLength);

  const asymmetryDeg =
    config.id === "squat" ? computeSquatKneeAsymmetry(reps) : null;

  return { romConsistency, tempoConsistency, barPathConsistency, asymmetryDeg };
}
