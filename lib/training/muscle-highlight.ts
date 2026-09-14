import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";

/**
 * ONE deterministic highlight-level model for the Muscle Atlas SVG,
 * shared by Exercise Emphasis and Recent Training Exposure instead of
 * each computing its own ad hoc color/opacity. "selected" always
 * outranks either — enforced by the caller applying it as an outline
 * on top of whichever fill/opacity below already applies, never a
 * second competing fill (spec: "one coherent selected/high state, not
 * stacked conflicting effects").
 */
export type MuscleHighlightLevel =
  | "selected"
  | "primary"
  | "secondary"
  | "supporting"
  | "exposure-high"
  | "exposure-moderate"
  | "exposure-low"
  | "inactive";

/** Every level renders in the brand lime family except the neutral "no data"/"not involved" states — never a rainbow of colors. */
export const HIGHLIGHT_FILL: Record<MuscleHighlightLevel, string> = {
  selected: "var(--mf-glass-brand)",
  primary: "var(--mf-glass-brand)",
  secondary: "var(--mf-glass-brand)",
  supporting: "var(--mf-glass-brand)",
  "exposure-high": "var(--mf-glass-brand)",
  "exposure-moderate": "var(--mf-glass-brand)",
  "exposure-low": "var(--mf-glass-text-muted)",
  inactive: "var(--mf-glass-elevated)",
};

export const HIGHLIGHT_OPACITY: Record<MuscleHighlightLevel, number> = {
  selected: 1,
  primary: 0.95,
  secondary: 0.62,
  supporting: 0.28,
  "exposure-high": 0.9,
  "exposure-moderate": 0.55,
  "exposure-low": 0.3,
  inactive: 1,
};

export type ExerciseEmphasisMap = Partial<Record<CanonicalMuscle, "primary" | "secondary" | "supporting">>;

/**
 * Derives which muscles a given exercise trains, and at what tier,
 * directly from the canonical Exercise Library's already-resolved
 * `primaryMuscles`/`secondaryMuscles`/`stabilizers`
 * (lib/workouts/providers/types.ts, populated by
 * lib/workouts/providers/local-provider.ts's `toExerciseRecord` via
 * `resolveCanonicalMuscles`) — never a second exercise→muscle mapping
 * table. A muscle already counted at a stronger tier keeps that tier
 * rather than being downgraded by a weaker one appearing later.
 */
export function buildExerciseEmphasisMap(record: ExerciseRecord): ExerciseEmphasisMap {
  const map: ExerciseEmphasisMap = {};

  for (const muscle of record.primaryMuscles) {
    map[muscle] = "primary";
  }

  for (const muscle of record.secondaryMuscles) {
    if (!map[muscle]) map[muscle] = "secondary";
  }

  for (const muscle of record.stabilizers) {
    if (!map[muscle]) map[muscle] = "supporting";
  }

  return map;
}
