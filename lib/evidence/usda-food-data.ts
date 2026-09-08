/**
 * USDA FoodData Central client.
 *
 * Real, live external evidence source for Dante's nutrition guidance.
 * https://fdc.nal.usda.gov/api-guide.html
 *
 * Gracefully degrades when USDA_FDC_API_KEY is not configured: callers
 * receive `{ available: false }` instead of a thrown error, so the AI
 * coach keeps working (using the local food database) with one fewer
 * evidence source rather than crashing.
 */

const USDA_FDC_BASE_URL = "https://api.nal.usda.gov/fdc/v1";

type UsdaFoodNutrient = {
  nutrientName?: string;
  nutrientId?: number;
  unitName?: string;
  value?: number;
};

type UsdaSearchResultFood = {
  fdcId: number;
  description: string;
  dataType?: string;
  foodNutrients?: UsdaFoodNutrient[];
};

type UsdaSearchResponse = {
  foods?: UsdaSearchResultFood[];
};

export type FoodEvidenceItem = {
  fdcId: number;
  description: string;
  dataType: string | null;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
};

export type FoodEvidenceResult =
  | {
      available: true;
      source: "USDA FoodData Central";
      query: string;
      items: FoodEvidenceItem[];
    }
  | {
      available: false;
      source: "USDA FoodData Central";
      query: string;
      reason: string;
    };

const NUTRIENT_IDS = {
  energyKcal: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
} as const;

function readNutrient(
  nutrients: UsdaFoodNutrient[] | undefined,
  nutrientId: number,
): number | null {
  const match = nutrients?.find(
    (nutrient) => nutrient.nutrientId === nutrientId,
  );

  return typeof match?.value === "number" ? match.value : null;
}

export function isUsdaFoodDataConfigured(): boolean {
  return Boolean(process.env.USDA_FDC_API_KEY?.trim());
}

/**
 * Search USDA FoodData Central for up to `limit` matching foods and
 * return their macro composition per 100 g, so Dante can cite an
 * external nutrition source instead of relying on the model's own
 * (unverifiable) knowledge of food composition.
 */
export async function searchFoodEvidence(
  query: string,
  limit = 3,
): Promise<FoodEvidenceResult> {
  const trimmedQuery = query.trim().slice(0, 200);
  const source = "USDA FoodData Central" as const;

  if (!trimmedQuery) {
    return {
      available: false,
      source,
      query: trimmedQuery,
      reason: "Empty search query.",
    };
  }

  const apiKey = process.env.USDA_FDC_API_KEY?.trim();

  if (!apiKey) {
    return {
      available: false,
      source,
      query: trimmedQuery,
      reason:
        "USDA_FDC_API_KEY is not configured. Falling back to the local food database.",
    };
  }

  try {
    const url = new URL(`${USDA_FDC_BASE_URL}/foods/search`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("query", trimmedQuery);
    url.searchParams.set("pageSize", String(Math.min(Math.max(limit, 1), 5)));
    url.searchParams.set("dataType", "Foundation,SR Legacy");

    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(6_000),
    });

    if (!response.ok) {
      return {
        available: false,
        source,
        query: trimmedQuery,
        reason: `USDA FoodData Central request failed (${response.status}).`,
      };
    }

    const payload = (await response.json()) as UsdaSearchResponse;

    const items: FoodEvidenceItem[] = (payload.foods ?? [])
      .slice(0, limit)
      .map((food) => ({
        fdcId: food.fdcId,
        description: food.description,
        dataType: food.dataType ?? null,
        caloriesPer100g: readNutrient(
          food.foodNutrients,
          NUTRIENT_IDS.energyKcal,
        ),
        proteinPer100g: readNutrient(
          food.foodNutrients,
          NUTRIENT_IDS.protein,
        ),
        carbsPer100g: readNutrient(
          food.foodNutrients,
          NUTRIENT_IDS.carbs,
        ),
        fatPer100g: readNutrient(food.foodNutrients, NUTRIENT_IDS.fat),
      }));

    return {
      available: true,
      source,
      query: trimmedQuery,
      items,
    };
  } catch (error) {
    return {
      available: false,
      source,
      query: trimmedQuery,
      reason:
        error instanceof Error
          ? `USDA FoodData Central request error: ${error.message}`
          : "USDA FoodData Central request error.",
    };
  }
}
