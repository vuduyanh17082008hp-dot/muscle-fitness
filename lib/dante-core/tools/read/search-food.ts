import "server-only";

import { z } from "zod";

import { searchFood } from "@/lib/nutrition/food-data";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z
  .object({
    query: z.string().min(1).max(100),
    category: z.enum(["any", "raw", "packaged"]).optional(),
  })
  .strict();

export type SearchFoodToolOutput = {
  results: Array<{
    sourceId: string;
    source: string;
    name: string;
    brand: string | null;
    per100g: { calories: number; protein: number; carbs: number; fat: number };
  }>;
};

/**
 * search_food — wraps lib/nutrition/food-data::searchFood, the SAME
 * normalized USDA -> Open Food Facts -> local-fallback search the
 * Nutrition UI already uses (app/api/nutrition/foods/search/route.ts).
 * Never reimplements the source priority or normalization itself.
 */
export const searchFoodTool: DanteTool<{ query: string; category?: "any" | "raw" | "packaged" }, SearchFoodToolOutput> = {
  name: "search_food",
  description: "Search for a food by name and get its normalized per-100g macros, to use as input to the log_food tool.",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(_context, input) {
    const result = await searchFood(input.query, input.category ?? "any");

    return {
      ok: true,
      data: {
        results: result.foods.slice(0, 5).map((food) => ({
          sourceId: food.sourceId ?? food.id,
          source: food.source,
          name: food.name,
          brand: food.brand ?? null,
          per100g: {
            calories: food.per100g.calories,
            protein: food.per100g.protein,
            carbs: food.per100g.carbs,
            fat: food.per100g.fat,
          },
        })),
      },
    };
  },
};
