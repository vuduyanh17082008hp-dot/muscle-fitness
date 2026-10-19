import type { ExerciseDifficulty, ExerciseLibraryItem } from "@/lib/workouts/exercise-library";

/** Canonical exercise listing endpoint (WF-02). */
export const EXERCISES_ENDPOINT = "/api/exercises";

const DIFFICULTIES: readonly string[] = ["beginner", "intermediate", "advanced"];

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Fetches GET /api/exercises and maps rows to ExerciseLibraryItem.
 * Throws on HTTP failure or malformed payload — callers must surface it,
 * never fall back to an empty list.
 */
export async function fetchLibraryExercises(
  fetchImpl: typeof fetch = fetch,
): Promise<ExerciseLibraryItem[]> {
  const response = await fetchImpl(EXERCISES_ENDPOINT);

  if (!response.ok) {
    throw new Error(`Exercise library request failed (${response.status}).`);
  }

  const body = (await response.json()) as { exercises?: unknown };

  if (!Array.isArray(body.exercises)) {
    throw new Error("Exercise library response was malformed.");
  }

  return body.exercises.flatMap((row): ExerciseLibraryItem[] => {
    const r = (row ?? {}) as Record<string, unknown>;
    const name = str(r.name).trim();

    if (!name) return [];

    const difficulty = str(r.difficulty);

    return [
      {
        id: str(r.id) || null,
        slug: str(r.slug) || undefined,
        name,
        description: "",
        primaryMuscle: str(r.muscle_group) || "General",
        secondaryMuscles: [],
        equipment: str(r.equipment) || "Bodyweight",
        difficulty: (DIFFICULTIES.includes(difficulty)
          ? difficulty
          : "intermediate") as ExerciseDifficulty,
        movementPattern: "",
        source: "muscle-fitness",
        sourceUrl: null,
      },
    ];
  });
}
