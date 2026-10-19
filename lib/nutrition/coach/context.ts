import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadRecentFoods } from "@/lib/nutrition/food-log/history"
import { compareToTargets } from "@/lib/nutrition/food-log/totals"
import { localDateTimeParts, resolveUserTimeZone } from "@/lib/training/load-today-session"

import { makeSnapshot } from "./draft"
import type { CoachContext } from "./types"

export type CoachContextResult =
  | { ok: true; ctx: CoachContext }
  | { ok: false; code: "NO_TARGET" | "FOOD_LOG_UNAVAILABLE" | "NUTRITION_CONTEXT_UNAVAILABLE" | "NUTRITION_CONTEXT_TIMEOUT"; message: string }

/**
 * Builds the Nutrition Coach's context from the SAME canonical loaders that
 * back Athlete State's `nutrition` section and Dante's `get_nutrition_state`
 * tool (loadNutritionContext + loadFoodLogForDate + compareToTargets). There
 * is deliberately no nutrition-specific profile/memory store: allergies,
 * exclusions and preferences always come from `user_preferences` via
 * loadNutritionContext (which also merges allergies disclosed in chat, from coach_signals),
 * never from the client.
 */
export async function loadCoachContext(supabase: SupabaseClient, userId: string, now: Date = new Date()): Promise<CoachContextResult> {
  const timezone = (await resolveUserTimeZone(supabase, userId)) || "UTC"
  const { localDate } = localDateTimeParts(now, timezone)

  const [nutrition, foodLog, recent] = await Promise.all([
    loadNutritionContext(supabase, userId),
    loadFoodLogForDate(supabase, userId, localDate),
    loadRecentFoods(supabase, userId).catch(() => []),
  ])

  // A failed read is not a missing profile: never tell the user to "complete" a profile we simply could not load, and never
  // coach on empty allergies/exclusions because the preferences (or disclosed-allergy) read failed.
  if (nutrition.unavailable?.length) return { ok: false, code: "NUTRITION_CONTEXT_UNAVAILABLE", message: "I couldn't load your nutrition profile right now (targets, allergies and exclusions), so I won't guess. Please try again in a moment." }
  const target = nutrition.targets.complete
  if (!nutrition.plan || !target) return { ok: false, code: "NO_TARGET", message: "Complete your profile first so I can work from your real calorie and protein targets." }
  if (foodLog.unavailable) return { ok: false, code: "FOOD_LOG_UNAVAILABLE", message: "Your food log is unavailable right now, so I can't tell what you have left today." }

  const comparison = compareToTargets(foodLog.totals, target)
  const input = nutrition.plan.input

  return {
    ok: true,
    ctx: {
      snapshot: makeSnapshot({
        capturedAt: now.toISOString(),
        timezone,
        localDate,
        goal: nutrition.fitnessGoal ?? input.goal,
        caloriesTarget: comparison.calories.target,
        caloriesConsumed: comparison.calories.consumed,
        caloriesRemaining: comparison.calories.remaining,
        proteinTarget: comparison.protein.target,
        proteinConsumed: comparison.protein.consumed,
        proteinRemaining: comparison.protein.remaining,
      }),
      guards: {
        allergies: input.allergies,
        excludedFoods: input.excludedFoods,
        preferredFoods: input.foodPreferences,
        recentFoodNames: recent.map((item) => item.foodName),
      },
      cookingAbility: nutrition.cookingAbility,
    },
  }
}
