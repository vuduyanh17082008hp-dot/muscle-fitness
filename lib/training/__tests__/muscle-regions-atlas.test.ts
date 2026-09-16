import { describe, expect, it } from "vitest";

import { MUSCLE_REGIONS } from "@/lib/training/muscle-regions";
import { MUSCLE_ATLAS_ENTRIES } from "@/lib/training/muscle-ontology";

describe("Muscle Intelligence atlas region coverage", () => {
  it("exposes lateral_deltoid on both front and back views", () => {
    const views = new Set(
      MUSCLE_REGIONS.filter((region) => region.muscle === "lateral_deltoid").map((region) => region.view),
    );

    expect(views.has("front")).toBe(true);
    expect(views.has("back")).toBe(true);
  });

  it("keeps lateral_deltoid preferredView aligned with a front region", () => {
    expect(MUSCLE_ATLAS_ENTRIES.lateral_deltoid.preferredView).toBe("front");
    expect(MUSCLE_ATLAS_ENTRIES.lateral_deltoid.visualRegionIds).toContain("lateral_deltoid-front");
  });
});
