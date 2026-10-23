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
 * Stale-meal factuality on the HEALTHY planner path (live P1, 2/2): lunch (200 g chicken, 62 g protein) was discussed, then
 * deleted or edited; "How much protein was in it?" must be answered from the current food log, never from the chat.
 */
const USER_A = "00000000-0000-4000-8000-00000000000a"
const USER_B = "00000000-0000-4000-8000-00000000000b"

type Entry = { id: string; mealType: string; foodName: string; quantityGrams: number; calories: number; proteinG: number }
const row = (id: string, mealType: string, foodName: string, quantityGrams: number, calories: number, proteinG: number): Entry => ({ id, mealType, foodName, quantityGrams, calories, proteinG })
const RICE = row("1", "breakfast", "White Rice — cooked", 150, 195, 4.1)
const CHICKEN = row("2", "lunch", "Chicken Breast — cooked", 200, 330, 62)
const logs: Record<string, Entry[]> = {}
const setLog = (entries: Entry[], user = USER_A) => (logs[user] = entries)

// Live composer wordings of the turn before the follow-up (healthy path, 2026-10-23).
const LAST = "Your last meal was lunch, where you had 200 g of cooked chicken breast. This meal provided 330 calories and 62 g of protein."
const IT = "Your last meal, which was 200 g of cooked chicken breast, provided 62 g of protein."
// What the composer actually said after the delete: the history's numbers, re-voiced as current.
const STALE = "Your last meal, which included 200 g of cooked chicken breast, provided 62 g of protein."

const plan = { understanding: { userGoal: "know intake", explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: true, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null }, need: { primaryNeed: "intake", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: true, needClarification: false, needActionConfirmation: false, confidence: "HIGH" }, strategy: { mode: "ANSWER", primaryObjective: "answer", supportingObjectives: [], requiresConfirmation: false }, clarification: null, foods: [] }
let composed: string[] = []
let planner: "ok" | "malformed" = "ok"
function composer(reply: string) {
  composed = []
  vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => {
    if (prompt.includes(PLANNER_MARKER)) return { reply: planner === "ok" ? JSON.stringify(plan) : "not a plan", model: "test" }
    if (prompt.includes("SYSTEM RULES:")) {
      composed.push(prompt)
      return { reply, model: "test" }
    }
    return { reply: "Sounds good.", model: "test" }
  })
}

let user = USER_A
const ask = async (message: string, lastCoach?: string) => {
  const recentMessages = [...(lastCoach ? [{ role: "user" as const, text: "What about my last meal?" }, { role: "coach" as const, text: lastCoach }] : []), { role: "user" as const, text: message }]
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", conversation: { recentMessages } }) }))
  return { status: response.status, ...(await response.json()) } as { status: number; reply: string; route: string; intent: string }
}

beforeEach(() => {
  vi.clearAllMocks()
  user = USER_A
  planner = "ok"
  for (const key of Object.keys(logs)) delete logs[key]
  vi.mocked(createClient).mockImplementation((async () => ({ auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) }, from: vi.fn(() => { throw new Error("no direct table access") }) })) as never)
  vi.mocked(loadNutritionContext).mockImplementation((async () => ({
    plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: [] } },
    targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  })) as never)
  vi.mocked(loadFoodLogForDate).mockImplementation((async (_s: unknown, userId: string) => {
    const entries = (logs[userId] ?? []).map((e) => ({ ...e, logDate: "2026-10-23", servingName: null, servingsConsumed: null, carbsG: 0, fatG: 0 }))
    return { date: "2026-10-23", entries, totals: { calories: entries.reduce((s, e) => s + e.calories, 0), protein: entries.reduce((s, e) => s + e.proteinG, 0), carbs: 0, fat: 0 } }
  }) as never)
  setLog([RICE, CHICKEN])
  composer(STALE)
})

