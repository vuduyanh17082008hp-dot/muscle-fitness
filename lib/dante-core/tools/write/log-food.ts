import "server-only";

import { z } from "zod";

import { createFoodLog } from "@/lib/nutrition/food-log/mutations";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const per100gSchema = z.object({
  calories: z.number().min(0).max(2000),
  protein: z.number().min(0).max(200),
  carbs: z.number().min(0).max(200),
  fat: z.number().min(0).max(200),
});

const inputSchema = z
  .object({
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"]),
    foodName: z.string().trim().min(1).max(200),
    quantityGrams: z.number().positive().max(5000),
    per100g: per100gSchema,
    brand: z.string().trim().max(200).nullable().optional(),
    /** Set when this call follows a search_food result — otherwise this is Dante's own estimate, marked as such below. */
    source: z.enum(["usda", "open-food-facts", "local", "ai_estimate"]).default("ai_estimate"),
    sourceId: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export type LogFoodInput = z.infer<typeof inputSchema>;
export type LogFoodToolOutput = { foodLogId: string; calories: number; protein: number };

/**
 * log_food — the ONLY way a Dante tool call can add to the food log.
 * Wraps lib/nutrition/food-log/mutations.ts::createFoodLog verbatim —
 * the exact same server-side macro recomputation
 * (per100g x quantityGrams) every other food-entry path in the app
 * uses (barcode/search/photo estimate). A tool call NEVER writes to
 * `food_logs` directly (Part 6, Part 17).
 *
 * WRITE tool — requiresConfirmation is always true here; the
 * orchestrator (lib/dante-core/tools/orchestrate.ts) never calls
 * `execute` directly from a model tool-call, only from a claimed
 * pending action (Part 7, Part 8).
 */
export const logFoodTool: DanteTool<LogFoodInput, LogFoodToolOutput> = {
  name: "log_food",
  description: "Add one food entry to the user's food log for today. Requires per100g macros — use search_food first when possible; otherwise supply your own best estimate and it will be marked as an estimate.",
  inputSchema,
  mode: "write",
  risk: "medium",
  requiresConfirmation: true,

  summarize(input) {
    return `Add ${input.quantityGrams} g ${input.foodName} to ${input.mealType.replace("_", " ")}`;
  },

  async execute(context, input) {
    const { supabase, userId } = context;

    const isEstimate = input.source === "ai_estimate";

    const result = await createFoodLog(supabase, userId, {
      mealType: input.mealType,
      foodName: input.foodName,
      brand: input.brand ?? null,
      source: input.source,
      sourceId: input.sourceId ?? null,
      per100g: input.per100g,
      quantityGrams: input.quantityGrams,
      isEstimated: isEstimate,
      estimationConfidence: isEstimate ? "medium" : null,
      estimationReason: isEstimate ? "Estimated by Dante from general nutrition knowledge, not a matched database record." : null,
    });

    if (!result.success) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: { foodLogId: result.data.id, calories: result.data.calories, protein: result.data.proteinG } };
  },
};
