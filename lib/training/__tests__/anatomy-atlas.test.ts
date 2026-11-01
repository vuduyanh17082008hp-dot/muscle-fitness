import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BACK_ATLAS, BACK_SILHOUETTE, FRONT_ATLAS, FRONT_SILHOUETTE } from "@/lib/training/anatomy/atlas-geometry";
import { musclesInView } from "@/lib/training/anatomy/body-atlas";
import { MUSCLE_ATLAS_ENTRIES } from "@/lib/training/muscle-ontology";
import { CANONICAL_MUSCLES } from "@/lib/training/muscle-taxonomy";

const PATH = /^M[-\d. L]+Z$/;

describe("anatomy atlas geometry", () => {
  it("draws every canonical muscle in at least one view, and its preferred view", () => {
    for (const muscle of CANONICAL_MUSCLES) {
      const views = (["front", "back"] as const).filter((v) => musclesInView(v).has(muscle));
      expect(views.length, muscle).toBeGreaterThan(0);
      expect(views, muscle).toContain(MUSCLE_ATLAS_ENTRIES[muscle].preferredView);
    }
  });

  it("keeps the ontology's region ids exactly in sync with what is drawn", () => {
    for (const muscle of CANONICAL_MUSCLES) {
      const drawn = (["front", "back"] as const).filter((v) => musclesInView(v).has(muscle)).map((v) => `${muscle}-${v}`);
      expect(MUSCLE_ATLAS_ENTRIES[muscle].visualRegionIds.sort(), muscle).toEqual(drawn.sort());
    }
  });

  it("shows muscles that wrap around the body from both sides", () => {
    for (const muscle of ["lateral_deltoid", "trapezius", "forearms", "calves", "triceps"] as const) {
      expect(musclesInView("front").has(muscle), muscle).toBe(true);
      expect(musclesInView("back").has(muscle), muscle).toBe(true);
    }
  });

  it("has unique piece ids, well-formed closed paths and left/right symmetry", () => {
    const all = [...FRONT_ATLAS, ...BACK_ATLAS];
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const piece of all) expect(piece.d, piece.id).toMatch(PATH);
    for (const atlas of [FRONT_ATLAS, BACK_ATLAS]) {
      for (const muscle of new Set(atlas.flatMap((p) => (p.muscle ? [p.muscle] : [])))) {
        const sides = atlas.filter((p) => p.muscle === muscle).map((p) => p.side);
        expect(sides.filter((s) => s === "left").length, muscle).toBe(sides.filter((s) => s === "right").length);
      }
    }
    expect(FRONT_SILHOUETTE.length).toBeGreaterThan(500);
    expect(BACK_SILHOUETTE.length).toBeGreaterThan(500);
  });

  it("ships the upstream MIT licence with the vendored geometry", () => {
    const licence = readFileSync(join(process.cwd(), "lib/training/anatomy/ATLAS_LICENSE.txt"), "utf8");
    expect(licence).toMatch(/MIT License/);
    expect(licence).toMatch(/Plexa/);
  });
});
