import { describe, expect, it } from "vitest";

import { buildExerciseEmphasisMap } from "@/lib/training/muscle-highlight";
import { LOCAL_EXERCISE_LIBRARY } from "@/lib/workouts/exercise-library";
import { toExerciseRecord } from "@/lib/workouts/providers/local-provider";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";

function findRecord(name: string): ExerciseRecord {
  const item = LOCAL_EXERCISE_LIBRARY.find((exercise) => exercise.name === name);
  if (!item) throw new Error(`Fixture exercise not found in LOCAL_EXERCISE_LIBRARY: ${name}`);
  return toExerciseRecord(item);
}

function exerciseRecord(overrides: Partial<ExerciseRecord> = {}): ExerciseRecord {
  return {
    id: "muscle-fitness:test",
    providerId: "test",
    source: "muscle-fitness",
    canonicalName: "Test Exercise",
    slug: "test-exercise",
    primaryMuscles: [],
    secondaryMuscles: [],
    stabilizers: [],
    equipment: ["Barbell"],
    difficulty: "intermediate",
    movementPattern: "Horizontal Push",
    instructions: [],
    safetyCues: [],
    commonMistakes: [],
    media: [],
    alternatives: [],
    regressions: [],
    progressions: [],
    provenance: {
      sourceUrl: null,
      raw: {
        id: "test",
        name: "Test Exercise",
        description: "",
        primaryMuscle: "",
        secondaryMuscles: [],
        equipment: "Barbell",
        difficulty: "intermediate",
        movementPattern: "Horizontal Push",
        source: "muscle-fitness",
        sourceUrl: null,
      },
    },
    ...overrides,
  };
}

describe("buildExerciseEmphasisMap", () => {
  it("maps Barbell Bench Press's real repository mapping to primary/secondary (Test 52)", () => {
    const benchPress = exerciseRecord({
      canonicalName: "Barbell Bench Press",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["anterior_deltoid", "triceps"],
      stabilizers: ["upper_back", "abdominals"],
    });

    const emphasis = buildExerciseEmphasisMap(benchPress);

    expect(emphasis.chest).toBe("primary");
    expect(emphasis.anterior_deltoid).toBe("secondary");
    expect(emphasis.triceps).toBe("secondary");
    expect(emphasis.upper_back).toBe("supporting");
    expect(emphasis.abdominals).toBe("supporting");
  });

  it("maps Cable Lateral Raise to lateral deltoid primary / trapezius secondary (Test 53)", () => {
    const lateralRaise = exerciseRecord({
      canonicalName: "Cable Lateral Raise",
      primaryMuscles: ["lateral_deltoid"],
      secondaryMuscles: ["trapezius"],
    });

    const emphasis = buildExerciseEmphasisMap(lateralRaise);

    expect(emphasis.lateral_deltoid).toBe("primary");
    expect(emphasis.trapezius).toBe("secondary");
    expect(Object.keys(emphasis)).toHaveLength(2);
  });

  it("never downgrades a muscle already counted at a stronger tier", () => {
    const exercise = exerciseRecord({
      primaryMuscles: ["chest"],
      secondaryMuscles: ["chest"],
      stabilizers: ["chest"],
    });

    expect(buildExerciseEmphasisMap(exercise).chest).toBe("primary");
  });

  it("produces no entries for an exercise with no resolved muscles", () => {
    expect(buildExerciseEmphasisMap(exerciseRecord())).toEqual({});
  });

  it("resolves the real Barbell Bench Press repository entry exactly as spec Test 52 expects", () => {
    const emphasis = buildExerciseEmphasisMap(findRecord("Barbell Bench Press"));

    expect(emphasis).toEqual({
      chest: "primary",
      anterior_deltoid: "secondary",
      triceps: "secondary",
      upper_back: "supporting",
      abdominals: "supporting",
    });
  });

  it("resolves the real Cable Lateral Raise repository entry exactly as spec Test 53 expects", () => {
    const emphasis = buildExerciseEmphasisMap(findRecord("Cable Lateral Raise"));

    // Primary: Side Deltoids -> lateral_deltoid. Secondary: Upper
    // Trapezius -> trapezius. The exercise's own `stabilizers: ["Trapezius"]`
    // resolves to the same muscle already covered by secondary, so it
    // must NOT be downgraded or duplicated — "do not invent more muscles."
    expect(emphasis).toEqual({
      lateral_deltoid: "primary",
      trapezius: "secondary",
    });
  });
});
