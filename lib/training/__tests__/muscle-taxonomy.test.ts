import { expect, it } from "vitest";
import { CANONICAL_MUSCLES, resolveCanonicalMuscle } from "../muscle-taxonomy";
import { MUSCLE_GROUPS } from "../types";
import { MUSCLE_ATLAS_ENTRIES } from "../muscle-ontology";
import { deriveFallbackContributions } from "../exercise-muscle-map";

it("never resolves inherited object properties as muscles", () => {
  expect(resolveCanonicalMuscle("constructor")).toBeNull();
  expect(resolveCanonicalMuscle("__proto__")).toBeNull();
  expect(deriveFallbackContributions("constructor", ["__proto__"])).toEqual([]);
});

it("keeps program muscle names and atlas entries within the canonical taxonomy", () => {
  expect(new Set(CANONICAL_MUSCLES).size).toBe(CANONICAL_MUSCLES.length);
  for (const muscle of MUSCLE_GROUPS) expect(CANONICAL_MUSCLES).toContain(resolveCanonicalMuscle(muscle));
  expect(Object.keys(MUSCLE_ATLAS_ENTRIES).sort()).toEqual([...CANONICAL_MUSCLES].sort());
  for (const id of CANONICAL_MUSCLES) expect(MUSCLE_ATLAS_ENTRIES[id].canonicalMuscle).toBe(id);
  expect(deriveFallbackContributions("Chest", ["pecs", "Triceps", "triceps"]).map((c) => c.muscle)).toEqual(["chest", "triceps"]);
});
