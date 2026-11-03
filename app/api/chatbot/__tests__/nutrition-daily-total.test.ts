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
import { loadCoachContext } from "@/lib/nutrition/coach/context"
import { PLANNER_MARKER } from "@/lib/nutrition/coach/orchestration"
import { isLoggedIntakeQuestion } from "@/lib/nutrition/coach/orchestration/needs"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
import { createClient } from "@/lib/supabase/server"

/**
 * "Total calories today?" (live 2026-10-24, 6/20 wrong at 41fec1e): the planner asked "What foods have you logged today?" or
 * answered with no tools, so the food log was never read. Today's consumed totals belong to the confirmed food log; the model
 * may voice them, never replace, omit or swap them.
 */
const USER_A = "00000000-0000-4000-8000-00000000000a"
const USER_B = "00000000-0000-4000-8000-00000000000b"

type Entry = { id: string; mealType: string; foodName: string; quantityGrams: number; calories: number; proteinG: number }
const row = (id: string, mealType: string, foodName: string, quantityGrams: number, calories: number, proteinG: number): Entry => ({ id, mealType, foodName, quantityGrams, calories, proteinG })
const OATS = row("1", "breakfast", "Oats", 80, 311, 13.5)
const CHICKEN = row("2", "lunch", "Chicken Breast — cooked", 150, 248, 46.5)
const RICE = row("3", "lunch", "White Rice — cooked", 200, 260, 5.4)
// A Photo-to-Today save, already confirmed by the user (the only way a photo estimate becomes a row).
const PHOTO = row("4", "dinner", "Phở bò", 550, 523, 33.6)
const logs: Record<string, Entry[] | "unavailable"> = {}
const sum = (entries: Entry[], key: "calories" | "proteinG") => Math.round(entries.reduce((s, e) => s + e[key], 0) * 10) / 10

const ASK_BACK = { understanding: { userGoal: "know intake", explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: ["foods"], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null }, need: { primaryNeed: "intake", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: true, needActionConfirmation: false, confidence: "LOW" }, strategy: { mode: "ASK_ONE_QUESTION", primaryObjective: "ask", supportingObjectives: [], requiresConfirmation: false }, clarification: { question: "What foods have you logged today?", affects: "calculation" }, foods: [] }
const NO_TOOLS = { ...ASK_BACK, need: { ...ASK_BACK.need, needClarification: false }, strategy: { ...ASK_BACK.strategy, mode: "ANSWER" }, clarification: null }

let planned: object = ASK_BACK
let reply = ""
let composerPrompts: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(logs)) delete logs[key]
  logs[USER_A] = [OATS, CHICKEN, RICE]
  planned = ASK_BACK
  composerPrompts = []
  vi.mocked(loadNutritionContext).mockImplementation((async () => ({
    plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: [] } },
    targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  })) as never)
  vi.mocked(loadFoodLogForDate).mockImplementation((async (_s: unknown, userId: string, date: string) => {
    const log = logs[userId] ?? []
    if (log === "unavailable") return { unavailable: true, date, entries: [], totals: null }
    const entries = log.map((e) => ({ ...e, logDate: date, servingName: null, servingsConsumed: null, carbsG: 0, fatG: 0 }))
    return { date, entries, totals: { calories: sum(log, "calories"), protein: sum(log, "proteinG"), carbs: 0, fat: 0 } }
  }) as never)
  vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => {
    if (prompt.includes(PLANNER_MARKER)) return { reply: JSON.stringify(planned), model: "test" }
    if (prompt.includes("SYSTEM RULES:")) {
      composerPrompts.push(prompt)
      return { reply, model: "test" }
    }
    return { reply: "Sounds good.", model: "test" }
  })
})

const ask = async (message: string, user = USER_A) => {
  vi.mocked(createClient).mockImplementation((async () => ({ auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) }, from: vi.fn(() => { throw new Error("no direct table access") }) })) as never)
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", conversation: { recentMessages: [{ role: "user", text: message }] } }) }))
  const json = await response.json()
  return { status: response.status, ...json, reply: json.reply ?? json.message ?? json.error } as { status: number; reply: string }
}

