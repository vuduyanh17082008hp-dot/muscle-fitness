import { describe, expect, it, vi } from "vitest";

import { coatingOf, resolveFoodEntity, type FoodCandidate, type ResolverDeps } from "..";
import { searchLocalCanonical, searchPreparedCopies } from "../server";

/**
 * Preparation fidelity (live P1, 2026-10-24): "100 gr of fried chicken" → "but it's fried" was answered with plain cooked
 * chicken breast (165 kcal, 31 g protein). Frying adds oil and usually batter and skin, so only a fried record may answer it.
 * The fried records are offline USDA SR Legacy copies (lib/nutrition/food-data/local-fallback.ts), so USDA being down does
 * not change the answer.
 */

const usdaDown = vi.fn(async () => ({ foods: [] as FoodCandidate[], configured: false }));
const deps = (over: Partial<ResolverDeps> = {}): ResolverDeps => ({ searchLocal: searchLocalCanonical, searchPrepared: searchPreparedCopies, searchUsda: usdaDown, ...over });
const resolve = (text: string, base: string, extra: Record<string, unknown> = {}, d = deps()) => resolveFoodEntity({ text, base, preparation: "fried", quantityGrams: 100, ...extra }, d);

describe("fried food is never answered with a plain cooked record", () => {
  it("'100 g breaded fried chicken' → the battered USDA record, not cooked chicken breast", async () => {
    const r = await resolve("breaded chicken", "chicken");
    expect(r).toMatchObject({ status: "VERIFIED", source: "USDA_FDC", name: "Fried Chicken — meat and skin, battered", sourceId: "usda-171448" });
    expect(r.per100g).toMatchObject({ calories: 289, protein: 22.5, carbs: 9.42, fat: 17.4 });
    expect(r.name).not.toMatch(/^Chicken Breast$/);
  });

  it("fried with no coating stated → asks breaded/skin vs skinless (289 vs 219 kcal), states no numbers", async () => {
    const r = await resolve("chicken", "chicken");
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.per100g).toBeNull();
    expect(r.clarification).toEqual({ field: "coating", options: ["breaded, with skin", "skinless, no breading"] });
  });

  it("skinless vs with skin and breading are different records", async () => {
    expect((await resolve("skinless chicken", "chicken")).per100g?.calories).toBe(219);
    expect((await resolve("chicken", "chicken", { coating: "plain" })).name).toBe("Fried Chicken — meat only, no skin or batter");
    expect((await resolve("chicken", "chicken", { coating: "coated" })).per100g?.calories).toBe(289);
  });

  it("the cut is kept: a fried breast is not mixed pieces, and mixed pieces are not a breast", async () => {
    expect((await resolve("breaded chicken breast", "chicken breast")).per100g).toMatchObject({ calories: 260, protein: 24.8 });
    expect((await resolve("skinless chicken breast", "chicken breast")).per100g).toMatchObject({ calories: 187, protein: 33.4 });
    expect((await resolve("breaded chicken", "chicken")).name).not.toMatch(/breast/i);
  });

  it("grilled skinless chicken breast keeps the curated plain record (no fat added)", async () => {
    const r = await resolveFoodEntity({ text: "skinless chicken breast", base: "chicken breast", preparation: "grilled", quantityGrams: 100 }, deps());
    expect(r).toMatchObject({ source: "LOCAL_CANONICAL", name: "Chicken Breast", status: "VERIFIED" });
    expect(r.per100g).toMatchObject({ calories: 165, protein: 31 });
  });

  it("with USDA up, grilled skinless breast is never the braised record (live: 157 kcal 'cooked, braised')", async () => {
    const cand = (id: string, name: string, calories: number): FoodCandidate => ({ id, name, basis: "cooked", per100g: { calories, protein: 31, carbs: 0, fat: 3.2 }, confidence: "high" });
    const searchUsda = vi.fn(async () => ({ configured: true, foods: [cand("1", "Chicken, broilers or fryers, breast, skinless, boneless, meat only, cooked, braised", 157), cand("2", "Chicken, broilers or fryers, breast, meat only, cooked, fried", 187)] }));
    const r = await resolveFoodEntity({ text: "skinless chicken breast", base: "chicken breast", preparation: "grilled", quantityGrams: 100 }, deps({ searchUsda }));
    expect(r.name).not.toMatch(/braised|fried/);
    expect(r.per100g?.calories).toBe(165);
    const roasted = cand("3", "Chicken, broilers or fryers, breast, skinless, boneless, meat only, cooked, roasted", 165);
    const r2 = await resolveFoodEntity({ text: "skinless chicken breast", base: "chicken breast", preparation: "grilled", quantityGrams: 100 }, deps({ searchUsda: async () => ({ configured: true, foods: [cand("1", "Chicken, broilers or fryers, breast, skinless, boneless, meat only, cooked, braised", 157), roasted] }) }));
    expect(r2).toMatchObject({ source: "USDA_FDC", name: roasted.name });
  });

  it("a fried food with no fried record is unresolved, never its plain record", async () => {
    const r = await resolve("tofu", "tofu");
    expect(r).toMatchObject({ status: "UNRESOLVED", per100g: null });
    expect(r.reasons).toContain("no_fried_record");
  });

  it("USDA serves fried foods the offline copies lack, but never a restaurant's own record", async () => {
    const cand = (id: string, name: string, calories: number): FoodCandidate => ({ id, name, basis: "cooked", per100g: { calories, protein: 10, carbs: 20, fat: 15 }, confidence: "high" });
    const searchUsda = vi.fn(async () => ({ configured: true, foods: [cand("1", "KFC, Fried Tofu, Original", 400), cand("2", "Tofu, fried", 270), cand("3", "Tofu, raw, firm", 144)] }));
    const r = await resolve("tofu", "tofu", {}, deps({ searchUsda }));
    expect(r).toMatchObject({ source: "USDA_FDC", name: "Tofu, fried" });
    expect(searchUsda).toHaveBeenCalledWith("tofu fried");
  });

  it("a fried egg is the fried-egg record", async () => {
    expect((await resolve("egg", "egg")).per100g?.calories).toBe(196);
  });
});

describe("brand context", () => {
  it("a generic record standing in for KFC is ESTIMATED and says which brand it is not", async () => {
    const r = await resolve("chicken", "chicken", { coating: "coated", brand: "kfc" });
    expect(r).toMatchObject({ status: "ESTIMATED", genericFor: "kfc", name: "Fried Chicken — meat and skin, battered" });
    expect(r.reasons).toContain("generic_reference_for_brand");
  });

  it("no record → still unresolved, the brand adds no numbers", async () => {
    expect(await resolve("tofu", "tofu", { brand: "kfc" })).toMatchObject({ status: "UNRESOLVED", per100g: null });
  });
});

describe("coatingOf", () => {
  it.each([
    ["Fried Chicken — meat only, no skin or batter", "plain"],
    ["Fried Chicken — meat and skin, battered", "coated"],
    ["skinless breaded chicken", "coated"],
    ["skinless fried chicken", "plain"],
    ["fried chicken without breading", "plain"],
    ["crispy fried chicken", "coated"],
    ["fried chicken", undefined],
  ])("%s → %s", (text, want) => expect(coatingOf(text)).toBe(want));
});
