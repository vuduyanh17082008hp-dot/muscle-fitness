import { describe, expect, it } from "vitest";

import { parseMuscleParam, parsePrefillExercise } from "@/lib/workouts/library-params";

describe("parseMuscleParam", () => {
  it("accepts a real CanonicalMuscle value (Test A)", () => {
    expect(parseMuscleParam("lateral_deltoid")).toBe("lateral_deltoid");
  });

  it("rejects an unknown value rather than guessing (Test B)", () => {
    expect(parseMuscleParam("not_a_real_muscle")).toBeNull();
  });

  it("returns null for undefined/empty input", () => {
    expect(parseMuscleParam(undefined)).toBeNull();
    expect(parseMuscleParam("")).toBeNull();
  });

  it("takes the first value from a string[] (Next.js multi-value searchParams)", () => {
    expect(parseMuscleParam(["chest", "glutes"])).toBe("chest");
  });
});

describe("parsePrefillExercise", () => {
  it("returns trimmed text when present (Test C)", () => {
    expect(parsePrefillExercise("  Incline Dumbbell Press  ")).toBe("Incline Dumbbell Press");
  });

  it("returns null for empty/whitespace-only input", () => {
    expect(parsePrefillExercise("")).toBeNull();
    expect(parsePrefillExercise("   ")).toBeNull();
    expect(parsePrefillExercise(undefined)).toBeNull();
  });

  it("takes the first value from a string[]", () => {
    expect(parsePrefillExercise(["Bench Press", "Squat"])).toBe("Bench Press");
  });
});
