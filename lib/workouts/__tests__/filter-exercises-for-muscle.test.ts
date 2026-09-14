import { describe, expect, it } from "vitest";

import { filterExercisesForMuscle } from "@/lib/workouts/filter-exercises-for-muscle";
import type { ExerciseLibraryItem } from "@/lib/workouts/exercise-library";

function exercise(overrides: Partial<ExerciseLibraryItem> = {}): ExerciseLibraryItem {
  return {
    id: overrides.id ?? "ex-1",
    name: overrides.name ?? "Bench Press",
    description: overrides.description ?? "",
    primaryMuscle: overrides.primaryMuscle ?? "Chest",
    secondaryMuscles: overrides.secondaryMuscles ?? ["Triceps"],
    equipment: overrides.equipment ?? "Barbell",
    difficulty: overrides.difficulty ?? "intermediate",
    movementPattern: overrides.movementPattern ?? "Horizontal Push",
    source: overrides.source ?? "muscle-fitness",
    sourceUrl: overrides.sourceUrl ?? null,
    ...overrides,
  };
}

describe("filterExercisesForMuscle", () => {
  it("matches by resolved primary muscle (Test A)", () => {
    const result = filterExercisesForMuscle([exercise({ primaryMuscle: "Chest" })], "chest");
    expect(result).toHaveLength(1);
    expect(result[0].involvement).toBe("primary");
  });

  it("matches by resolved secondary muscle (Test B)", () => {
    const result = filterExercisesForMuscle(
      [exercise({ primaryMuscle: "Chest", secondaryMuscles: ["Triceps"] })],
      "triceps",
    );
    expect(result).toHaveLength(1);
    expect(result[0].involvement).toBe("secondary");
  });

  it("excludes exercises that don't resolve to the muscle at all (Test C)", () => {
    const result = filterExercisesForMuscle(
      [exercise({ primaryMuscle: "Chest", secondaryMuscles: ["Triceps"] })],
      "quadriceps",
    );
    expect(result).toEqual([]);
  });

  it("never invents an exercise — unresolvable free-text muscles are dropped, not guessed (Test D)", () => {
    const result = filterExercisesForMuscle(
      [exercise({ primaryMuscle: "Some Untaxonomized Muscle Name" })],
      "chest",
    );
    expect(result).toEqual([]);
  });

  it("filters by difficulty when provided (Test E)", () => {
    const items = [
      exercise({ id: "a", difficulty: "beginner" }),
      exercise({ id: "b", difficulty: "advanced" }),
    ];
    const result = filterExercisesForMuscle(items, "chest", { difficulty: "beginner" });
    expect(result.map((m) => m.exercise.id)).toEqual(["a"]);
  });

  it("filters by movement pattern when provided (Test F)", () => {
    const items = [
      exercise({ id: "a", movementPattern: "Horizontal Push" }),
      exercise({ id: "b", movementPattern: "Vertical Pull" }),
    ];
    const result = filterExercisesForMuscle(items, "chest", { movementPattern: "Vertical Pull" });
    expect(result.map((m) => m.exercise.id)).toEqual(["b"]);
  });

  it("defaults to filtering by available equipment when a list is given", () => {
    const items = [
      exercise({ id: "a", equipment: "Barbell" }),
      exercise({ id: "b", equipment: "Cable Machine" }),
    ];
    const result = filterExercisesForMuscle(items, "chest", { availableEquipment: ["Barbell"] });
    expect(result.map((m) => m.exercise.id)).toEqual(["a"]);
  });

  it('"Show All" (availableEquipment: "all") bypasses the equipment filter entirely', () => {
    const items = [
      exercise({ id: "a", equipment: "Barbell" }),
      exercise({ id: "b", equipment: "Cable Machine" }),
    ];
    const result = filterExercisesForMuscle(items, "chest", { availableEquipment: "all" });
    expect(result.map((m) => m.exercise.id).sort()).toEqual(["a", "b"]);
  });

  it("sorts primary-mover matches before secondary, alphabetically within each group", () => {
    const items = [
      exercise({ id: "a", name: "Zzz Secondary Move", primaryMuscle: "Back", secondaryMuscles: ["Chest"] }),
      exercise({ id: "b", name: "B Primary Move", primaryMuscle: "Chest" }),
      exercise({ id: "c", name: "A Primary Move", primaryMuscle: "Chest" }),
    ];
    const result = filterExercisesForMuscle(items, "chest");
    expect(result.map((m) => m.exercise.id)).toEqual(["c", "b", "a"]);
  });
});
