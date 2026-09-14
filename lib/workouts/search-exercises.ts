import { levenshtein } from "@/lib/training/muscle-search";
import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseDifficulty } from "@/lib/workouts/exercise-library";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";

/**
 * Deterministic, ranked exercise search for the Exercise Discovery
 * browser (spec §4). Never an LLM call. Sits beside
 * lib/workouts/filter-exercises-for-muscle.ts (which the Muscle
 * Atlas's inline Exercises tab keeps using unchanged) rather than
 * replacing it — a different consumer with a simpler need.
 */

export type ExerciseSearchOptions = {
  query?: string;
  muscle?: CanonicalMuscle;
  /** Exact-match equipment select value from the UI — narrows the result set. */
  equipmentFilter?: string;
  difficulty?: ExerciseDifficulty;
  movementPattern?: string;
  /** Personalization ordering only — never hides. "all" (the default) disables personalization entirely. */
  availableEquipment?: string[] | "all";
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lower is better; null means "no match at all — exclude from results." */
function rankByName(name: string, query: string): number | null {
  const normalizedName = name.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (new RegExp(`\\b${escapeRegExp(normalizedQuery)}`).test(normalizedName)) return 2;
  if (normalizedName.includes(normalizedQuery)) return 3;

  const distance = levenshtein(normalizedName, normalizedQuery);
  const threshold = Math.min(4, Math.ceil(normalizedQuery.length / 2));
  return distance <= threshold ? 4 : null;
}

function isEquipmentCompatible(record: ExerciseRecord, availableEquipment: string[] | "all"): boolean {
  if (availableEquipment === "all") return true;
  return record.equipment.some((equipment) => availableEquipment.includes(equipment));
}

export function searchExerciseRecords(
  records: ExerciseRecord[],
  options: ExerciseSearchOptions = {},
): ExerciseRecord[] {
  const { query, muscle, equipmentFilter, difficulty, movementPattern, availableEquipment = "all" } = options;

  let filtered = records;

  if (muscle) {
    filtered = filtered.filter(
      (record) =>
        record.primaryMuscles.includes(muscle) ||
        record.secondaryMuscles.includes(muscle) ||
        record.stabilizers.includes(muscle),
    );
  }

  if (equipmentFilter) {
    filtered = filtered.filter((record) => record.equipment.includes(equipmentFilter));
  }

  if (difficulty) {
    filtered = filtered.filter((record) => record.difficulty === difficulty);
  }

  if (movementPattern) {
    filtered = filtered.filter((record) => record.movementPattern === movementPattern);
  }

  const trimmedQuery = query?.trim();

  const ranked: Array<{ record: ExerciseRecord; rank: number }> = [];

  if (trimmedQuery) {
    for (const record of filtered) {
      const rank = rankByName(record.canonicalName, trimmedQuery);
      if (rank !== null) ranked.push({ record, rank });
    }
  } else {
    for (const record of filtered) {
      ranked.push({ record, rank: 0 });
    }
  }

  return ranked
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;

      const aCompatible = isEquipmentCompatible(a.record, availableEquipment);
      const bCompatible = isEquipmentCompatible(b.record, availableEquipment);
      if (aCompatible !== bCompatible) return aCompatible ? -1 : 1;

      return a.record.canonicalName.localeCompare(b.record.canonicalName);
    })
    .map((entry) => entry.record);
}
