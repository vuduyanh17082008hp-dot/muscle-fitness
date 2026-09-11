import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseMuscleContribution } from "@/lib/training/exercise-muscle-map";
import {
  computeMuscleVolume,
  type ExerciseSetLog,
  type MuscleVolumeBreakdown,
} from "@/lib/training/volume-engine";

/**
 * What-If Training Simulator (spec §24-§25).
 *
 * Pure, in-memory recalculation only — this module never reads from
 * or writes to the database. Given the current week's logged sets
 * and a list of hypothetical set deltas, it returns a CURRENT vs
 * SIMULATED comparison using the exact same deterministic volume
 * engine used everywhere else, so the simulator can never drift from
 * real analytics. Applying a change to a real plan is a separate,
 * explicit, user-confirmed action outside this module.
 */

export type WhatIfDelta = {
  exerciseId: string;
  /** Positive = add this many working sets, negative = remove. */
  setDelta: number;
};

export type WhatIfResult = {
  current: Map<CanonicalMuscle, MuscleVolumeBreakdown>;
  simulated: Map<CanonicalMuscle, MuscleVolumeBreakdown>;
  changedMuscles: CanonicalMuscle[];
};

function applyDeltas(
  currentSets: ExerciseSetLog[],
  deltas: WhatIfDelta[],
): ExerciseSetLog[] {
  const simulated = [...currentSets];

  for (const delta of deltas) {
    if (delta.setDelta > 0) {
      for (let i = 0; i < delta.setDelta; i += 1) {
        simulated.push({
          exerciseId: delta.exerciseId,
          setType: "working",
          completed: true,
        });
      }
    } else if (delta.setDelta < 0) {
      let remaining = Math.abs(delta.setDelta);

      for (let i = simulated.length - 1; i >= 0 && remaining > 0; i -= 1) {
        if (
          simulated[i].exerciseId === delta.exerciseId &&
          simulated[i].completed
        ) {
          simulated.splice(i, 1);
          remaining -= 1;
        }
      }
    }
  }

  return simulated;
}

export function simulateWhatIf(
  currentWeekSets: ExerciseSetLog[],
  deltas: WhatIfDelta[],
  contributionsByExercise: Map<string, ExerciseMuscleContribution[]>,
): WhatIfResult {
  const current = computeMuscleVolume(currentWeekSets, contributionsByExercise);

  const simulatedSets = applyDeltas(currentWeekSets, deltas);
  const simulated = computeMuscleVolume(simulatedSets, contributionsByExercise);

  const muscles = new Set<CanonicalMuscle>([
    ...current.keys(),
    ...simulated.keys(),
  ]);

  const changedMuscles = Array.from(muscles).filter((muscle) => {
    const currentTotal = current.get(muscle)?.totalEffectiveSets ?? 0;
    const simulatedTotal = simulated.get(muscle)?.totalEffectiveSets ?? 0;
    return currentTotal !== simulatedTotal;
  });

  return { current, simulated, changedMuscles };
}
