import { describe, expect, it } from "vitest";

import { resolveFood } from "../server";

/**
 * Live USDA FoodData Central smoke (read-only public API). Skipped unless MF_LIVE_USDA=1 and USDA_FDC_API_KEY are set.
 *   MF_LIVE_USDA=1 USDA_FDC_API_KEY=... npx vitest run lib/intelligence/food-resolution/__tests__/usda-live.test.ts
 */
const live = process.env.MF_LIVE_USDA === "1" && Boolean(process.env.USDA_FDC_API_KEY);

describe.skipIf(!live)("USDA live resolution", () => {
  it("generic cod stays on the local canonical table (no external call needed)", async () => {
    const r = await resolveFood({ text: "cod", base: "cod" });
    expect(r).toMatchObject({ source: "LOCAL_CANONICAL", status: "VERIFIED" });
    expect(r.diagnostics.USDA_LOOKUP.status).toBe("SKIPPED");
  }, 20000);

  it("Atlantic cod is served by a USDA Atlantic cod record", async () => {
    const r = await resolveFood({ text: "atlantic cod", base: "cod" });
    console.info("[live] atlantic cod ->", r.source, r.status, r.name, r.basis, r.per100g?.calories, r.per100g?.protein, r.reasons.join(","));
    expect(r.source).toBe("USDA_FDC");
    expect(r.name?.toLowerCase()).toContain("cod");
    expect(r.per100g?.protein).toBeGreaterThan(15);
  }, 20000);

  it("a food outside the local table (salmon) resolves via USDA with provenance", async () => {
    const r = await resolveFood({ text: "salmon", base: "salmon" });
    console.info("[live] salmon ->", r.source, r.status, r.name, r.basis, r.per100g?.calories, r.per100g?.protein, r.reasons.join(","));
    expect(r.source).toBe("USDA_FDC");
    expect(r.attribution).toMatch(/FoodData Central/);
    expect(r.per100g?.calories).toBeGreaterThan(100);
  }, 20000);

  it("raw cod is NOT the cooked local number", async () => {
    const r = await resolveFood({ text: "cod", base: "cod", preparation: "raw" });
    console.info("[live] raw cod ->", r.source, r.status, r.name, r.basis, r.per100g?.calories, r.reasons.join(","));
    expect(r.basis === "raw" || r.status === "ESTIMATED").toBe(true);
  }, 20000);

  it("tuna steak with a 200 g quantity asks raw vs cooked or resolves a specific state", async () => {
    const r = await resolveFood({ text: "tuna", base: "tuna", quantityGrams: 200 });
    console.info("[live] tuna 200g ->", r.source, r.status, r.name, r.basis, r.reasons.join(","));
    expect(["VERIFIED", "AMBIGUOUS", "ESTIMATED"]).toContain(r.status);
  }, 20000);
});
