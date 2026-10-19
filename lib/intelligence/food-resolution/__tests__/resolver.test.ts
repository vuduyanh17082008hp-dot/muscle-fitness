import { describe, expect, it, vi } from "vitest";

import { resolveFoodEntity, scalePer100g, toGrams, type FoodCandidate, type LocalFoodHit, type ResolverDeps } from "..";
import { searchLocalCanonical } from "../server";

const cand = (id: string, name: string, basis: FoodCandidate["basis"], calories: number, protein: number, extra: Partial<FoodCandidate> = {}): FoodCandidate => ({
  id, name, basis, per100g: { calories, protein, carbs: 0, fat: 1, fiber: null, sugar: null, sodiumMg: 54 }, confidence: "high", ...extra,
});

const USDA = {
  atlanticCooked: cand("usda-175174", "Fish, cod, Atlantic, cooked, dry heat", "cooked", 105, 22.8),
  atlanticRaw: cand("usda-175175", "Fish, cod, Atlantic, raw", "raw", 82, 17.8),
  pacificRaw: cand("usda-1", "Fish, cod, Pacific, raw", "raw", 69, 15.1),
  fishSticks: cand("usda-2", "Fish sticks, frozen, prepared", "prepared", 230, 12),
  salmonRaw: cand("usda-3", "Fish, salmon, Atlantic, farmed, raw", "raw", 208, 20.4),
  salmonCooked: cand("usda-4", "Fish, salmon, Atlantic, farmed, cooked, dry heat", "cooked", 206, 22.1),
  brandedCod: cand("usda-5", "Cod fillet, breaded", "packaged", 200, 11, { confidence: "medium", brand: "ACME" }),
};

const localCod: LocalFoodHit = { id: "white_fish", name: "White Fish (cod)", basis: "cooked", per100g: { calories: 105, protein: 23, carbs: 0, fat: 0.9 }, verification: "VERIFIED" };

function deps(over: Partial<ResolverDeps> & { usda?: FoodCandidate[]; configured?: boolean; local?: LocalFoodHit | null } = {}): ResolverDeps & { usdaCalls: ReturnType<typeof vi.fn> } {
  const usdaCalls = vi.fn();
  return {
    searchLocal: over.searchLocal ?? (() => (over.local === undefined ? null : over.local)),
    searchUsda: over.searchUsda ?? (async (q: string) => {
      usdaCalls(q);
      return { foods: over.usda ?? [], configured: over.configured ?? true };
    }),
    usdaCalls,
  };
}

