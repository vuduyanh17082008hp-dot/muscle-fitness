/**
 * Canonical muscle taxonomy for Training Intelligence.
 *
 * Every muscle-level analytic (fractional volume, baselines,
 * recommendations, the Muscle Map) resolves to one of these ids.
 * The rest of the app currently uses two different free-text
 * conventions for muscle names:
 *
 *  - Title Case, used by `lib/training/types.ts` (`MuscleGroup`) and
 *    `lib/workouts/exercise-library.ts` (`LOCAL_EXERCISE_LIBRARY`)
 *  - snake_case, used by `exercise_library.primary_muscle` /
 *    `secondary_muscles` in the database seed
 *
 * `resolveCanonicalMuscle` maps both conventions (plus a few common
 * synonyms) onto this single taxonomy so analytics never fork on
 * naming differences.
 */

export type CanonicalMuscle =
  | "chest"
  | "upper_chest"
  | "anterior_deltoid"
  | "lateral_deltoid"
  | "rear_deltoid"
  | "latissimus_dorsi"
  | "upper_back"
  | "trapezius"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quadriceps"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abdominals"
  | "lower_back";

export const CANONICAL_MUSCLES: CanonicalMuscle[] = [
  "chest",
  "upper_chest",
  "anterior_deltoid",
  "lateral_deltoid",
  "rear_deltoid",
  "latissimus_dorsi",
  "upper_back",
  "trapezius",
  "biceps",
  "triceps",
  "forearms",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "abdominals",
  "lower_back",
];

export const MUSCLE_DISPLAY_NAME: Record<CanonicalMuscle, string> = {
  chest: "Chest",
  upper_chest: "Upper Chest",
  anterior_deltoid: "Anterior Deltoid",
  lateral_deltoid: "Lateral Deltoid",
  rear_deltoid: "Rear Deltoid",
  latissimus_dorsi: "Latissimus Dorsi",
  upper_back: "Upper Back",
  trapezius: "Trapezius",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quadriceps: "Quadriceps",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  abdominals: "Abdominals",
  lower_back: "Lower Back",
};

/**
 * Alias -> canonical muscle. Keys are normalized (lowercase,
 * spaces/dashes collapsed to underscores) before lookup.
 */
const MUSCLE_ALIASES: Record<string, CanonicalMuscle> = {
  chest: "chest",
  pecs: "chest",
  pectorals: "chest",

  upper_chest: "upper_chest",

  anterior_deltoid: "anterior_deltoid",
  anterior_deltoids: "anterior_deltoid",
  front_delt: "anterior_deltoid",
  front_delts: "anterior_deltoid",
  front_deltoid: "anterior_deltoid",
  front_deltoids: "anterior_deltoid",
  shoulders: "anterior_deltoid",
  shoulder: "anterior_deltoid",

  lateral_deltoid: "lateral_deltoid",
  lateral_deltoids: "lateral_deltoid",
  side_delt: "lateral_deltoid",
  side_delts: "lateral_deltoid",
  side_deltoid: "lateral_deltoid",
  side_deltoids: "lateral_deltoid",

  rear_deltoid: "rear_deltoid",
  rear_deltoids: "rear_deltoid",
  rear_delt: "rear_deltoid",
  rear_delts: "rear_deltoid",

  latissimus_dorsi: "latissimus_dorsi",
  lats: "latissimus_dorsi",
  lat: "latissimus_dorsi",
  back_width: "latissimus_dorsi",

  upper_back: "upper_back",
  back_thickness: "upper_back",
  mid_back: "upper_back",
  rhomboids: "upper_back",
  external_rotators: "upper_back",

  trapezius: "trapezius",
  traps: "trapezius",
  upper_traps: "trapezius",

  biceps: "biceps",
  bicep: "biceps",

  triceps: "triceps",
  tricep: "triceps",

  forearms: "forearms",
  forearm: "forearms",

  quadriceps: "quadriceps",
  quads: "quadriceps",
  quad: "quadriceps",
  adductors: "quadriceps",

  hamstrings: "hamstrings",
  hamstring: "hamstrings",

  glutes: "glutes",
  glute: "glutes",

  calves: "calves",
  calf: "calves",

  abdominals: "abdominals",
  abs: "abdominals",
  core: "abdominals",

  lower_back: "lower_back",
  erectors: "lower_back",
  spinal_erectors: "lower_back",
};

function normalizeAliasKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Resolves any known muscle label (either taxonomy convention, or a
 * common synonym) to a canonical muscle id. Returns null for
 * unrecognized text rather than guessing — callers must treat that
 * as missing/unmapped data, never as "no contribution".
 */
export function resolveCanonicalMuscle(
  label: string | null | undefined,
): CanonicalMuscle | null {
  if (!label) {
    return null;
  }

  const key = normalizeAliasKey(label);

  return MUSCLE_ALIASES[key] ?? null;
}

/**
 * Resolves a list of muscle labels, silently dropping anything
 * unrecognized (deduplicated).
 */
export function resolveCanonicalMuscles(
  labels: Array<string | null | undefined>,
): CanonicalMuscle[] {
  const resolved = new Set<CanonicalMuscle>();

  for (const label of labels) {
    const muscle = resolveCanonicalMuscle(label);

    if (muscle) {
      resolved.add(muscle);
    }
  }

  return Array.from(resolved);
}
