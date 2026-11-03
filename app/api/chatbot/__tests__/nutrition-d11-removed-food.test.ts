import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/nutrition/load-nutrition-context", () => ({ loadNutritionContext: vi.fn() }))
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({ loadFoodLogForDate: vi.fn(), resolveLocalToday: vi.fn() }))
vi.mock("@/lib/nutrition/food-log/history", () => ({ loadRecentFoods: vi.fn(async () => []) }))
vi.mock("@/lib/training/load-today-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/training/load-today-session")>()),
  resolveUserTimeZone: vi.fn(async () => "Asia/Singapore"),
}))
vi.mock("@/lib/dante-core/openai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/client")>()),
  callOpenAiWithFallback: vi.fn(),
}))
vi.mock("@/lib/dante-core/openai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/config")>()),
  isOpenAiConfigured: vi.fn(() => true),
}))
vi.mock("@/lib/nutrition/knowledge/retrieve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nutrition/knowledge/retrieve")>()),
  getOptionalNutritionKnowledgeContext: vi.fn(async () => null),
}))

import { POST } from "@/app/api/chatbot/route"
import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { PLANNER_MARKER } from "@/lib/nutrition/coach/orchestration"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
import { createClient } from "@/lib/supabase/server"

/**
 * D-11 (release gate 2026-10-27, live): lunch = Chicken Breast + Rice, the chicken was discussed, then deleted through the food-log
 * UI. "How much protein was in the chicken?" re-voiced the chat's 33.8 g as if the chicken were still logged. A food named with
 * "the" is resolved against the CURRENT rows; a removed row is said to be removed, with no numbers.
 */
const USER = "00000000-0000-4000-8000-0000000000d1"
type Entry = { id: string; mealType: string; foodName: string; quantityGrams: number; calories: number; proteinG: number }
const row = (id: string, mealType: string, foodName: string, quantityGrams: number, calories: number, proteinG: number): Entry => ({ id, mealType, foodName, quantityGrams, calories, proteinG })
const CHICKEN = row("c1", "lunch", "Chicken Breast", 110, 181.5, 33.8)
const RICE = row("r1", "lunch", "Cooked rice", 200, 260, 5.4)
const LUNCH = [CHICKEN, RICE]
let log: Entry[] = []

// The live coach turn that discussed the chicken, and the composer's stale re-voicing after the delete.
const DISCUSSED = "For lunch you had 110 g of chicken breast with 33.8 g of protein and 182 kcal, plus 200 g of cooked rice with 5.4 g of protein."
const STALE = "The chicken breast in your lunch had about 33.8 g of protein."
const stale = /33\.8|\b182\b|181\.5|110 g/

const plan = { understanding: { userGoal: "know intake", explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: true, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null }, need: { primaryNeed: "intake", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: true, needClarification: false, needActionConfirmation: false, confidence: "HIGH" }, strategy: { mode: "ANSWER", primaryObjective: "answer", supportingObjectives: [], requiresConfirmation: false }, clarification: null, foods: [] }
type Mode = "ok" | "malformed" | "down"
function provider(mode: Mode, reply = STALE) {
  if (mode === "down") return vi.mocked(callOpenAiWithFallback).mockRejectedValue(new Error("provider down"))
  vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => {
    if (prompt.includes(PLANNER_MARKER)) return { reply: mode === "ok" ? JSON.stringify(plan) : "not a plan", model: "test" }
    return { reply, model: "test" }
  })
}

// `seen` = the log when the last coach turn was written (the panel echoes it back as conversation.loggedRows).
const ask = async (message: string, lastCoach = DISCUSSED, seen: Entry[] = LUNCH) => {
  const recentMessages = [{ role: "user" as const, text: "How much protein is in my lunch?" }, { role: "coach" as const, text: lastCoach }, { role: "user" as const, text: message }]
  const loggedRows = seen.map((e) => ({ id: e.id, meal: e.mealType, food: e.foodName }))
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", conversation: { recentMessages, loggedRows } }) }))
  return { status: response.status, ...(await response.json()) } as { status: number; reply: string; code?: string; conversation?: { loggedRows?: Array<{ id: string }> | null } }
}

beforeEach(() => {
  vi.clearAllMocks()
  log = [RICE]
  vi.mocked(createClient).mockImplementation((async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }, from: vi.fn(() => { throw new Error("no direct table access") }) })) as never)
  vi.mocked(loadNutritionContext).mockImplementation((async () => ({
    plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: [] } },
    targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  })) as never)
  vi.mocked(loadFoodLogForDate).mockImplementation((async () => {
    const entries = log.map((e) => ({ ...e, logDate: "2026-10-27", servingName: null, servingsConsumed: null, carbsG: 0, fatG: 0 }))
    return { date: "2026-10-27", entries, totals: { calories: entries.reduce((s, e) => s + e.calories, 0), protein: entries.reduce((s, e) => s + e.proteinG, 0), carbs: 0, fat: 0 } }
  }) as never)
  provider("ok")
})

