import { afterEach, expect, it, vi } from "vitest";
import { searchFood } from "../usda";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("skips null, incomplete and negative USDA rows before applying the result limit", async () => {
  vi.stubEnv("USDA_FDC_API_KEY", "test-key");
  const nutrients = [
    { nutrientNumber: "208", value: 100 }, { nutrientNumber: "203", value: 5 },
    { nutrientNumber: "204", value: 2 }, { nutrientNumber: "205", value: 15 },
  ];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ foods: [
    null,
    { fdcId: 1, description: "Rice raw", dataType: "Foundation", foodNutrients: [] },
    { fdcId: 2, description: "Rice raw", dataType: "Foundation", foodNutrients: nutrients.map((n) => ({ ...n, value: -1 })) },
    { fdcId: 3, description: "Rice raw", dataType: "SR Legacy", foodNutrients: nutrients },
  ] })));
  const result = await searchFood("rice", { limit: 1 });
  expect(result).toHaveLength(1);
  expect(result[0].sourceId).toBe("3");
  expect(result[0].per100g).toMatchObject({ calories: 100, protein: 5, carbs: 15, fat: 2 });
});
