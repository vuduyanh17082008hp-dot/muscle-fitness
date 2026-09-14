import { describe, expect, it } from "vitest";

import { searchExerciseRecords } from "@/lib/workouts/search-exercises";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";

function record(overrides: Partial<ExerciseRecord> = {}): ExerciseRecord {
  return {
    id: overrides.id ?? "muscle-fitness:bench-press",
    providerId: overrides.providerId ?? "bench-press",
    source: "muscle-fitness",
    canonicalName: overrides.canonicalName ?? "Bench Press",
    slug: overrides.slug ?? "bench-press",
    primaryMuscles: overrides.primaryMuscles ?? ["chest"],
    secondaryMuscles: overrides.secondaryMuscles ?? ["triceps"],
    stabilizers: overrides.stabilizers ?? [],
    equipment: overrides.equipment ?? ["Barbell"],
    difficulty: overrides.difficulty ?? "intermediate",
    movementPattern: overrides.movementPattern ?? "Horizontal Push",
    instructions: [],
    safetyCues: [],
    commonMistakes: [],
    media: [],
    alternatives: [],
    regressions: [],
    progressions: [],
    provenance: { sourceUrl: null, raw: {} as never },
    ...overrides,
  };
}

describe("searchExerciseRecords", () => {
  it("ranks an exact name match first (Test A)", () => {
    const records = [
      record({ id: "a", canonicalName: "Incline Bench Press" }),
      record({ id: "b", canonicalName: "Bench Press" }),
    ];
    const result = searchExerciseRecords(records, { query: "Bench Press" });
    expect(result[0].id).toBe("b");
  });

  it("ranks a starts-with match above a mid-string substring match", () => {
    const records = [
      record({ id: "a", canonicalName: "Cable Chest Press" }),
      record({ id: "b", canonicalName: "Chest Press Machine" }),
    ];
    const result = searchExerciseRecords(records, { query: "chest" });
    expect(result[0].id).toBe("b");
  });

  it("excludes exercises that don't match the query at all (Test B)", () => {
    const records = [record({ id: "a", canonicalName: "Bench Press" })];
    const result = searchExerciseRecords(records, { query: "zzz-nonsense-999" });
    expect(result).toEqual([]);
  });

  it("filters by muscle across primary/secondary/stabilizer (Test C)", () => {
    const records = [
      record({ id: "a", primaryMuscles: ["chest"] }),
      record({ id: "b", primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes"] }),
    ];
    expect(searchExerciseRecords(records, { muscle: "glutes" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("combines muscle + equipment + difficulty filters (Test D)", () => {
    const records = [
      record({ id: "a", primaryMuscles: ["chest"], equipment: ["Barbell"], difficulty: "beginner" }),
      record({ id: "b", primaryMuscles: ["chest"], equipment: ["Dumbbell"], difficulty: "beginner" }),
      record({ id: "c", primaryMuscles: ["chest"], equipment: ["Dumbbell"], difficulty: "advanced" }),
    ];
    const result = searchExerciseRecords(records, {
      muscle: "chest",
      equipmentFilter: "Dumbbell",
      difficulty: "beginner",
    });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("orders equipment-compatible exercises first without hiding incompatible ones (Test E)", () => {
    const records = [
      record({ id: "a", canonicalName: "Row A", equipment: ["Cable Machine"] }),
      record({ id: "b", canonicalName: "Row B", equipment: ["Barbell"] }),
    ];
    const result = searchExerciseRecords(records, { availableEquipment: ["Barbell"] });
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it('"all" availableEquipment disables personalization ordering (falls back to name order)', () => {
    const records = [
      record({ id: "a", canonicalName: "Zzz Row", equipment: ["Cable Machine"] }),
      record({ id: "b", canonicalName: "Aaa Row", equipment: ["Barbell"] }),
    ];
    const result = searchExerciseRecords(records, { availableEquipment: "all" });
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("returns every record, unranked-but-stable, with no query or filters", () => {
    const records = [record({ id: "a" }), record({ id: "b" })];
    expect(searchExerciseRecords(records).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
});
