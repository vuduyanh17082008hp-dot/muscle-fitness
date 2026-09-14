import {
  resolveCanonicalMuscle,
  resolveCanonicalMuscles,
  type CanonicalMuscle,
} from "@/lib/training/muscle-taxonomy";
import type { ExerciseDifficulty, ExerciseLibraryItem } from "@/lib/workouts/exercise-library";

/**
 * Pure filter for the Muscle Atlas's Exercises tab. Never invents an
 * exercise — only narrows `LOCAL_EXERCISE_LIBRARY` (or any subset of
 * it) down to real entries that already resolve to the selected
 * muscle via the existing taxonomy, exactly like
 * exercise-technique-panel.tsx already does for its own muscle map.
 */

export type ExerciseInvolvement = "primary" | "secondary";

export type ExerciseMatch = {
  exercise: ExerciseLibraryItem;
  involvement: ExerciseInvolvement;
};

export type ExerciseFilterOptions = {
  /** When provided (and `equipment` isn't explicitly "show all"), only exercises whose `equipment` is in this list are kept. */
  availableEquipment?: string[] | "all";
  difficulty?: ExerciseDifficulty;
  movementPattern?: string;
};

function matchesMuscle(exercise: ExerciseLibraryItem, muscle: CanonicalMuscle): ExerciseInvolvement | null {
  if (resolveCanonicalMuscle(exercise.primaryMuscle) === muscle) {
    return "primary";
  }

  if (resolveCanonicalMuscles(exercise.secondaryMuscles).includes(muscle)) {
    return "secondary";
  }

  return null;
}

export function filterExercisesForMuscle(
  exercises: ExerciseLibraryItem[],
  muscle: CanonicalMuscle,
  options: ExerciseFilterOptions = {},
): ExerciseMatch[] {
  const { availableEquipment = "all", difficulty, movementPattern } = options;

  const matches: ExerciseMatch[] = [];

  for (const exercise of exercises) {
    const involvement = matchesMuscle(exercise, muscle);
    if (!involvement) continue;

    if (difficulty && exercise.difficulty !== difficulty) continue;
    if (movementPattern && exercise.movementPattern !== movementPattern) continue;
    if (availableEquipment !== "all" && !availableEquipment.includes(exercise.equipment)) continue;

    matches.push({ exercise, involvement });
  }

  // Primary-mover matches first, alphabetical within each group — a
  // stable, predictable order rather than the library's insertion order.
  return matches.sort((a, b) => {
    if (a.involvement !== b.involvement) {
      return a.involvement === "primary" ? -1 : 1;
    }
    return a.exercise.name.localeCompare(b.exercise.name);
  });
}