describe("D-11: a food removed from a multi-food meal is never described as logged", () => {
  for (const mode of ["ok", "malformed", "down"] as const) {
    it(`RED repro (planner ${mode}): chicken deleted from chicken + rice -> removal said, no chicken numbers, lunch now named`, async () => {
      provider(mode)
      const json = await ask("How much protein was in the chicken?")
      expect(json.status).toBe(200)
      expect(json.reply).not.toMatch(stale)
      expect(json.reply).toMatch(/Chicken Breast was logged under your lunch when I last replied, but it is no longer in today's food log/)
      expect(json.reply).toMatch(/won't give its numbers/)
      expect(json.reply).toMatch(/Your lunch now has Cooked rice \(200 g\)\./)
      // The chat still means the removed row, so the snapshot it echoes keeps it.
      expect(json.conversation?.loggedRows?.map((r) => r.id)).toEqual(["c1", "r1"])
    })
  }

  it("historical question after the delete: no amounts are reconstructed", async () => {
    const json = await ask("How much protein was in the chicken before I deleted it?")
    expect(json.reply).not.toMatch(stale)
    expect(json.reply).toMatch(/no longer in today's food log/)
    expect(json.reply).toMatch(/don't have a verified record of its amounts/)
  })

  it("'my lunch now' after the delete: the current rows only", async () => {
    for (const message of ["How much protein is in my lunch now?", "What's in my lunch now?"]) {
      const json = await ask(message)
      expect(json.reply).not.toMatch(stale)
      expect(json.reply).toMatch(/Your lunch \(Cooked rice \(200 g\)\) had 5\.4 g protein and 260 kcal, from your food log\./)
    }
  })

  it("'How much protein was in it?' after the removal reply: what's left of lunch, the removal said", async () => {
    const removal = (await ask("How much protein was in the chicken?")).reply
    const json = await ask("How much protein was in it?", removal, LUNCH)
    expect(json.reply).not.toMatch(stale)
    expect(json.reply).toMatch(/Chicken Breast is no longer logged/)
    expect(json.reply).toMatch(/5\.4 g protein/)
  })

  it("chicken replaced by salmon in lunch: salmon's numbers are never the chicken's", async () => {
    log = [row("s1", "lunch", "Salmon", 150, 310, 33), RICE]
    const json = await ask("How much protein was in the chicken?")
    expect(json.reply).not.toMatch(stale)
    expect(json.reply).not.toMatch(/\b33 g|\b310\b/)
    expect(json.reply).toMatch(/no longer in today's food log/)
    expect(json.reply).toMatch(/Your lunch now has Salmon \(150 g\), Cooked rice \(200 g\)\./)
  })

  it("chicken deleted and re-added as a new row: the new row's numbers, labeled as a newer entry", async () => {
    log = [row("c2", "lunch", "Chicken Breast", 100, 165, 31), RICE]
    const json = await ask("How much protein was in the chicken?")
    expect(json.reply).not.toMatch(stale)
    expect(json.reply).toMatch(/The chicken entry from earlier in this chat \(Chicken Breast\) is no longer logged; this is a newer entry, not the same one\./)
    expect(json.reply).toMatch(/The Chicken Breast \(100 g\) in your lunch has 31 g protein and 165 kcal, from your food log\. Your lunch has Chicken Breast \(100 g\), Cooked rice \(200 g\)\./)
    expect(json.reply).not.toMatch(/5\.4 g|260 kcal/)
  })

  it("chicken still logged (edited): its current row only, never the rice", async () => {
    log = [row("c1", "lunch", "Chicken Breast", 150, 247.5, 46.1), RICE]
    const json = await ask("How much protein was in the grilled chicken?")
    expect(json.reply).toMatch(/The Chicken Breast \(150 g\) in your lunch has 46\.1 g protein and 248 kcal, from your food log\./)
    expect(json.reply).not.toMatch(/5\.4 g|260 kcal/)
    expect(json.reply).not.toMatch(stale)
  })

  it("same name, different quantities: asks which one instead of summing or picking", async () => {
    const both = [CHICKEN, row("c3", "lunch", "Chicken Breast", 200, 330, 62), RICE]
    log = both
    const sameMeal = await ask("How much protein was in the chicken?", DISCUSSED, both)
    expect(sameMeal.reply).toMatch(/more than one chicken entry: Chicken Breast \(110 g\) and Chicken Breast \(200 g\)\. Which one do you mean\?/)
    expect(sameMeal.reply).not.toMatch(/\d+(?:\.\d+)? g protein/)
    const split = [CHICKEN, row("c4", "dinner", "Chicken Breast", 200, 330, 62), RICE]
    log = split
    const twoMeals = await ask("How much protein was in the chicken?", DISCUSSED, split)
    expect(twoMeals.reply).toBe("Which meal do you mean — lunch or dinner?")
  })

  it("food-log read unavailable: no numbers at all", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValueOnce({ date: "2026-10-27", entries: [], totals: null, unavailable: true } as never)
    const json = await ask("How much protein was in the chicken?")
    expect(JSON.stringify(json)).not.toMatch(stale)
    expect(json.status).toBe(422)
    expect(json).toMatchObject({ code: "FOOD_LOG_UNAVAILABLE" })
  })

  it("a food never logged is not a log reference (the existing path answers it)", async () => {
    provider("ok", "Tofu has about 8 g of protein per 100 g.")
    const json = await ask("How much protein is in the tofu?")
    expect(json.reply).not.toMatch(/food log|no longer/)
  })
})