describe("daily totals come from the food log", () => {
  it.each(["total calories today?", "what's my calorie total so far today", "How many calories have I eaten today in total?", "tổng calo hôm nay"])("'%s' is a logged-intake question", (message) => expect(isLoggedIntakeQuestion(message)).toBe(true))
  it.each(["how many total calories should I eat today?", "total calories left today?", "what's my total calorie target today?"])("'%s' is a target/remaining question, not intake", (message) => expect(isLoggedIntakeQuestion(message)).toBe(false))

  it("the planner asking 'what foods have you logged?' or reading nothing is overridden: the log is read and the total stated", async () => {
    reply = "You've consumed a total of 819 calories today."
    for (const plan of [ASK_BACK, NO_TOOLS]) {
      planned = plan
      for (const message of ["total calories today?", "what's my calorie total so far today"]) {
        const json = await ask(message)
        expect(json.reply).not.toMatch(/What foods have you logged/)
        expect(json.reply).toMatch(/\b819\b/)
      }
    }
    expect(composerPrompts.at(-1)).toMatch(/"consumed":\{"calories":819,"protein":65\.4\}/)
  })

  it("a composer that refuses or omits the total is replaced by the food log's own total", async () => {
    for (const refusal of ["I'm unable to track your total calorie intake without specific data. If you have details about the foods you've consumed, please share!", "The exact calculation for total calories today is not available right now."]) {
      reply = refusal
      const json = await ask("How many calories have I eaten today in total?")
      expect(json.reply).toMatch(/That's 819 kcal and 65\.4 g protein in total\./)
      expect(json.reply).toMatch(/Oats \(80 g\)/)
    }
  })

  it("a remaining or target figure presented as eaten is rejected (consumed vs remaining)", async () => {
    for (const wrong of ["You've consumed a total of 1,381 calories today.", "You've eaten 2,200 calories so far today."]) {
      reply = wrong
      const json = await ask("How many calories have I eaten today in total?")
      expect(json.reply).not.toMatch(/1,?381|2,?200/)
      expect(json.reply).toMatch(/819 kcal/)
    }
    reply = "You've had 65.4 g of protein today, so 95 g of protein is still remaining."
    expect((await ask("how much protein have I had today?")).reply).toBe(reply)
    reply = "You've had 95 g of protein today."
    expect((await ask("how much protein have I had today?")).reply).toMatch(/65\.4 g protein in total/)
  })

  it("a correct composer reply passes unchanged, with the remaining figure kept separate", async () => {
    reply = "You've consumed 819 calories today, leaving 1,381 calories of your 2,200 target."
    expect((await ask("How many calories have I eaten today in total?")).reply).toBe(reply)
  })

  it("edits, deletes and a confirmed photo save change the total; a second user sees only their own log", async () => {
    reply = "I'm unable to see that."
    logs[USER_A] = [OATS, row("2", "lunch", "Chicken Breast — cooked", 200, 330, 62), RICE, PHOTO]
    expect((await ask("total calories today?")).reply).toMatch(/That's 1424 kcal and 114\.5 g protein in total\./)
    logs[USER_A] = [OATS, RICE]
    const afterDelete = await ask("total calories today?")
    expect(afterDelete.reply).toMatch(/That's 571 kcal and 18\.9 g protein in total\./)
    expect(afterDelete.reply).not.toMatch(/Chicken/)
    logs[USER_B] = [row("9", "lunch", "Salmon — cooked", 100, 206, 22.1)]
    const other = await ask("total calories today?", USER_B)
    expect(other.reply).toMatch(/That's 206 kcal/)
    expect(other.reply).not.toMatch(/Oats|571/)
  })

  it("an empty log is said plainly", async () => {
    logs[USER_A] = []
    reply = "You've consumed 0 calories."
    const json = await ask("total calories today?")
    expect(json.reply).toMatch(/0 calories|Nothing is logged/)
    expect(json.reply).not.toMatch(/\b819\b/)
  })

  it("an unavailable food log never falls back to a stale total", async () => {
    await ask("total calories today?")
    logs[USER_A] = "unavailable"
    reply = "You've consumed a total of 819 calories today."
    const json = await ask("total calories today?")
    expect(json.status).toBe(422)
    expect(json.reply).not.toMatch(/\b819\b/)
    expect(json.reply).toMatch(/unavailable|can't/i)
  })
})

describe("the athlete's day", () => {
  it("00:30 in Singapore reads the Singapore date's log, not the server's UTC date", async () => {
    vi.mocked(loadFoodLogForDate).mockClear()
    const supabase = (await vi.mocked(createClient)()) as never
    await loadCoachContext(supabase, USER_A, new Date("2026-10-23T16:30:00.000Z"))
    expect(vi.mocked(loadFoodLogForDate).mock.calls[0][2]).toBe("2026-10-24")
    await loadCoachContext(supabase, USER_A, new Date("2026-10-23T15:59:00.000Z"))
    expect(vi.mocked(loadFoodLogForDate).mock.calls[1][2]).toBe("2026-10-23")
  })
})