describe("stale meal facts on the healthy planner path", () => {
  it("A. the meal still exists: its protein is answered from the log, whichever way the last turn named it", async () => {
    for (const last of [LAST, IT]) {
      const json = await ask("How much protein was in it?", last)
      expect(json.reply).toMatch(/62 g protein/)
      expect(json.reply).toMatch(/lunch/i)
      expect(json.reply).not.toMatch(/can't find|unavailable/)
    }
  })

  it("B. the meal was deleted: its old protein is never delivered as current (the live P1)", async () => {
    setLog([RICE])
    for (const last of [LAST, IT]) {
      const json = await ask("How much protein was in it?", last)
      expect(json.reply).not.toMatch(/\b62\b|\b330\b/)
      expect(json.reply).toMatch(/isn't in today's log anymore|can't find that meal/i)
      expect(json.reply).toMatch(/breakfast/)
    }
  })

  it("C. the portion was edited: the current protein is used", async () => {
    setLog([RICE, row("2", "lunch", "Chicken Breast — cooked", 300, 495, 93)])
    for (const last of [LAST, IT]) {
      const json = await ask("How much protein was in it?", last)
      expect(json.reply).toMatch(/93 g protein/)
      expect(json.reply).not.toMatch(/\b62\b/)
    }
  })

  it("D. the meal was moved to dinner: the change is said and the current meal is used", async () => {
    setLog([RICE, row("2", "dinner", "Chicken Breast — cooked", 200, 330, 62)])
    const json = await ask("How much protein was in it?", LAST)
    expect(json.reply).toMatch(/no longer logged as lunch/i)
    expect(json.reply).toMatch(/dinner/)
    expect(json.reply).toMatch(/62 g protein/)
  })

  it("E. lunch deleted but the same food remains under another meal: never silently substituted", async () => {
    setLog([RICE, row("3", "dinner", "Chicken Breast — cooked", 100, 165, 31)])
    const json = await ask("How much protein was in it?", LAST)
    expect(json.reply).toMatch(/no longer logged as lunch/i)
    expect(json.reply).toMatch(/dinner/)
    expect(json.reply).toMatch(/31 g protein/)
    expect(json.reply).not.toMatch(/\b62\b/)
  })

  it("F. several foods in one meal: the meal's current total", async () => {
    setLog([row("1", "lunch", "White Rice — cooked", 150, 195, 4.1), row("2", "lunch", "Chicken Breast — cooked", 200, 330, 62)])
    const json = await ask("How much protein was in it?", LAST)
    expect(json.reply).toMatch(/66\.1 g protein/)
    expect(json.reply).toMatch(/525 kcal/)
  })

  it("G. deleted lunch, then a new dinner: dinner is not passed off as 'it'", async () => {
    setLog([RICE, row("4", "dinner", "Salmon — cooked", 150, 310, 33)])
    const json = await ask("How much protein was in it?", LAST)
    expect(json.reply).toMatch(/can't find that meal/i)
    expect(json.reply).toMatch(/breakfast, dinner/)
    expect(json.reply).not.toMatch(/\b62\b|\b33\b/)
  })

  it("H. deleted meal, then 'What did I eat today?': a stale composed reply never reaches the user", async () => {
    setLog([RICE])
    composer("Today you had 150 g of cooked white rice (195 kcal) and 200 g of cooked chicken breast with 62 g of protein.")
    const stale = await ask("What did I eat today?", LAST)
    expect(stale.reply).not.toMatch(/\b62\b|chicken/i)
    expect(stale.reply).toMatch(/White Rice/)
    // A composed reply that matches the current log is delivered as written.
    composer("Today you had 150 g of cooked white rice, 195 kcal and 4.1 g of protein so far.")
    expect((await ask("What did I eat today?", LAST)).reply).toBe("Today you had 150 g of cooked white rice, 195 kcal and 4.1 g of protein so far.")
  })

  it("I. 'Was that meal suitable for my goal?': deleted -> said; present -> the composer judges with current numbers only", async () => {
    setLog([RICE])
    expect((await ask("Was that meal suitable for my goal?", LAST)).reply).toMatch(/can't find that meal/i)
    setLog([RICE, CHICKEN])
    composer("Yes — 62 g of protein from your lunch is a strong step for fat loss.")
    const kept = await ask("Was that meal suitable for my goal?", LAST)
    expect(kept.route).toBe("orchestrated")
    expect(kept.reply).toBe("Yes — 62 g of protein from your lunch is a strong step for fat loss.")
    expect(composed[0]).toContain("Chicken Breast — cooked (200 g): 330 kcal, 62 g protein")
    // Edited to 300 g: the composer anchoring on the chat's 62 g is rejected; the current 93 g answers.
    setLog([RICE, row("2", "lunch", "Chicken Breast — cooked", 300, 495, 93)])
    const edited = await ask("Was that meal suitable for my goal?", LAST)
    expect(edited.reply).not.toMatch(/\b62\b/)
    expect(edited.reply).toMatch(/93 g protein/)
  })

  it("J. food-log read unavailable: no coaching answer, never the chat's numbers", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-23", entries: [], totals: null, unavailable: true } as never)
    const json = await ask("How much protein was in it?", LAST)
    expect(json.status).toBe(422)
    expect(JSON.stringify(json)).not.toMatch(/\b62\b/)
  })

  it("K. verified empty log", async () => {
    setLog([])
    const json = await ask("How much protein was in it?", LAST)
    expect(json.reply).toMatch(/can't find that meal/i)
    expect(json.reply).toMatch(/Nothing is logged for today yet/)
  })

  it("L. a genuinely historical question is attributed to the earlier chat, never to today's log", async () => {
    setLog([RICE])
    const json = await ask("What did that meal contain before I deleted it?", LAST)
    expect(json.reply).toMatch(/no longer in today's food log/i)
    expect(json.reply).toMatch(/earlier in this chat/i)
    expect(json.reply).not.toMatch(/from your food log/)
  })

  it("M/N. a hypothetical meal and a craving are not food-log back-references", async () => {
    composer("200 g of salmon would be a solid dinner.")
    expect((await ask("If I had 200 g of salmon for dinner, would that be a good choice?", LAST)).route).not.toBe("food_log")
    expect((await ask("Is it ok to eat carbs at night?", LAST)).route).not.toBe("food_log")
    expect((await ask("I'm craving chocolate cereal", LAST)).intent).toBe("NEW_CRAVING_REQUEST")
  })

  it("O. planner failure still resolves from the current log", async () => {
    planner = "malformed"
    composer(STALE)
    setLog([RICE])
    expect((await ask("How much protein was in it?", LAST)).reply).toMatch(/can't find that meal/i)
    setLog([RICE, row("2", "lunch", "Chicken Breast — cooked", 300, 495, 93)])
    expect((await ask("How much protein was in it?", IT)).reply).toMatch(/93 g protein/)
  })

  it("P. user B never sees user A's meal through a shared-looking conversation", async () => {
    setLog([], USER_B)
    user = USER_B
    const json = await ask("How much protein was in it?", LAST)
    expect(json.reply).not.toMatch(/\b62\b/)
    expect(json.reply).toMatch(/Nothing is logged for today yet/)
  })

  it("R. after a refresh (no history) the stale number cannot come back", async () => {
    setLog([RICE])
    const json = await ask("How much protein was in it?")
    expect(json.reply).not.toMatch(/\b62\b/)
  })
})
