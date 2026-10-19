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

const row = (fdcId: number, description: string) => ({
  fdcId, description, dataType: "SR Legacy",
  foodNutrients: [{ nutrientNumber: "208", value: 100 }, { nutrientNumber: "203", value: 5 }, { nutrientNumber: "204", value: 2 }, { nutrientNumber: "205", value: 15 }],
});

it("serves a repeated query from the in-process cache and never caches an empty/failed result", async () => {
  vi.stubEnv("USDA_FDC_API_KEY", "test-key");
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ foods: [] })) // miss: must not stick
    .mockResolvedValueOnce(Response.json({ foods: [row(7, "Quinoa raw")] }))
    .mockResolvedValue(Response.json({ foods: [row(8, "SHOULD NOT BE FETCHED")] }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await searchFood("quinoa")).toEqual([]);
  const first = await searchFood("quinoa");
  const second = await searchFood("Quinoa");
  expect(first[0].sourceId).toBe("7");
  expect(second).toEqual(first);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  // No Next.js revalidate cache (it hung under `next dev`): the request opts out explicitly.
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
});
