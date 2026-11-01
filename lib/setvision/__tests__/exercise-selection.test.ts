import { describe, expect, it } from "vitest";

import {
  CATALOGUE_COVERAGE,
  CUSTOM_EXERCISE_MAX_LENGTH,
  ENGINE_CAPABILITY,
  EXERCISE_OPTIONS,
  findExerciseOption,
  optionForEngine,
  searchExerciseOptions,
  validateCustomExerciseName,
} from "@/lib/setvision/exercise-selection";
import { EXERCISE_CATALOGUE } from "@/lib/workouts/exercise-library";
import { SETVISION_EXERCISES } from "@/lib/setvision/types";

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

  it("covers every catalogue exercise with exactly one workflow, set by hand per movement", () => {
    const slugs = EXERCISE_CATALOGUE.map((e) => e.slug);
    expect(slugs.every((slug) => slug && CATALOGUE_COVERAGE[slug])).toBe(true);
    expect(Object.keys(CATALOGUE_COVERAGE).sort()).toEqual([...slugs].sort());
    const catalogueOptions = EXERCISE_OPTIONS.filter((o) => o.source === "catalogue");
    expect(catalogueOptions).toHaveLength(EXERCISE_CATALOGUE.length);
    for (const option of EXERCISE_OPTIONS) {
      // An engine, or a stated reason there is none — never neither, never a borrowed counter.
      expect(option.engine !== null || (option.capability === "MANUAL_REVIEW_SUPPORTED" && option.manualReason)).toBeTruthy();
      if (option.engine) expect(option.manualReason).toBeNull();
    }
  });

  it("marks only the free squat as verified; every other engine is experimental", () => {
    const verified = EXERCISE_OPTIONS.filter((o) => o.capability === "ANALYSIS_VERIFIED").map((o) => o.label).sort();
    expect(verified).toEqual(["Barbell Back Squat", "Squat"]);
    expect(findExerciseOption("catalogue:hack-squat")).toMatchObject({ engine: "squat", capability: "ANALYSIS_EXPERIMENTAL" });
    expect(findExerciseOption("catalogue:barbell-bench-press")).toMatchObject({ engine: "bench_press", capability: "ANALYSIS_EXPERIMENTAL" });
    expect(findExerciseOption("catalogue:lat-pulldown")).toMatchObject({ engine: "vertical_pull", capability: "ANALYSIS_EXPERIMENTAL" });
    expect(findExerciseOption("setvision:deadlift")?.capability).toBe("ANALYSIS_EXPERIMENTAL");
    expect(ENGINE_CAPABILITY.squat).toBe("ANALYSIS_VERIFIED");
  });

  it("keeps movements without a model on manual review instead of borrowing another engine", () => {
    for (const key of ["catalogue:leg-press", "catalogue:leg-extension", "catalogue:standing-calf-raise", "catalogue:cable-fly", "catalogue:plank", "catalogue:bulgarian-split-squat", "setvision:lunge", "catalogue:barbell-hip-thrust"]) {
      expect(findExerciseOption(key)).toMatchObject({ engine: null, capability: "MANUAL_REVIEW_SUPPORTED" });
      expect(findExerciseOption(key)!.manualReason).toMatch(/\w/);
    }
    expect(findExerciseOption("catalogue:does-not-exist")).toBeNull();
  });

  it("resolves every engine's Auto-detect suggestion to an option that uses that engine", () => {
    for (const engine of SETVISION_EXERCISES) expect(optionForEngine(engine).engine).toBe(engine);
  });

  it("finds the prompt's example movements by name or alias", () => {
    for (const [query, label] of [
      ["close-grip lat pulldown", "Lat Pulldown"],
      ["dumbbell shoulder press", "Seated Dumbbell Overhead Press"],
      ["hammer curl", "Biceps Curl"],
      ["dumbbell row", "Dumbbell Row"],
      ["rear-delt fly", "Cable Rear Delt Fly"],
      ["chin-up", "Pull-Up"],
      ["calf raise", "Standing Calf Raise"],
    ]) {
      expect(labels(query)).toContain(label);
    }
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
