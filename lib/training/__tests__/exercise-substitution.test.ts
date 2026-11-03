import { describe, expect, it } from "vitest";

import { CANONICAL_MUSCLES, resolveCanonicalMuscle, resolveCanonicalMuscles } from "@/lib/training/muscle-taxonomy";
import { findAlternatives, findCatalogueExercise, parseExperience } from "@/lib/training/exercise-substitution";
import { EXERCISE_CATALOGUE, LOCAL_EXERCISE_LIBRARY } from "@/lib/workouts/exercise-library";
import { ALTERNATIVE_MATRIX, EVIDENCE_SOURCES, EXERCISE_PROFILES } from "@/lib/workouts/exercise-profiles";

const ex = (slug: string) => {
  const item = findCatalogueExercise({ slug });
  if (!item) throw new Error(`missing ${slug}`);
  return item;
};
const slugs = (result: ReturnType<typeof findAlternatives>) => result.alternatives.map((alt) => alt.item.slug);

describe("exercise catalogue + profiles integrity", () => {
  it("every catalogue exercise has a unique slug/name, a resolvable primary muscle and a profile", () => {
    const seen = new Set<string>();
    for (const item of EXERCISE_CATALOGUE) {
      expect(item.slug, item.name).toBeTruthy();
      expect(seen.has(item.slug!)).toBe(false);
      seen.add(item.slug!);
      expect(resolveCanonicalMuscle(item.primaryMuscle), item.name).not.toBeNull();
      expect(EXERCISE_PROFILES[item.slug!], item.slug).toBeDefined();
    }
    expect(new Set(EXERCISE_CATALOGUE.map((item) => item.name.toLowerCase())).size).toBe(EXERCISE_CATALOGUE.length);
  });

  it("has no orphan profiles and keeps built-in ids deterministic", () => {
    const catalogueSlugs = new Set(EXERCISE_CATALOGUE.map((item) => item.slug));
    for (const slug of Object.keys(EXERCISE_PROFILES)) expect(catalogueSlugs.has(slug), slug).toBe(true);
    for (const item of LOCAL_EXERCISE_LIBRARY) expect(item.id).toMatch(/^10000000-0000-4000-8000-\d{12}$/);
  });

  it("every evidence note cites a verified source", () => {
    for (const profile of Object.values(EXERCISE_PROFILES)) {
      for (const note of profile.evidence ?? []) {
        expect(note.sourceIds.length).toBeGreaterThan(0);
        for (const id of note.sourceIds) expect(EVIDENCE_SOURCES[id]).toBeDefined();
      }
    }
  });

  it("every matrix exercise exists and actually trains the row's target", () => {
    for (const row of ALTERNATIVE_MATRIX) {
      for (const slug of [row.preferred, ...row.alternatives]) {
        const item = ex(slug);
        const trained = resolveCanonicalMuscles([item.primaryMuscle, ...item.secondaryMuscles]);
        expect(trained, `${row.id}: ${slug}`).toContain(row.target);
      }
    }
  });

  it("every major muscle group has at least two catalogue exercises that train it directly", () => {
    const major = CANONICAL_MUSCLES.filter((m) => !["forearms", "trapezius", "lower_back", "obliques"].includes(m));
    for (const muscle of major) {
      const direct = EXERCISE_CATALOGUE.filter((item) => resolveCanonicalMuscle(item.primaryMuscle) === muscle);
      expect(direct.length, muscle).toBeGreaterThanOrEqual(2);
    }
  });

  it("every matrix row's preferred exercise gets at least two alternatives", () => {
    for (const row of ALTERNATIVE_MATRIX) {
      const result = findAlternatives({ current: ex(row.preferred), target: row.target, experience: "intermediate" });
      expect(result.alternatives.length, row.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("findAlternatives — athlete scenarios", () => {
  it("beginner, no cable machine: nothing needing a cable, accessible options first", () => {
    const result = findAlternatives({ current: ex("cable-lateral-raise"), experience: "beginner", constraints: ["no_cable"] });
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) expect(alt.profile.needs).not.toContain("cable");
    expect(result.alternatives[0].profile.complexity).toBe("low");
  });

  it("beginner, gym crowded (hack squat taken): leg press first, every option explains itself", () => {
    const result = findAlternatives({ current: ex("hack-squat"), experience: "beginner", reasons: ["machine_occupied"] });
    expect(result.alternatives[0].item.slug).toBe("leg-press");
    expect(slugs(result)).toEqual(expect.arrayContaining(["smith-machine-squat", "leg-extension"]));
    for (const alt of result.alternatives) {
      expect(alt.profile.station === "hack_squat").toBe(false);
      expect(alt.why.length).toBeGreaterThan(20);
      expect(alt.loading).toMatch(/weight|load|bodyweight/i);
    }
  });

  it("machine occupied without a named station excludes options needing the same kit", () => {
    const result = findAlternatives({ current: ex("cable-triceps-pushdown"), experience: "intermediate", reasons: ["machine_occupied"] });
    for (const alt of result.alternatives) expect(alt.profile.needs).not.toContain("cable");
    expect(result.notRecommended.some((entry) => /cable station/.test(entry.reason))).toBe(true);
  });

  it("leg extension is never presented as an exact replacement for a hack squat", () => {
    const alt = findAlternatives({ current: ex("hack-squat"), experience: "intermediate" }).alternatives.find(
      (a) => a.item.slug === "leg-extension",
    )!;
    expect(alt.similarMovement).toBe(false);
    expect(alt.category).not.toBe("close");
    expect(alt.why).toMatch(/isn't mechanically equivalent/);
    expect(alt.differences.join(" ")).toMatch(/Single-joint/);
  });

  it("intermediate, dumbbells only: every alternative fits dumbbells + bench", () => {
    const result = findAlternatives({ current: ex("machine-chest-press"), experience: "intermediate", constraints: ["dumbbells_only"] });
    expect(slugs(result)).toContain("flat-dumbbell-press");
    for (const alt of result.alternatives) {
      expect(alt.profile.needs.every((tag) => tag === "dumbbell" || tag === "bench")).toBe(true);
    }
    expect(result.notRecommended.length).toBeGreaterThan(0);
  });

  it("advanced, full gym: broader range including higher-complexity options", () => {
    const result = findAlternatives({ current: ex("hack-squat"), experience: "advanced", familiarSlugs: new Set(["barbell-back-squat"]) });
    const squat = result.alternatives.find((a) => a.item.slug === "barbell-back-squat")!;
    // Mechanically close to a hack squat; the extra demand is surfaced, not hidden.
    expect(squat.category).toBe("close");
    expect(squat.profile.complexity).toBe("high");
    expect(squat.experienceNote).toMatch(/logged this before/);
    const fromIsolation = findAlternatives({ current: ex("leg-extension"), experience: "advanced" });
    expect(fromIsolation.alternatives.find((a) => a.item.slug === "barbell-back-squat")?.category).toBe("higher_complexity");
  });

  it("advanced but unfamiliar with a movement: competence is not assumed", () => {
    const result = findAlternatives({ current: ex("hack-squat"), experience: "advanced" });
    const squat = result.alternatives.find((a) => a.item.slug === "barbell-back-squat")!;
    expect(squat.experienceNote).toMatch(/New to you/);
    const lowIndex = result.alternatives.findIndex((a) => a.item.slug === "leg-press");
    expect(lowIndex).toBeLessThan(result.alternatives.indexOf(squat));
  });

  it("unknown experience: conservative order and an invitation to clarify", () => {
    const result = findAlternatives({ current: ex("leg-press"), experience: null });
    expect(result.notes.join(" ")).toMatch(/experience level isn't set/);
    const ranks = result.alternatives.map((a) => a.profile.complexity);
    expect(ranks.indexOf("high")).toBeGreaterThan(ranks.lastIndexOf("low"));
    expect(parseExperience("Advanced")).toBe("advanced");
    expect(parseExperience("expert")).toBeNull();
  });

  it("pain/illness hold: reference only, never an action", () => {
    const result = findAlternatives({ current: ex("leg-press"), experience: "beginner", hold: true });
    expect(result.canApply).toBe(false);
    expect(result.notes[0]).toMatch(/on hold/);
  });

  it("discomfort: no diagnosis, stable options first", () => {
    const result = findAlternatives({ current: ex("barbell-back-squat"), experience: "intermediate", reasons: ["discomfort"] });
    expect(result.notes.join(" ")).toMatch(/isn't a diagnosis/);
    expect(result.alternatives[0].profile.stability).not.toBe("free");
  });

  it("equipment unavailable: excluded options are explained, not silently dropped", () => {
    const result = findAlternatives({ current: ex("hack-squat"), experience: "intermediate", constraints: ["no_smith"] });
    expect(slugs(result)).not.toContain("smith-machine-squat");
    const smith = result.notRecommended.find((entry) => entry.item.slug === "smith-machine-squat");
    expect(smith?.reason).toMatch(/Smith machine/);
  });

  it("secondary-target candidates are labelled as a different emphasis (split squat for glutes)", () => {
    const alt = findAlternatives({ current: ex("barbell-hip-thrust"), experience: "intermediate" }).alternatives.find(
      (a) => a.item.slug === "bulgarian-split-squat",
    )!;
    expect(alt.targetIsSecondary).toBe(true);
    expect(alt.why).toMatch(/different emphasis/);
  });

  it("an exercise without a profile gets a transparent unknown state", () => {
    const result = findAlternatives({
      current: { ...ex("leg-press"), slug: "user-custom-thing", name: "Custom Thing" },
    });
    expect(result.alternatives).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/no movement profile/);
  });

  it("never fabricates precision or absolute claims in generated copy", () => {
    const banned = /%|optimal|guaranteed|safest|zero injury|better than free weights/i;
    for (const row of ALTERNATIVE_MATRIX) {
      for (const experience of ["beginner", "advanced", null] as const) {
        const result = findAlternatives({ current: ex(row.preferred), experience, reasons: ["machine_occupied"] });
        for (const alt of result.alternatives) {
          expect(`${alt.why} ${alt.differences.join(" ")} ${alt.loading} ${alt.experienceNote ?? ""}`).not.toMatch(banned);
        }
      }
    }
  });
});
