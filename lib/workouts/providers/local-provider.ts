import { resolveCanonicalMuscles } from "@/lib/training/muscle-taxonomy";
import { LOCAL_EXERCISE_LIBRARY, type ExerciseLibraryItem } from "@/lib/workouts/exercise-library";
import type { ExerciseProvider, ExerciseRecord } from "@/lib/workouts/providers/types";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function toExerciseRecord(item: ExerciseLibraryItem): ExerciseRecord {
  const providerId = item.slug ?? item.id ?? slugify(item.name);

  return {
    id: `muscle-fitness:${providerId}`,
    providerId,
    source: "muscle-fitness",

    canonicalName: item.name,
    slug: item.slug ?? slugify(item.name),

    primaryMuscles: resolveCanonicalMuscles([item.primaryMuscle]),
    secondaryMuscles: resolveCanonicalMuscles(item.secondaryMuscles),
    stabilizers: resolveCanonicalMuscles(item.stabilizers ?? []),

    equipment: [item.equipment],
    difficulty: item.difficulty,
    movementPattern: item.movementPattern,

    instructions: item.instructions ?? [],
    safetyCues: item.safetyCues ?? [],
    commonMistakes: item.commonMistakes ?? [],

    media: [],
    animationId: item.animationId,

    alternatives: item.alternatives ?? [],
    regressions: item.regressions ?? [],
    progressions: item.progressions ?? [],

    provenance: {
      sourceUrl: item.sourceUrl,
      raw: item,
    },
  };
}

export class LocalExerciseProvider implements ExerciseProvider {
  readonly id = "muscle-fitness";

  isAvailable(): boolean {
    return true;
  }

  async search(query?: string): Promise<ExerciseRecord[]> {
    const records = LOCAL_EXERCISE_LIBRARY.map(toExerciseRecord);

    if (!query?.trim()) {
      return records;
    }

    const normalized = query.trim().toLowerCase();
    return records.filter((record) => record.canonicalName.toLowerCase().includes(normalized));
  }

  async getById(id: string): Promise<ExerciseRecord | null> {
    const records = LOCAL_EXERCISE_LIBRARY.map(toExerciseRecord);
    return records.find((record) => record.id === id) ?? null;
  }
}
