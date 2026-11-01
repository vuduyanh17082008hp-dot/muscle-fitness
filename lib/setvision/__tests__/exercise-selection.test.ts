import { describe, expect, it } from "vitest";

import {
  CUSTOM_EXERCISE_MAX_LENGTH,
  ENGINE_CAPABILITY,
  EXERCISE_OPTIONS,
  findExerciseOption,
  optionForEngine,
  searchExerciseOptions,
  validateCustomExerciseName,
} from "@/lib/setvision/exercise-selection";
import { EXERCISE_CATALOGUE } from "@/lib/workouts/exercise-library";

const labels = (query: string) => searchExerciseOptions(query).map((o) => o.label);

describe("SetVision exercise options", () => {
  it("draws catalogue entries from the real catalogue with their real ids, and adds no duplicates", () => {
    const catalogue = EXERCISE_OPTIONS.filter((o) => o.source === "catalogue");
    expect(catalogue).toHaveLength(EXERCISE_CATALOGUE.length);
    for (const option of catalogue) {
      const item = EXERCISE_CATALOGUE.find((i) => `catalogue:${i.slug}` === option.key)!;
      expect(option.label).toBe(item.name);
      expect(option.catalogueId).toBe(item.id);
    }
    const names = EXERCISE_OPTIONS.map((o) => o.label.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(EXERCISE_OPTIONS.map((o) => o.key)).size).toBe(EXERCISE_OPTIONS.length);
    // SetVision-list entries never claim a catalogue id.
    expect(EXERCISE_OPTIONS.filter((o) => o.source === "setvision").every((o) => o.catalogueId === null)).toBe(true);
  });

  it("finds every movement the selector must offer", () => {
    for (const [query, expected] of [
      ["Barbell Bench Press", "Barbell Bench Press"],
      ["dumbbell bench press", "Flat Dumbbell Press"],
      ["incline bench press", "Incline Bench Press"],
      ["squat", "Squat"],
      ["deadlift", "Deadlift"],
      ["romanian deadlift", "Romanian Deadlift"],
      ["overhead press", "Barbell Overhead Press"],
      ["barbell row", "Barbell Row"],
      ["lat pulldown", "Lat Pulldown"],
      ["seated cable row", "Seated Cable Row"],
      ["biceps curl", "Biceps Curl"],
      ["triceps pushdown", "Cable Triceps Pushdown"],
      ["lunge", "Lunge"],
      ["leg press", "Leg Press"],
    ] as const) {
      expect(labels(query), query).toContain(expected);
    }
  });

  it("matches aliases, case and accents, and ranks the exact name first", () => {
    expect(labels("RDL")).toContain("Romanian Deadlift");
    expect(labels("OHP")).toContain("Barbell Overhead Press");
    expect(labels("  SQUÀT ")[0]).toBe("Squat");
    expect(labels("")).toEqual([]);
    expect(labels("zzzz-not-an-exercise")).toEqual([]);
  });

  it("only routes squat and deadlift to an engine; bench and everything else are label-only", () => {
    const routed = EXERCISE_OPTIONS.filter((o) => o.engine !== null).map((o) => `${o.label}:${o.engine}`);
    expect(routed.sort()).toEqual(["Barbell Back Squat:squat", "Deadlift:deadlift", "Squat:squat"]);
    expect(findExerciseOption("catalogue:barbell-bench-press")).toMatchObject({ engine: null, capability: "MANUAL_LABEL_ONLY" });
    expect(findExerciseOption("setvision:squat")?.capability).toBe("SUPPORTED_ANALYSIS");
    expect(findExerciseOption("setvision:deadlift")?.capability).toBe("LIMITED_EXPERIMENTAL_ANALYSIS");
    expect(ENGINE_CAPABILITY.bench_press).toBe("MANUAL_LABEL_ONLY");
    // An Auto-detect "bench" suggestion resolves to the label-only bench option, never an engine.
    expect(optionForEngine("bench_press").engine).toBeNull();
    expect(findExerciseOption("catalogue:does-not-exist")).toBeNull();
  });
});

describe("custom exercise names", () => {
  it("keeps the user's text, trimming ends and collapsing inner whitespace", () => {
    expect(validateCustomExerciseName("  Incline   Smith Machine Press ")).toEqual({ ok: true, label: "Incline Smith Machine Press" });
    expect(validateCustomExerciseName("Cable Lateral Raise")).toEqual({ ok: true, label: "Cable Lateral Raise" });
    expect(validateCustomExerciseName("Đẩy ngực máy")).toEqual({ ok: true, label: "Đẩy ngực máy" });
    expect(validateCustomExerciseName("<b>Press</b>")).toEqual({ ok: true, label: "<b>Press</b>" }); // rendered as text
  });

  it("rejects empty, symbol-only, control-character and over-long names", () => {
    expect(validateCustomExerciseName("   ").ok).toBe(false);
    expect(validateCustomExerciseName("!!! ---").ok).toBe(false);
    expect(validateCustomExerciseName("Press\u0000").ok).toBe(false);
    expect(validateCustomExerciseName("Press‮evil").ok).toBe(false);
    expect(validateCustomExerciseName("a".repeat(CUSTOM_EXERCISE_MAX_LENGTH)).ok).toBe(true);
    expect(validateCustomExerciseName("a".repeat(CUSTOM_EXERCISE_MAX_LENGTH + 1)).ok).toBe(false);
    // Length is counted in characters, not UTF-16 units.
    expect(validateCustomExerciseName("💪".repeat(CUSTOM_EXERCISE_MAX_LENGTH)).ok).toBe(false); // no letter/number
    expect(validateCustomExerciseName(`A${"💪".repeat(CUSTOM_EXERCISE_MAX_LENGTH - 1)}`).ok).toBe(true);
  });
});
