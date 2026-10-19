import { describe, expect, it } from "vitest"

import { makeCtx } from "../../__tests__/fixtures"
import { findIngredientByText } from "../../ingredients"
import { resolveConversationContext } from "../context"
import { applyContextLifecycle } from "../lifecycle"
import { buildPlan } from "../plan"
import { runDeterministicTools } from "../tools"
import type { PlanningExtras, RecentMessage } from "../types"
import { validatePlannerOutput } from "../validate"

const guards = { allergies: [] as string[], excludedFoods: [] as string[] }

function lookup(message: string, food: { text: string; grams: number | null }, recent: RecentMessage[] = [], extras: PlanningExtras = {}) {
  const raw = {
    understanding: { userGoal: null, explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "food macros", secondaryNeeds: [], needExactCalculation: true, needFoodLookup: true, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
    strategy: { mode: "ANSWER", primaryObjective: "state food macros", supportingObjectives: [], requiresConfirmation: false },
    clarification: null,
    foods: [food],
  }
  const { context, invalidations } = applyContextLifecycle(message, resolveConversationContext(message, recent), extras)
  const validated = validatePlannerOutput(raw, context)
  if (!validated.ok) throw new Error(validated.reason)
  const plan = buildPlan(validated.value, context, guards, { athleteStateAvailable: true, message, extras, invalidations })
  return runDeterministicTools(plan, makeCtx(), extras)
}

const CONCEPTUAL: RecentMessage[] = [{ role: "user", text: "do u think cod fish is a good source of protien" }, { role: "coach", text: "Yes, cod is a lean, high-protein fish." }]

describe("food macro lookup", () => {
  it.each(["cod", "cod fish", "Atlantic cod", "Pacific cod"])("%s resolves to the cod entry", (name) => {
    expect(findIngredientByText(name)?.id).toBe("white_fish")
  })

  it("does not map unrelated fish to cod", () => {
    expect(findIngredientByText("salmon")?.id).not.toBe("white_fish")
  })

  it("no quantity -> per-100 g values, no invented serving, not unavailable", () => {
    const results = lookup("give me the macro for cod fish", { text: "cod fish", grams: null })
    expect(results.exactUnavailable).toBeFalsy()
    const food = results.foods![0]
    expect(food.grams).toBeNull()
    expect(food.macros).toBeNull()
    expect(food.per100g).toMatchObject({ calories: 105, protein: 23, basis: "COOKED", status: "VERIFIED" })
    expect(results.binding).toMatchObject({ source: "DETERMINISTIC_SERVICE", mayInvent: false })
    expect(results.numbers).toContain(105)
  })

  it("follow-up after a conceptual cod question still resolves", () => {
    const results = lookup("give me the macro for cod fish", { text: "cod fish", grams: null }, CONCEPTUAL)
    expect(results.foods![0].per100g?.protein).toBe(23)
  })

  it("an active draft does not hijack the lookup", () => {
    const draft = [{ ingredientId: "oats", grams: 50 }]
    const results = lookup("give me the macro for cod fish", { text: "cod fish", grams: null }, CONCEPTUAL, { activeDraftItems: draft })
    expect(results.foods![0].matched).toMatch(/cod/i)
    expect(results.entity).toBeUndefined()
    expect(results.exactUnavailable).toBeFalsy()
  })

  it("quantity -> deterministic scaling", () => {
    const results = lookup("give me the macros for 200g cod", { text: "cod", grams: 200 })
    expect(results.foods![0].macros).toMatchObject({ calories: 210, protein: 46 })
    expect(results.foods![0].per100g).toBeUndefined()
  })

  it("an ESTIMATED table entry keeps ESTIMATED status (beef is curated, not USDA)", () => {
    expect(lookup("macros for beef", { text: "beef", grams: null }).foods![0].per100g?.status).toBe("ESTIMATED")
  })

  it("unknown food stays unresolved: no numbers, honest unavailable", () => {
    const results = lookup("macros for zorblax", { text: "zorblax", grams: null })
    expect(results.foods![0]).toMatchObject({ matched: null, macros: null })
    expect(results.foods![0].per100g).toBeUndefined()
    expect(results.exactUnavailable).toBe(true)
  })
})
