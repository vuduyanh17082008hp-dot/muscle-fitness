import "server-only";

import { z } from "zod";

import { loadCoachContext } from "@/lib/nutrition/coach/context";
import { COACH_INGREDIENT_IDS } from "@/lib/nutrition/coach/ingredients";
import { isStale, STALE_MESSAGE } from "@/lib/nutrition/coach/draft";
import { snapshotSchema } from "@/lib/nutrition/coach/schema";
import { mealFingerprint } from "@/lib/nutrition/coach/fingerprint";
import { assessConfidence, totalsFor } from "@/lib/nutrition/coach/macros";
import { createFoodLog } from "@/lib/nutrition/food-log/mutations";
import { isIngredientBlocked, requireIngredient } from "@/lib/nutrition/coach/ingredients";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z
  .object({
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"]),
    name: z.string().trim().min(1).max(120),
    ingredients: z
      .array(z.object({ ingredientId: z.enum(COACH_INGREDIENT_IDS as [string, ...string[]]), grams: z.number().positive().max(2000) }).strict())
      .min(1)
      .max(20),
    /**
     * Server-captured at proposal time: the CURRENT Athlete State snapshot the
     * user was shown when the action was proposed (never the client's draft
     * snapshot). Confirmation compares it with the then-current state, so a
     * target/remaining-macro change after the proposal blocks the log.
     */
    context: snapshotSchema.strict(),
  })
  .strict();

export type LogMealDraftInput = z.infer<typeof inputSchema>;
export type LogMealDraftOutput = { foodLogId: string; calories: number; protein: number };

/**
 * log_meal_draft — the Nutrition Coach's ONLY write. Like every write tool it
 * only ever runs from a claimed pending action (user confirmation), and the
 * pending action's UUID is the food-log idempotency key: retrying the same
 * confirmed action can never double-log, while a NEW confirmed action for the
 * same meal is a legitimate second log.
 *
 * Macros are recomputed here from canonical ingredient ids + grams —
 * client/model totals are never accepted. The meal is stored as one
 * food_logs row; `source_id` carries the meal fingerprint (similarity
 * detection only — not the idempotency key).
 */
export const logMealDraftTool: DanteTool<LogMealDraftInput, LogMealDraftOutput> = {
  name: "log_meal_draft",
  description: "Log a confirmed Nutrition Coach meal draft as one food-log entry. Macros are recomputed server-side from canonical ingredients.",
  inputSchema,
  mode: "write",
  risk: "medium",
  requiresConfirmation: true,

  summarize(input) {
    const totals = totalsFor(input.ingredients);
    return `Log "${input.name}" (~${Math.round(totals.calories)} kcal, ${Math.round(totals.protein)}g protein) as ${input.mealType.replace("_", " ")}`;
  },

  async execute(context, input) {
    const { supabase, userId, actionId } = context;

    if (!actionId) {
      return { ok: false, error: "A confirmed action is required to log a meal." };
    }

    const loaded = await loadCoachContext(supabase, userId);
    if (!loaded.ok) {
      return { ok: false, error: loaded.message };
    }
    const blockedTerms = [...loaded.ctx.guards.allergies, ...loaded.ctx.guards.excludedFoods];
    const blocked = input.ingredients
      .map(({ ingredientId }) => requireIngredient(ingredientId))
      .filter((ingredient) => isIngredientBlocked(ingredient, blockedTerms));
    if (blocked.length > 0) {
      return {
        ok: false,
        code: "ACTION_FORBIDDEN",
        error: `This meal contains a food from your current allergies or exclusions: ${blocked.map((item) => item.shortName).join(", ")}.`,
      };
    }

    if (isStale(input.context, loaded.ctx.snapshot)) {
      return { ok: false, code: "ACTION_STALE", error: `${STALE_MESSAGE} Refresh the meal, then log it again.` };
    }

    const totals = totalsFor(input.ingredients);
    const grams = input.ingredients.reduce((sum, item) => sum + item.grams, 0);
    const { confidence, reasons } = assessConfidence(input.ingredients);
    const isEstimated = confidence !== "HIGH";

    const result = await createFoodLog(supabase, userId, {
      mealType: input.mealType,
      foodName: input.name,
      source: "local",
      sourceId: mealFingerprint(input.ingredients),
      // totals come from the server's own ingredient table (totalsFor above), not from the request
      serverComputedProfile: true,
      per100g: {
        calories: (totals.calories / grams) * 100,
        protein: (totals.protein / grams) * 100,
        carbs: (totals.carbs / grams) * 100,
        fat: (totals.fat / grams) * 100,
      },
      quantityGrams: grams,
      idempotencyKey: actionId,
      finalizeActionId: actionId,
      isEstimated,
      estimationConfidence: isEstimated ? (confidence.toLowerCase() as "medium" | "low") : null,
      estimationReason: isEstimated ? reasons.join("; ") : null,
      estimatedFrom: input.ingredients
        .map((item) => {
          const ingredient = requireIngredient(item.ingredientId);
          return `${ingredient.name} ${item.grams} g (${ingredient.measurementBasis.toLowerCase().replace("_", " ")}; ${ingredient.provenance.toLowerCase().replaceAll("_", " ")})`;
        })
        .join(", "),
    });

    if (!result.success) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: { foodLogId: result.data.id, calories: result.data.calories, protein: result.data.proteinG } };
  },
};
