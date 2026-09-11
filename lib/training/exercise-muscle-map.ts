import {
  resolveCanonicalMuscle,
  type CanonicalMuscle,
} from "@/lib/training/muscle-taxonomy";

export type MuscleContributionRole = "primary" | "secondary" | "stabilizer";

export type MuscleContributionSource = "system" | "user" | "fallback";

/**
 * A single exercise -> muscle contribution weight.
 *
 * `contribution` is a MODELING ESTIMATE (1.0 / 0.5 / 0.25 / 0), not a
 * measured physiological quantity. See supabase migration
 * 20260913090000_training_intelligence.sql for the versioned,
 * spec-sourced coefficients for verified exercises.
 */
export type ExerciseMuscleContribution = {
  muscle: CanonicalMuscle;
  role: MuscleContributionRole;
  contribution: number;
  mappingVersion: number;
  source: MuscleContributionSource;
};

export const CURRENT_MAPPING_VERSION = 1;

/** Conservative default coefficients when an exercise has no explicit mapping. */
const FALLBACK_CONTRIBUTION: Record<MuscleContributionRole, number> = {
  primary: 1.0,
  secondary: 0.5,
  stabilizer: 0.25,
};

/**
 * Derives a conservative contribution list directly from an
 * exercise's primary/secondary muscle text (the fields every
 * exercise — system or user-created — already has). Used only when
 * no explicit `exercise_muscle_contributions` row exists for the
 * exercise (see spec §8: "Initial conservative mappings"; unmapped
 * exercises fall back to primary=1.0 / secondary=0.5).
 *
 * Unrecognized muscle text is dropped rather than guessed at.
 */
export function deriveFallbackContributions(
  primaryMuscle: string | null | undefined,
  secondaryMuscles: Array<string | null | undefined> = [],
): ExerciseMuscleContribution[] {
  const contributions: ExerciseMuscleContribution[] = [];
  const seen = new Set<CanonicalMuscle>();

  const primary = resolveCanonicalMuscle(primaryMuscle);

  if (primary) {
    contributions.push({
      muscle: primary,
      role: "primary",
      contribution: FALLBACK_CONTRIBUTION.primary,
      mappingVersion: CURRENT_MAPPING_VERSION,
      source: "fallback",
    });

    seen.add(primary);
  }

  for (const label of secondaryMuscles) {
    const muscle = resolveCanonicalMuscle(label);

    if (!muscle || seen.has(muscle)) {
      continue;
    }

    contributions.push({
      muscle,
      role: "secondary",
      contribution: FALLBACK_CONTRIBUTION.secondary,
      mappingVersion: CURRENT_MAPPING_VERSION,
      source: "fallback",
    });

    seen.add(muscle);
  }

  return contributions;
}

/**
 * Merges explicit (system or user) contribution rows for an exercise
 * with the fallback derivation. Explicit rows always take priority;
 * fallback only fills in muscles no explicit row already covers.
 */
export function mergeExplicitAndFallback(
  explicit: ExerciseMuscleContribution[],
  primaryMuscle: string | null | undefined,
  secondaryMuscles: Array<string | null | undefined> = [],
): ExerciseMuscleContribution[] {
  if (explicit.length > 0) {
    return explicit;
  }

  return deriveFallbackContributions(primaryMuscle, secondaryMuscles);
}
