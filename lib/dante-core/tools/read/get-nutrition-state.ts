import "server-only";

import { z } from "zod";

import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { compareToTargets, type DailyMacroComparison } from "@/lib/nutrition/food-log/totals";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z.object({}).strict();

export type NutritionStateToolOutput =
  | { hasTarget: false }
  | ({
      hasTarget: true;
      itemsLoggedToday: number;
      /** Only enough to let a follow-up update_food_log/delete_food_log call reference one of these — never a full row dump (Part 12). */
      recentEntries: Array<{ id: string; foodName: string; quantityGrams: number }>;
    } & DailyMacroComparison);

/**
 * get_nutrition_state — wraps the user's real nutrition target
 * (lib/nutrition/load-nutrition-context.ts) and today's actually
 * logged food (lib/nutrition/food-log), comparing them with the same
 * compareToTargets() the Dashboard uses. The LLM never computes
 * "remaining" itself (Part 3, Part 12 — the exact compact shape the
 * mission's own example specifies).
 */
export const getNutritionStateTool: DanteTool<Record<string, never>, NutritionStateToolOutput> = {
  name: "get_nutrition_state",
  description: "Get the user's today's nutrition: calories/protein/carbs/fat consumed, target, and remaining, from their real food log and nutrition plan.",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context) {
    const { supabase, userId } = context;

    const [nutritionContext, foodLog] = await Promise.all([
      loadNutritionContext(supabase, userId),
      loadFoodLogForDate(supabase, userId),
    ]);

    if (!nutritionContext.plan) {
      return { ok: true, data: { hasTarget: false } };
    }

    const comparison = compareToTargets(foodLog.totals, nutritionContext.plan.target);

    return {
      ok: true,
      data: {
        hasTarget: true,
        ...comparison,
        itemsLoggedToday: foodLog.entries.length,
        recentEntries: foodLog.entries.slice(-8).map((entry) => ({
          id: entry.id,
          foodName: entry.foodName,
          quantityGrams: entry.quantityGrams,
        })),
      },
    };
  },
};
