import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseMuscleContribution } from "@/lib/training/exercise-muscle-map";

/**
 * Fractional Effective Volume Engine.
 *
 * Deterministic conversion of logged working sets into per-muscle
 * direct / indirect / total effective sets, per spec §11:
 *
 *   effectiveSetsForMuscle = Σ(eligibleWorkingSet × exerciseMuscleContribution)
 *
 * This module is pure (no I/O, no dates) so it stays unit-testable
 * and independent of how sets are loaded from the database.
 */

export type SetClassification =
  | "warmup"
  | "working"
  | "backoff"
  | "drop"
  | "failure";

/**
 * Warm-up sets never contribute to training volume (spec §10).
 * Every other logged set type is treated as a discrete physical set
 * — the schema logs each set as its own row, so a "drop" row is one
 * physical set, not a sub-component of another row, and is counted
 * exactly once.
 */
export const VOLUME_ELIGIBLE_SET_TYPES: SetClassification[] = [
  "working",
  "backoff",
  "drop",
  "failure",
];

export type ExerciseSetLog = {
  exerciseId: string;
  setType: SetClassification;
  completed: boolean;
};

export type MuscleContributionBreakdownEntry = {
  exerciseId: string;
  role: ExerciseMuscleContribution["role"];
  contribution: number;
  eligibleSets: number;
  effectiveSets: number;
};

export type MuscleVolumeBreakdown = {
  muscle: CanonicalMuscle;
  directSets: number;
  indirectRawSets: number;
  indirectEffectiveSets: number;
  totalEffectiveSets: number;
  contributingExercises: MuscleContributionBreakdownEntry[];
};

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isEligible(set: ExerciseSetLog): boolean {
  return set.completed && VOLUME_ELIGIBLE_SET_TYPES.includes(set.setType);
}

/**
 * Computes per-muscle fractional effective volume from a flat list
 * of logged sets and a per-exercise contribution map.
 *
 * `contributionsByExercise` should already have fallback derivation
 * applied (see `mergeExplicitAndFallback`) — an exercise missing
 * from the map contributes nothing and is silently skipped, since an
 * exercise with genuinely no resolvable muscle mapping cannot be
 * attributed to any muscle.
 */
export function computeMuscleVolume(
  sets: ExerciseSetLog[],
  contributionsByExercise: Map<string, ExerciseMuscleContribution[]>,
): Map<CanonicalMuscle, MuscleVolumeBreakdown> {
  const eligibleCountByExercise = new Map<string, number>();

  for (const set of sets) {
    if (!isEligible(set)) {
      continue;
    }

    eligibleCountByExercise.set(
      set.exerciseId,
      (eligibleCountByExercise.get(set.exerciseId) ?? 0) + 1,
    );
  }

  const result = new Map<CanonicalMuscle, MuscleVolumeBreakdown>();

  function getOrCreate(muscle: CanonicalMuscle): MuscleVolumeBreakdown {
    let entry = result.get(muscle);

    if (!entry) {
      entry = {
        muscle,
        directSets: 0,
        indirectRawSets: 0,
        indirectEffectiveSets: 0,
        totalEffectiveSets: 0,
        contributingExercises: [],
      };

      result.set(muscle, entry);
    }

    return entry;
  }

  for (const [exerciseId, eligibleSets] of eligibleCountByExercise) {
    if (eligibleSets === 0) {
      continue;
    }

    const contributions = contributionsByExercise.get(exerciseId);

    if (!contributions || contributions.length === 0) {
      continue;
    }

    for (const contribution of contributions) {
      const entry = getOrCreate(contribution.muscle);
      const effectiveSets = eligibleSets * contribution.contribution;

      if (contribution.role === "primary") {
        entry.directSets += effectiveSets;
      } else {
        entry.indirectRawSets += eligibleSets;
        entry.indirectEffectiveSets += effectiveSets;
      }

      entry.contributingExercises.push({
        exerciseId,
        role: contribution.role,
        contribution: contribution.contribution,
        eligibleSets,
        effectiveSets: round(effectiveSets),
      });
    }
  }

  for (const entry of result.values()) {
    entry.directSets = round(entry.directSets);
    entry.indirectRawSets = round(entry.indirectRawSets);
    entry.indirectEffectiveSets = round(entry.indirectEffectiveSets);
    entry.totalEffectiveSets = round(
      entry.directSets + entry.indirectEffectiveSets,
    );

    entry.contributingExercises.sort(
      (a, b) => b.effectiveSets - a.effectiveSets,
    );
  }

  return result;
}