describe("resolveFoodEntity", () => {
  it("generic 'cod' is served by local canonical and never calls USDA", async () => {
    const d = deps({ local: localCod, usda: [USDA.atlanticCooked] });
    const r = await resolveFoodEntity({ text: "cod", base: "cod" }, d);
    expect(r).toMatchObject({ status: "VERIFIED", source: "LOCAL_CANONICAL", basis: "cooked" });
    expect(r.per100g).toMatchObject({ calories: 105, protein: 23 });
    expect(d.usdaCalls).not.toHaveBeenCalled();
    expect(r.diagnostics.USDA_LOOKUP.status).toBe("SKIPPED");
  });

  it("'Atlantic cod' prefers the USDA-specific record over generic local", async () => {
    const d = deps({ local: localCod, usda: [USDA.fishSticks, USDA.pacificRaw, USDA.atlanticCooked, USDA.atlanticRaw] });
    const r = await resolveFoodEntity({ text: "atlantic cod", base: "cod" }, d);
    expect(r.source).toBe("USDA_FDC");
    expect(r.name).toMatch(/Atlantic/);
    expect(r.attribution).toMatch(/FoodData Central/);
    expect(r.reasons).toContain("usda_more_specific_than_local");
  });

  it("'raw cod' with a cooked local entry uses USDA raw, not the cooked numbers", async () => {
    const d = deps({ local: localCod, usda: [USDA.atlanticCooked, USDA.atlanticRaw] });
    const r = await resolveFoodEntity({ text: "cod", base: "cod", preparation: "raw" }, d);
    expect(r).toMatchObject({ source: "USDA_FDC", basis: "raw" });
    expect(r.per100g?.calories).toBe(82);
  });

  it("raw requested, USDA down → local numbers returned as ESTIMATED with the mismatch stated", async () => {
    const r = await resolveFoodEntity({ text: "cod", base: "cod", preparation: "raw" }, deps({ local: localCod, configured: false }));
    expect(r.status).toBe("ESTIMATED");
    expect(r.source).toBe("LOCAL_CANONICAL");
    expect(r.reasons).toContain("requested_raw_local_is_cooked");
  });

  it("food missing locally → USDA, ranked (dish/branded noise loses)", async () => {
    const d = deps({ local: null, usda: [USDA.brandedCod, USDA.fishSticks, USDA.salmonRaw] });
    const r = await resolveFoodEntity({ text: "salmon", base: "salmon" }, d);
    expect(r).toMatchObject({ status: "VERIFIED", source: "USDA_FDC", sourceId: "usda-3" });
  });

  it("never selects a USDA record that lacks the core food", async () => {
    const r = await resolveFoodEntity({ text: "salmon", base: "salmon" }, deps({ local: null, usda: [USDA.fishSticks, USDA.pacificRaw] }));
    expect(r.status).toBe("UNRESOLVED");
    expect(r.per100g).toBeNull();
  });

  it("asks raw vs cooked only when weight scaling is requested and the choice moves calories > 20%", async () => {
    const usda = [USDA.salmonRaw, USDA.salmonCooked, cand("usda-9", "Fish, tilapia, raw", "raw", 96, 20)];
    const noQty = await resolveFoodEntity({ text: "salmon", base: "salmon" }, deps({ local: null, usda: [USDA.salmonRaw, USDA.salmonCooked] }));
    expect(noQty.status).toBe("VERIFIED"); // per-100 g answer needs no question
    const tuna = [cand("t1", "Fish, tuna, bluefin, raw", "raw", 144, 23.3), cand("t2", "Fish, tuna, bluefin, cooked, dry heat", "cooked", 184, 29.9)];
    const withQty = await resolveFoodEntity({ text: "tuna steak", base: "tuna steak", quantityGrams: 200 }, deps({ local: null, usda: tuna }));
    expect(withQty.status === "AMBIGUOUS" || withQty.status === "UNRESOLVED").toBe(true);
    const near = await resolveFoodEntity({ text: "salmon", base: "salmon", quantityGrams: 200 }, deps({ local: null, usda }));
    expect(near.status).toBe("VERIFIED"); // 208 vs 206 kcal: not material → no question
    const asked = await resolveFoodEntity({ text: "tuna", base: "tuna", quantityGrams: 200 }, deps({ local: null, usda: tuna }));
    expect(asked).toMatchObject({ status: "AMBIGUOUS", clarification: { field: "preparation", options: ["raw", "cooked"] } });
    expect(asked.per100g).toBeNull();
  });

  it("failure degradation: USDA throws → local; local throws → USDA; both down → UNRESOLVED (never invented)", async () => {
    const usdaThrows = deps({ local: localCod, searchUsda: async () => { throw new Error("boom"); } });
    expect((await resolveFoodEntity({ text: "atlantic cod", base: "cod" }, usdaThrows)).source).toBe("LOCAL_CANONICAL");
    const localThrows = deps({ searchLocal: () => { throw new Error("db"); }, usda: [USDA.salmonRaw] });
    const viaUsda = await resolveFoodEntity({ text: "salmon", base: "salmon" }, localThrows);
    expect(viaUsda.source).toBe("USDA_FDC");
    expect(viaUsda.reasons).toContain("local_lookup_failed");
    const both = await resolveFoodEntity({ text: "salmon", base: "salmon" }, { searchLocal: () => null, searchUsda: async () => { throw new Error("down"); } });
    expect(both).toMatchObject({ status: "UNRESOLVED", source: "NONE", per100g: null });
  });

  it("USDA not configured is reported, not hidden", async () => {
    const r = await resolveFoodEntity({ text: "salmon", base: "salmon" }, deps({ local: null, configured: false }));
    expect(r.status).toBe("UNRESOLVED");
    expect(r.reasons).toContain("usda_not_configured");
    expect(r.diagnostics.USDA_LOOKUP.status).toBe("NOT_CONFIGURED");
  });

  it("missing optional nutrients stay null, never 0", async () => {
    const r = await resolveFoodEntity({ text: "salmon", base: "salmon" }, deps({ local: null, usda: [USDA.salmonRaw] }));
    expect(r.per100g?.fiber).toBeNull();
    expect(r.per100g?.sugar).toBeNull();
  });

  it("'cod fish' / 'salmon fillet' are not treated as a variety", async () => {
    const d = deps({ local: localCod, usda: [USDA.atlanticCooked] });
    await resolveFoodEntity({ text: "cod fish", base: "cod" }, d);
    expect(d.usdaCalls).not.toHaveBeenCalled();
    const s = await resolveFoodEntity({ text: "salmon fillet", base: "salmon" }, deps({ local: null, usda: [USDA.salmonRaw] }));
    expect(s.source).toBe("USDA_FDC");
  });
});

describe("deterministic units", () => {
  it("200 g scaling is exact and null-preserving", () => {
    expect(scalePer100g({ calories: 105, protein: 23, carbs: 0, fat: 0.9, fiber: null }, 200)).toMatchObject({ calories: 210, protein: 46, fat: 1.8, fiber: null });
  });
  it("mass units convert; count units need a verified serving weight", () => {
    expect(toGrams(8, "oz")).toEqual({ grams: 226.8 });
    expect(toGrams(0.2, "kg")).toEqual({ grams: 200 });
    expect(toGrams(1, "fillet")).toEqual({ grams: null, reason: "needs_serving_weight" });
    expect(toGrams(2, "slice", 30)).toEqual({ grams: 60 });
    expect(toGrams(1, "ml")).toMatchObject({ grams: null });
  });
});

describe("server local adapter", () => {
  it("maps cod aliases to the curated entry and rejects loose substring hits", () => {
    expect(searchLocalCanonical("cod")).toMatchObject({ id: "white_fish", basis: "cooked", verification: "VERIFIED" });
    expect(searchLocalCanonical("salmon")).toBeNull();
    expect(searchLocalCanonical("chicken breast")?.id).toBe("chicken_breast");
  });
});
