import "server-only";

import { z } from "zod";

import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { compareToTargets, type DailyMacroComparison } from "@/lib/nutrition/food-log/totals";
import { localDateTimeParts } from "@/lib/training/load-today-session";
import type { DanteTool } from "@/lib/dante-core/tools/types";
import { cached } from "@/lib/dante-core/tools/request-cache";

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
    const { supabase, userId, now, timezone } = context;

    // Same user-local calendar day as get_today_plan/get_current_workout
    // (lib/training/load-today-session.ts) — never a raw UTC slice, so
    // "today's" food log can't silently disagree with "today's" workout
    // near local midnight.
    const { localDate } = localDateTimeParts(now, timezone || "UTC");

    const [nutritionContext, foodLog] = await Promise.all([
      cached(context, "nutritionContext", () => loadNutritionContext(supabase, userId)),
      cached(context, "foodLog", () => loadFoodLogForDate(supabase, userId, localDate)),
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
