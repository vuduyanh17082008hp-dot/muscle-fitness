import { describe, expect, it } from "vitest";

import { resolveAnatomyColor } from "@/lib/training/anatomy-intensity";
import { flattenMuscleRegions, MUSCLE_REGION_DEFS } from "@/lib/training/muscle-regions";
import { CANONICAL_MUSCLES, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

describe("anatomy-intensity", () => {
  it("returns elevated fill for anatomy mode regardless of intensity", () => {
    const result = resolveAnatomyColor("anatomy", { intensity: 0.9 });
    expect(result.fill).toBe("var(--mf-glass-elevated)");
  });

  it("maps volume intensity into a lime heatmap", () => {
    const low = resolveAnatomyColor("volume", { intensity: 0.1 });
    const high = resolveAnatomyColor("volume", { intensity: 0.95 });
    expect(low.fill).toMatch(/^hsl\(83 /);
    expect(high.fill).toMatch(/^hsl\(83 /);
    expect(low.fill).not.toBe(high.fill);
  });

  it("supports future recovery tones without changing geometry", () => {
    const recovered = resolveAnatomyColor("recovery", { tone: "positive" });
    expect(recovered.fill).toBe("var(--mf-glass-brand)");
  });
});

describe("muscle-regions anatomical coverage", () => {
  it("exposes path-based regions for every canonical muscle on at least one view", () => {
    const covered = new Set(MUSCLE_REGION_DEFS.map((r) => r.muscleId));
    for (const muscle of CANONICAL_MUSCLES) {
      expect(covered.has(muscle), `${muscle} missing from MUSCLE_REGION_DEFS`).toBe(true);
    }
  });

  it("keeps front and back path lists non-empty and exclusively path geometry", () => {
    const front = flattenMuscleRegions("front");
    const back = flattenMuscleRegions("back");
    expect(front.length).toBeGreaterThan(8);
    expect(back.length).toBeGreaterThan(8);
    for (const path of [...front, ...back]) {
      expect(path.d.length).toBeGreaterThan(20);
      expect(path.d).toMatch(/^M/);
    }
  });

  it("includes required front interaction regions", () => {
    const frontMuscles = new Set(
      MUSCLE_REGION_DEFS.filter((r) => r.view === "front").map((r) => r.muscleId),
    );
    const required: CanonicalMuscle[] = [
      "chest",
      "anterior_deltoid",
      "lateral_deltoid",
      "biceps",
      "forearms",
      "abdominals",
      "quadriceps",
      "calves",
    ];
    for (const muscle of required) {
      expect(frontMuscles.has(muscle)).toBe(true);
    }
  });

  it("includes required back interaction regions", () => {
    const backMuscles = new Set(
      MUSCLE_REGION_DEFS.filter((r) => r.view === "back").map((r) => r.muscleId),
    );
    const required: CanonicalMuscle[] = [
      "trapezius",
      "rear_deltoid",
      "triceps",
      "latissimus_dorsi",
      "upper_back",
      "lower_back",
      "glutes",
      "hamstrings",
      "calves",
    ];
    for (const muscle of required) {
      expect(backMuscles.has(muscle)).toBe(true);
    }
  });
});
