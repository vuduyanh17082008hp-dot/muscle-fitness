import "server-only";

import { z } from "zod";

import { updateFoodLogQuantity } from "@/lib/nutrition/food-log/mutations";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z
  .object({
    foodLogId: z.string().uuid(),
    quantityGrams: z.number().positive().max(5000),
  })
  .strict();

export type UpdateFoodLogInput = z.infer<typeof inputSchema>;
export type UpdateFoodLogToolOutput = { foodLogId: string; calories: number };

/**
 * update_food_log — wraps
 * lib/nutrition/food-log/mutations.ts::updateFoodLogQuantity verbatim.
 * `foodLogId` must come from a prior get_nutrition_state call's
 * `recentEntries` (ownership is re-checked server-side regardless).
 */
export const updateFoodLogTool: DanteTool<UpdateFoodLogInput, UpdateFoodLogToolOutput> = {
  name: "update_food_log",
  description: "Change the quantity (in grams) of an already-logged food entry. Requires the entry's id from get_nutrition_state.",
  inputSchema,
  mode: "write",
  risk: "low",
  requiresConfirmation: true,

  summarize(input) {
    return `Update logged food entry to ${input.quantityGrams} g`;
  },

  async execute(context, input) {
    const { supabase, userId } = context;

    const result = await updateFoodLogQuantity(supabase, userId, {
      id: input.foodLogId,
      quantityGrams: input.quantityGrams,
    });

    if (!result.success) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: { foodLogId: result.data.id, calories: result.data.calories } };
  },
};
