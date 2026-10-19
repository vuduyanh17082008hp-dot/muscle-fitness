import { describe, expect, it } from "vitest"

import { buildBudgetPlan } from "@/lib/nutrition/budget"
import { buildNutritionPlan, FOOD_TEMPLATES, isFoodBlocked, type NutritionInput } from "@/lib/nutrition/plan"

const input = (allergies: string[]): NutritionInput => ({
  sex: "male", age: 28, heightCm: 178, weightKg: 78, activityLevel: "light", trainingMode: "strength", goal: "lean_bulk",
  trainingDaysPerWeek: 4, mealsPerDay: 4, foodPreferences: [], excludedFoods: [], allergies,
})
const foodIds = (allergies: string[]) => buildNutritionPlan(input(allergies)).meals.flatMap((meal) => meal.ingredients.map((item) => item.foodId))

describe("plan engine: an allergy names a group, not only a food (hackathon repair F-01)", () => {
  it("'fish' removes salmon and cod; 'nuts' removes peanut butter; 'dairy' removes yogurt and whey", () => {
    expect(foodIds([])).toEqual(expect.arrayContaining(["salmon"]))
    expect(foodIds(["fish"])).not.toEqual(expect.arrayContaining(["salmon"]))
    expect(foodIds(["fish"]).some((id) => id === "salmon" || id === "cod")).toBe(false)
    expect(foodIds(["nuts"])).not.toContain("peanut_butter")
    expect(foodIds(["dairy"]).some((id) => id === "greek_yogurt" || id === "whey_protein")).toBe(false)
  })

  it("matches by name as before and never blocks an unrelated food", () => {
    const byId = (id: string) => FOOD_TEMPLATES.find((food) => food.id === id)!
    expect(isFoodBlocked(byId("salmon"), ["salmon"])).toBe(true)
    expect(isFoodBlocked(byId("chicken_breast"), ["fish", "nuts", "dairy"])).toBe(false)
  })

  it("the budget planner never swaps an allergen back in", () => {
    const plan = buildNutritionPlan(input(["fish"]))
    const budget = buildBudgetPlan(plan, 20)
    const ids = budget.meals.flatMap((meal) => meal.ingredients.map((item) => item.foodId))
    expect(ids.some((id) => id === "salmon" || id === "cod")).toBe(false)
  })
})
