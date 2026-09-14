import { describe, expect, it } from "vitest";

import { LocalExerciseProvider, toExerciseRecord } from "@/lib/workouts/providers/local-provider";
import type { ExerciseLibraryItem } from "@/lib/workouts/exercise-library";

function item(overrides: Partial<ExerciseLibraryItem> = {}): ExerciseLibraryItem {
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

describe("toExerciseRecord", () => {
  it("resolves free-text muscles into CanonicalMuscle arrays (Test A)", () => {
    const record = toExerciseRecord(item({ primaryMuscle: "Chest", secondaryMuscles: ["Triceps"] }));
    expect(record.primaryMuscles).toEqual(["chest"]);
    expect(record.secondaryMuscles).toEqual(["triceps"]);
  });

  it("drops unresolvable free-text muscles rather than guessing (Test B)", () => {
    const record = toExerciseRecord(item({ primaryMuscle: "Not A Real Muscle" }));
    expect(record.primaryMuscles).toEqual([]);
  });

  it("wraps the single equipment string in an array", () => {
    const record = toExerciseRecord(item({ equipment: "Cable Machine" }));
    expect(record.equipment).toEqual(["Cable Machine"]);
  });

  it("never fabricates media, alternatives, regressions or progressions", () => {
    const record = toExerciseRecord(item());
    expect(record.media).toEqual([]);
    expect(record.alternatives).toEqual([]);
    expect(record.regressions).toEqual([]);
    expect(record.progressions).toEqual([]);
  });

  it("preserves the raw source item in provenance for components that still need it", () => {
    const raw = item({ name: "Incline Dumbbell Press" });
    const record = toExerciseRecord(raw);
    expect(record.provenance.raw).toBe(raw);
    expect(record.provenance.sourceUrl).toBeNull();
  });

  it("produces a stable id derived from slug, then id, then a slugified name", () => {
    const bySlug = toExerciseRecord(item({ slug: "bench-press", id: "abc" }));
    expect(bySlug.id).toBe("muscle-fitness:bench-press");

    const byId = toExerciseRecord(item({ slug: undefined, id: "abc" }));
    expect(byId.id).toBe("muscle-fitness:abc");

    const byName = toExerciseRecord(item({ slug: undefined, id: null, name: "Cable Row Machine" }));
    expect(byName.id).toBe("muscle-fitness:cable-row-machine");
  });
});

describe("LocalExerciseProvider", () => {
  it("is always available", () => {
    expect(new LocalExerciseProvider().isAvailable()).toBe(true);
  });

  it("search() returns every local exercise when no query is given", async () => {
    const results = await new LocalExerciseProvider().search();
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((record) => record.source === "muscle-fitness")).toBe(true);
  });

  it("search() narrows by name substring when a query is given", async () => {
    const results = await new LocalExerciseProvider().search("bench");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((record) => record.canonicalName.toLowerCase().includes("bench"))).toBe(true);
  });

  it("getById() returns null for an unknown id rather than throwing", async () => {
    const result = await new LocalExerciseProvider().getById("muscle-fitness:does-not-exist");
    expect(result).toBeNull();
  });
});
