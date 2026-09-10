/**
 * BUDGET-AWARE NUTRITION PLANNER
 *
 * Extends the existing nutrition engine (lib/nutrition/plan.ts) — it
 * does NOT recompute calories/macros/BMR/PAL and does NOT create a
 * second meal-plan engine. Given an already-built `NutritionPlan`, this
 * module only decides WHICH foods deliver those already-fixed targets,
 * using the same SUBSTITUTION_ORDER equivalence groups the engine
 * already uses for allergy/exclusion swaps.
 *
 * Everything here is deterministic. Groq/Dante never invents grams,
 * prices, or the optimization itself — see app/api/chatbot/route.ts's
 * BUDGET NUTRITION prompt section, which explains this plan but does
 * not recalculate it.
 */

import {
  FOOD_TEMPLATES,
  SUBSTITUTION_ORDER,
  type FoodCategory,
  type Meal,
  type MealIngredient,
  type NutritionPlan,
} from "@/lib/nutrition/plan"

import { buildShoppingList, type ShoppingList } from "@/lib/nutrition/shopping-list"

import {
  estimateShoppingListCost,
  getFoodPrice,
  type ShoppingListCostSummary,
} from "@/lib/nutrition/food-prices"

export type BudgetStatus = "no_budget" | "within_budget" | "budget_exceeded"

export type BudgetSubstitution = {
  fromFoodId: string
  fromName: string
  toFoodId: string
  toName: string
  category: FoodCategory
  estimatedSavingSgd: number
}

export type BudgetPlanResult = {
  status: BudgetStatus
  weeklyBudgetSgd: number | null
  estimatedWeeklyCostSgd: number
  remainingSgd: number | null
  shortfallSgd: number | null
  meals: Meal[]
  mealTotals: NutritionPlan["mealTotals"]
  shoppingList: ShoppingList
  costSummary: ShoppingListCostSummary
  appliedSubstitutions: BudgetSubstitution[]
  suggestedSubstitutions: BudgetSubstitution[]
  alternatives: string[]
}

const FOOD_BY_ID = new Map(FOOD_TEMPLATES.map((food) => [food.id, food]))

const MAX_SUBSTITUTION_PASSES = 12

function macroKeyForCategory(
  category: FoodCategory,
): "proteinPer100g" | "carbsPer100g" | "fatPer100g" | null {
  if (category === "protein") return "proteinPer100g"
  if (category === "carb") return "carbsPer100g"
  if (category === "fat") return "fatPer100g"
  return null
}

function isNameBlocked(name: string, blockedTerms: string[]): boolean {
  const normalized = name.toLowerCase()

  return blockedTerms.some(
    (term) => term.trim().length > 0 && normalized.includes(term.trim().toLowerCase()),
  )
}

/**
 * Rebuilds one ingredient as a different food, preserving the gram
 * amount's original macro contribution (protein stays protein grams,
 * carb stays carb grams, fat stays fat grams) rather than preserving
 * raw weight — the same "macroTargetGrams / per100g" relationship
 * buildMeals() in plan.ts already uses. Calories and the OTHER macros
 * are allowed to shift, because that is what a real food swap does —
 * substitutions must recalculate honestly, not pretend to be free.
 */
