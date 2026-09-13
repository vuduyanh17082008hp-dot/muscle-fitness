import "server-only";

import { z } from "zod";

import { deleteFoodLog } from "@/lib/nutrition/food-log/mutations";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z
  .object({
    foodLogId: z.string().uuid(),
  })
  .strict();

export type DeleteFoodLogInput = z.infer<typeof inputSchema>;
export type DeleteFoodLogToolOutput = { foodLogId: string };

/**
 * delete_food_log — wraps lib/nutrition/food-log/mutations.ts::deleteFoodLog
 * verbatim. `foodLogId` must come from a prior get_nutrition_state
 * call's `recentEntries` (ownership is re-checked server-side
 * regardless — the WHERE clause is scoped to `user_id`).
 */
export const deleteFoodLogTool: DanteTool<DeleteFoodLogInput, DeleteFoodLogToolOutput> = {
  name: "delete_food_log",
  description: "Remove an already-logged food entry. Requires the entry's id from get_nutrition_state.",
  inputSchema,
  mode: "write",
  risk: "low",
  requiresConfirmation: true,

  summarize() {
    return "Delete a logged food entry";
  },

  async execute(context, input) {
    const { supabase, userId } = context;

    const result = await deleteFoodLog(supabase, userId, input.foodLogId);

    if (!result.success) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: { foodLogId: result.data.id } };
  },
};
