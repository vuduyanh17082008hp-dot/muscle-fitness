import { describe, expect, it } from "vitest"

import { applyDraftOp, assembleDraft, makeSnapshot } from "../draft"
import { requireIngredient } from "../ingredients"
import { scaleItems, servingMax } from "../macros"
import { buildMeal } from "../optimizer"
import type { CoachContext, MealConstraints } from "../types"

const ctx: CoachContext = {
  snapshot: makeSnapshot({ capturedAt: "2026-11-03T10:00:00.000Z", timezone: "Asia/Singapore", localDate: "2026-11-03", goal: "muscle_gain", caloriesTarget: 1990, caloriesConsumed: 390, caloriesRemaining: 1600, proteinTarget: 122, proteinConsumed: 16, proteinRemaining: 106 }),
  guards: { allergies: [], excludedFoods: [], preferredFoods: [], recentFoodNames: [] },
  cookingAbility: null,
} as CoachContext
const constraints: MealConstraints = { calorieCeiling: 597, calorieCeilingStrict: false, calorieCeilingSource: "context", proteinTarget: 54, proteinTargetSource: "context", maxPriceSgd: null, maxCookMinutes: null, availableIds: null }

describe("S4-B realistic servings — the engine never picks an oversized single food", () => {
  it("a realistic serving is 1.5× the typical portion for main components, inside the catalogue bound", () => {
    expect(servingMax(requireIngredient("potatoes"))).toBe(375)
    expect(servingMax(requireIngredient("cottage_cheese"))).toBe(300)
    expect(servingMax(requireIngredient("chicken_breast"))).toBe(225)
    expect(servingMax(requireIngredient("soy_sauce"))).toBe(requireIngredient("soy_sauce").maxGrams) // flavourings keep their bound
  })

  it("auto-scaling for a high protein target stops at a realistic serving (live: 370 g cottage cheese)", () => {
    const items = scaleItems([{ ingredientId: "cottage_cheese", grams: 200 }, { ingredientId: "oats", grams: 40 }, { ingredientId: "banana", grams: 100 }], { mode: "AUTO", targetCalories: 567, targetProtein: 54 })
    expect(items.find((item) => item.ingredientId === "cottage_cheese")!.grams).toBeLessThanOrEqual(300)
  })

  it("every option the builder offers stays within realistic servings", () => {
    const result = buildMeal(ctx, constraints, "BALANCED", { alternatives: 7 })
    expect(result.status).toBe("OK")
    if (result.status !== "OK") return
    for (const option of [result.best, ...result.alternatives]) {
      for (const item of option.items) expect(item.grams, `${option.items.map((i) => `${i.ingredientId} ${i.grams}`).join(", ")}`).toBeLessThanOrEqual(servingMax(requireIngredient(item.ingredientId)))
    }
  })

  it("a breakfast request leads with a breakfast-style meal (live: tuna bread bowl for breakfast)", () => {
    const result = buildMeal(ctx, constraints, "BALANCED", { preferFamily: "yogurt_bowl" })
    expect(result.status).toBe("OK")
    if (result.status === "OK") expect(result.best.family).toBe("yogurt_bowl")
  })

  it("a lower-fat swap keeps a normal serving and states the trade-off instead of matching calories with 390 g potato", () => {
    const draft = assembleDraft({ ctx, family: "savory_bowl", items: [{ ingredientId: "tuna", grams: 170 }, { ingredientId: "wraps", grams: 110 }, { ingredientId: "cucumber", grams: 100 }], constraints })
    const result = applyDraftOp(ctx, draft, { type: "lower_fat" })
    expect(result.applied).toBe(true)
    const swappedIn = result.draft.ingredients.find((item) => !draft.ingredients.some((before) => before.ingredientId === item.ingredientId))!
    expect(swappedIn.grams).toBeLessThanOrEqual(servingMax(requireIngredient(swappedIn.ingredientId)))
    expect(result.draft.nutrition.fat).toBeLessThan(draft.nutrition.fat)
    expect(result.message).toMatch(/normal serving .* so it's now \d+ kcal/) // the trade-off is said, not hidden
  })

  it("'more protein' on a full serving adds a second protein of the same kind instead of inflating one food", () => {
    const bowl = assembleDraft({ ctx, family: "yogurt_bowl", items: [{ ingredientId: "greek_yogurt", grams: 300 }, { ingredientId: "oats", grams: 40 }, { ingredientId: "berries", grams: 80 }], constraints })
    const result = applyDraftOp(ctx, bowl, { type: "more_protein" })
    expect(result.applied).toBe(true)
    const added = result.draft.ingredients.find((item) => !bowl.ingredients.some((before) => before.ingredientId === item.ingredientId))
    expect(added && requireIngredient(added.ingredientId).tags).toContain("dairy") // never tuna in a yogurt bowl
    expect(result.draft.nutrition.protein).toBeGreaterThan(bowl.nutrition.protein + 5)
  })
})
