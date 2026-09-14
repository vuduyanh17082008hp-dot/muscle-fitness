import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseDifficulty, ExerciseLibraryItem } from "@/lib/workouts/exercise-library";

/**
 * Normalized exercise read model for exercise-discovery UI (Muscle
 * Intelligence Phase 2). One shape, regardless of where the exercise
 * actually came from — UI components consume ONLY this DTO, never a
 * provider-specific shape directly (spec §2).
 *
 * `primaryMuscles`/`secondaryMuscles`/`stabilizers` are the "expected
 * training emphasis" model (spec §9-10): a categorical tier
 * (primary/secondary/stabilizer), not a numeric activation score —
 * that distinction is deliberate. The real NUMERIC weekly exposure
 * model already exists one layer up, in
 * lib/training/volume-engine.ts/weekly-analytics.ts (feeding
 * AthleteState.training.muscles), and is not duplicated here.
 */

export type ExerciseMedia = {
  type: "image" | "video";
  url: string;
  angle?: string;
  gender?: "male" | "female";
  provider: string;
  /** License/attribution note — required whenever `url` isn't first-party. */
  license?: string;
};

export type ExerciseRecord = {
  id: string;
  providerId: string;
  source: "muscle-fitness" | "wger" | "musclewiki";

  canonicalName: string;
  slug: string;

  primaryMuscles: CanonicalMuscle[];
  secondaryMuscles: CanonicalMuscle[];
  stabilizers: CanonicalMuscle[];

  equipment: string[];
  difficulty: ExerciseDifficulty;
  movementPattern: string;

  /** Typed for future providers — no current data source populates these; always undefined today. */
  forceType?: "push" | "pull" | "static";
  mechanic?: "compound" | "isolation";
  grips?: string[];

  instructions: string[];
  safetyCues: string[];
  commonMistakes: string[];

  /** Always [] today — no exercise in the repo has real video/image media (see docs/muscle-intelligence.md limitations). */
  media: ExerciseMedia[];
  animationId?: string;

  alternatives: string[];
  regressions: string[];
  progressions: string[];

  provenance: {
    sourceUrl: string | null;
    /** The original record this was normalized from — for UI code that still needs a raw ExerciseLibraryItem (e.g. ExerciseTechniquePanel). */
    raw: ExerciseLibraryItem;
  };
};

/**
 * One provider = one exercise data source. `LocalExerciseProvider` is
 * the only one that's ever actually populated today;
 * `MuscleWikiProvider` is a real, typed, always-disabled-without-a-key
 * stub (spec §3) — never a scraped or fabricated integration.
 */
export interface ExerciseProvider {
  readonly id: string;
  isAvailable(): boolean;
  search(query?: string): Promise<ExerciseRecord[]>;
  getById(id: string): Promise<ExerciseRecord | null>;
}