function reIngredient(
  ingredient: MealIngredient,
  newFoodId: string,
): MealIngredient {
  const oldFood = FOOD_BY_ID.get(ingredient.foodId)
  const newFood = FOOD_BY_ID.get(newFoodId)

  if (!oldFood || !newFood) return ingredient

  const macroKey = macroKeyForCategory(ingredient.category)

  let grams = ingredient.grams

  if (macroKey && newFood[macroKey] > 0 && oldFood[macroKey] > 0) {
    grams = (ingredient.grams * oldFood[macroKey]) / newFood[macroKey]
  }

  grams = Math.max(5, Math.round(grams / 5) * 5)
  const factor = grams / 100

  return {
    foodId: newFood.id,
    name: newFood.name,
    category: newFood.category,
    grams,
    calories: Math.round(newFood.caloriesPer100g * factor),
    protein: Math.round(newFood.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(newFood.carbsPer100g * factor * 10) / 10,
    fat: Math.round(newFood.fatPer100g * factor * 10) / 10,
    measurementBasis: newFood.preparationState,
  }
}

function sumMealTotals(ingredients: MealIngredient[]): Meal["totals"] {
  return ingredients.reduce(
    (totals, ingredient) => ({
      calories: totals.calories + ingredient.calories,
      protein: Math.round((totals.protein + ingredient.protein) * 10) / 10,
      carbs: Math.round((totals.carbs + ingredient.carbs) * 10) / 10,
      fat: Math.round((totals.fat + ingredient.fat) * 10) / 10,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

function replaceFoodEverywhere(
  meals: Meal[],
  fromFoodId: string,
  toFoodId: string,
): Meal[] {
  return meals.map((meal) => {
    if (!meal.ingredients.some((ingredient) => ingredient.foodId === fromFoodId)) {
      return meal
    }

    const ingredients = meal.ingredients.map((ingredient) =>
      ingredient.foodId === fromFoodId ? reIngredient(ingredient, toFoodId) : ingredient,
    )

    return { ...meal, ingredients, totals: sumMealTotals(ingredients) }
  })
}

function weeklyCostFor(meals: Meal[], foodId: string): number {
  const gramsPerDay = meals
    .flatMap((meal) => meal.ingredients)
    .filter((ingredient) => ingredient.foodId === foodId)
    .reduce((sum, ingredient) => sum + ingredient.grams, 0)

  const price = getFoodPrice(foodId)
  if (!price) return 0

  return (price.pricePer100g * gramsPerDay * 7) / 100
}

/** Cheapest priced, unblocked, differently-priced alternative in the same functional group. */
function findCheaperSubstitute(
  foodId: string,
  category: FoodCategory,
  blockedTerms: string[],
): { foodId: string; name: string } | null {
  const currentPrice = getFoodPrice(foodId)
  if (!currentPrice) return null

  const candidates = (SUBSTITUTION_ORDER[category] ?? [])
    .filter((candidateId) => candidateId !== foodId)
    .map((candidateId) => ({
      food: FOOD_BY_ID.get(candidateId),
      price: getFoodPrice(candidateId),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        food: NonNullable<typeof candidate.food>
        price: NonNullable<typeof candidate.price>
      } => candidate.food !== undefined && candidate.price !== null,
    )
    .filter((candidate) => !isNameBlocked(candidate.food.name, blockedTerms))
    .filter((candidate) => candidate.price.pricePer100g < currentPrice.pricePer100g)
    .sort((a, b) => a.price.pricePer100g - b.price.pricePer100g)

  const best = candidates[0]
  return best ? { foodId: best.food.id, name: best.food.name } : null
}

function currentFoodIdsInMeals(meals: Meal[]): Set<string> {
  return new Set(meals.flatMap((meal) => meal.ingredients).map((i) => i.foodId))
}

function topCostContributors(
  meals: Meal[],
): Array<{ foodId: string; name: string; category: FoodCategory; weeklyCostSgd: number }> {
  const ids = currentFoodIdsInMeals(meals)

  return Array.from(ids)
    .map((foodId) => {
      const food = FOOD_BY_ID.get(foodId)
      return {
        foodId,
        name: food?.name ?? foodId,
        category: food?.category ?? "protein",
        weeklyCostSgd: weeklyCostFor(meals, foodId),
      }
    })
    .sort((a, b) => b.weeklyCostSgd - a.weeklyCostSgd)
}

export function buildBudgetPlan(
  plan: NutritionPlan,
  weeklyBudgetSgd: number | null,
  options: {
    manualSubstitutions?: Array<{ from: string; to: string }>
    blockedTerms?: string[]
  } = {},
): BudgetPlanResult {
  const blockedTerms =
    options.blockedTerms ??
    [...plan.input.allergies, ...plan.input.excludedFoods].filter(
      (term) => term.trim().length > 0,
    )

  let workingMeals: Meal[] = plan.meals.map((meal) => ({
    ...meal,
    ingredients: meal.ingredients.map((ingredient) => ({ ...ingredient })),
    totals: { ...meal.totals },
  }))

  const appliedSubstitutions: BudgetSubstitution[] = []

  function applySubstitution(fromFoodId: string, toFoodId: string) {
    const fromFood = FOOD_BY_ID.get(fromFoodId)
    const toFood = FOOD_BY_ID.get(toFoodId)
    if (!fromFood || !toFood) return

    const costBefore = weeklyCostFor(workingMeals, fromFoodId)
    workingMeals = replaceFoodEverywhere(workingMeals, fromFoodId, toFoodId)
    const costAfter = weeklyCostFor(workingMeals, toFoodId)

    appliedSubstitutions.push({
      fromFoodId,
      fromName: fromFood.name,
      toFoodId,
      toName: toFood.name,
      category: fromFood.category,
      estimatedSavingSgd: Math.round((costBefore - costAfter) * 100) / 100,
    })
  }

  // Manual substitutions requested by the user (e.g. "replace salmon with
  // chicken") are applied first and always honoured if valid.
  for (const manual of options.manualSubstitutions ?? []) {
    const fromFood = FOOD_BY_ID.get(manual.from)
    const toFood = FOOD_BY_ID.get(manual.to)

    if (!fromFood || !toFood) continue
    if (fromFood.category !== toFood.category) continue
    if (isNameBlocked(toFood.name, blockedTerms)) continue
    if (!currentFoodIdsInMeals(workingMeals).has(manual.from)) continue

    applySubstitution(manual.from, manual.to)
  }

  function currentCostSummary() {
    const shoppingList = buildShoppingList(
      { ...plan, meals: workingMeals },
      7,
    )
    return { shoppingList, costSummary: estimateShoppingListCost(shoppingList) }
  }

  let { shoppingList, costSummary } = currentCostSummary()

  if (weeklyBudgetSgd !== null && costSummary.totalSgd > weeklyBudgetSgd) {
    for (let pass = 0; pass < MAX_SUBSTITUTION_PASSES; pass += 1) {
      if (costSummary.totalSgd <= weeklyBudgetSgd) break

      const contributors = topCostContributors(workingMeals)
      let substituted = false

      for (const contributor of contributors) {
        const substitute = findCheaperSubstitute(
          contributor.foodId,
          contributor.category,
          blockedTerms,
        )

        if (substitute) {
          applySubstitution(contributor.foodId, substitute.foodId)
          substituted = true
          break
        }
      }

      if (!substituted) break

      ;({ shoppingList, costSummary } = currentCostSummary())
    }
  }

  const mealTotals = workingMeals.reduce(
    (totals, meal) => ({
      calories: totals.calories + meal.totals.calories,
      protein: Math.round((totals.protein + meal.totals.protein) * 10) / 10,
      carbs: Math.round((totals.carbs + meal.totals.carbs) * 10) / 10,
      fat: Math.round((totals.fat + meal.totals.fat) * 10) / 10,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )

  // Still-available cheaper swaps, offered even when already within
  // budget, so a user can proactively save more ("swap expensive food").
  const suggestedSubstitutions: BudgetSubstitution[] = topCostContributors(workingMeals)
    .slice(0, 5)
    .map((contributor) => {
      const substitute = findCheaperSubstitute(
        contributor.foodId,
        contributor.category,
        blockedTerms,
      )

      if (!substitute) return null

      const hypotheticalMeals = replaceFoodEverywhere(
        workingMeals,
        contributor.foodId,
        substitute.foodId,
      )

      const saving =
        contributor.weeklyCostSgd - weeklyCostFor(hypotheticalMeals, substitute.foodId)

      return {
        fromFoodId: contributor.foodId,
        fromName: contributor.name,
        toFoodId: substitute.foodId,
        toName: substitute.name,
        category: contributor.category,
        estimatedSavingSgd: Math.round(saving * 100) / 100,
      } satisfies BudgetSubstitution
    })
    .filter((item): item is BudgetSubstitution => item !== null)
    .slice(0, 3)

  let status: BudgetStatus = "no_budget"
  let remainingSgd: number | null = null
  let shortfallSgd: number | null = null
  let alternatives: string[] = []

  if (weeklyBudgetSgd !== null) {
    if (costSummary.totalSgd <= weeklyBudgetSgd) {
      status = "within_budget"
      remainingSgd = Math.round((weeklyBudgetSgd - costSummary.totalSgd) * 100) / 100
    } else {
      status = "budget_exceeded"
      shortfallSgd = Math.round((costSummary.totalSgd - weeklyBudgetSgd) * 100) / 100
      alternatives = [
        "Increase your estimated weekly budget.",
        "Use lower-cost substitutions for your most expensive ingredients.",
        "Relax non-essential food preferences (allergies and exclusions are never relaxed).",
      ]
    }
  }

  return {
    status,
    weeklyBudgetSgd,
    estimatedWeeklyCostSgd: costSummary.totalSgd,
    remainingSgd,
    shortfallSgd,
    meals: workingMeals,
    mealTotals,
    shoppingList,
    costSummary,
    appliedSubstitutions,
    suggestedSubstitutions,
    alternatives,
  }
}
