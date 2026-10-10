import { makeSnapshot } from "../draft"
import type { CoachContext } from "../types"

export function makeCtx(
  overrides: Partial<{
    caloriesRemaining: number
    caloriesTarget: number
    proteinRemaining: number
    allergies: string[]
    excludedFoods: string[]
    preferredFoods: string[]
    recentFoodNames: string[]
    localDate: string
    goal: string
  }> = {},
): CoachContext {
  const caloriesTarget = overrides.caloriesTarget ?? 2200
  const proteinTarget = 160
  const caloriesRemaining = overrides.caloriesRemaining ?? 520
  const proteinRemaining = overrides.proteinRemaining ?? 54
  return {
    snapshot: makeSnapshot({
      capturedAt: "2026-10-07T10:00:00.000Z",
      timezone: "Asia/Singapore",
      localDate: overrides.localDate ?? "2026-10-07",
      goal: overrides.goal ?? "fat_loss",
      caloriesTarget,
      caloriesConsumed: caloriesTarget - caloriesRemaining,
      caloriesRemaining,
      proteinTarget,
      proteinConsumed: proteinTarget - proteinRemaining,
      proteinRemaining,
    }),
    guards: {
      allergies: overrides.allergies ?? [],
      excludedFoods: overrides.excludedFoods ?? [],
      preferredFoods: overrides.preferredFoods ?? [],
      recentFoodNames: overrides.recentFoodNames ?? [],
    },
    cookingAbility: null,
  }
}
