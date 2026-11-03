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
// `seen` = the log when the last coach turn was written (the client echoes it as conversation.loggedRows); null = an old client.
const ask = async (message: string, lastCoach?: string, seen: Entry[] | null = [RICE, CHICKEN]) => {
  const loggedRows = seen?.map((e) => ({ id: e.id, meal: e.mealType, food: e.foodName }))
  const recentMessages = [...(lastCoach ? [{ role: "user" as const, text: "What about my last meal?" }, { role: "coach" as const, text: lastCoach }] : []), { role: "user" as const, text: message }]
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", conversation: { recentMessages, ...(seen ? { loggedRows } : {}) } }) }))
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

  it("E. lunch deleted, the same food logged as a new row under dinner: a different entry, never substituted", async () => {
    setLog([RICE, row("3", "dinner", "Chicken Breast — cooked", 100, 165, 31)])
    const json = await ask("How much protein was in it?", LAST)
    expect(json.reply).toMatch(/no longer in your log/i)
    expect(json.reply).toMatch(/dinner/)
    expect(json.reply).toMatch(/can't confirm it's the same one/)
    expect(json.reply).not.toMatch(/\b62\b|\b31\b/)
  })

  it("F. several foods in one meal: the meal's current total", async () => {
    const lunch = [row("1", "lunch", "White Rice — cooked", 150, 195, 4.1), row("2", "lunch", "Chicken Breast — cooked", 200, 330, 62)]
    setLog(lunch)
    const json = await ask("How much protein was in it?", LAST, lunch)
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

/**
 * Meal identity (Codex P1): the meal slot alone is not the discussed meal. Chicken lunch discussed, deleted, Salmon logged as
 * lunch: "it" must not become the Salmon. A match must be on a food the chat named, checked against current rows.
 */
describe("meal identity: a slot match is not the discussed meal", () => {
  const SALMON = row("5", "lunch", "Salmon — cooked", 150, 310, 33)
  const changed = /changed since we discussed it/i

  it("C. same-slot replacement: Salmon's numbers are never given as the discussed lunch's (the Codex repro)", async () => {
    setLog([RICE, SALMON])
    for (const last of [LAST, IT]) {
      const json = await ask("How much protein was in it?", last)
      expect(json.route).toBe("food_log")
      expect(json.reply).not.toMatch(/\b33\b|\b310\b|\b62\b|\b330\b/)
      expect(json.reply).not.toMatch(/from your food log/)
    }
    const slot = await ask("How much protein was in it?", LAST)
    expect(slot.reply).toMatch(changed)
    expect(slot.reply).toMatch(/Salmon/)
    // "Was that meal suitable?" about the replaced lunch never reaches the composer as if it were the same meal.
    expect((await ask("Was that meal suitable for my goal?", LAST)).reply).toMatch(changed)
    expect(composed).toHaveLength(0)
  })

  it("A/I. still logged, and an explicit current-lunch question answers the current lunch", async () => {
    expect((await ask("How much protein was in it?", LAST)).reply).toMatch(/62 g protein/)
    setLog([RICE, SALMON])
    for (const message of ["How much protein is in my lunch now?", "What is in my lunch now?"]) {
      const json = await ask(message, LAST)
      expect(json.route).toBe("food_log")
      expect(json.reply).toMatch(/Salmon — cooked \(150 g\)\) had 33 g protein and 310 kcal/)
      expect(json.reply).not.toMatch(/\b62\b|chicken/i)
    }
  })

  it("B/D. deleted with lunch empty, or Salmon added under dinner: said missing, Salmon never swapped in", async () => {
    for (const log of [[RICE], [RICE, row("5", "dinner", "Salmon — cooked", 150, 310, 33)]]) {
      setLog(log)
      const json = await ask("How much protein was in it?", LAST)
      expect(json.reply).toMatch(/can't find that meal/i)
      expect(json.reply).not.toMatch(/\b33\b|\b62\b/)
    }
  })

  it("E. same row edited 200 g -> 300 g: the current row's values", async () => {
    setLog([RICE, row("2", "lunch", "Chicken Breast — cooked", 300, 495, 93)])
    const json = await ask("How much protein was in it?", LAST)
    expect(json.reply).toMatch(/Chicken Breast — cooked \(300 g\)\) had 93 g protein and 495 kcal/)
  })

  it("F/G. deleted and re-added with a new row id: not the discussed entry; a row added since is not counted in 'it'", async () => {
    setLog([RICE, row("9", "lunch", "Chicken Breast — cooked", 250, 413, 77.5)])
    const readded = await ask("How much protein was in it?", LAST)
    expect(readded.reply).toMatch(changed)
    expect(readded.reply).toMatch(/can't confirm that's the same food/)
    expect(readded.reply).not.toMatch(/\b62\b|\b77\.5\b|from your food log/)
    // The user then asks about the lunch explicitly: the current row answers.
    expect((await ask("How much protein is in my lunch now?", readded.reply, [RICE, row("9", "lunch", "Chicken Breast — cooked", 250, 413, 77.5)])).reply).toMatch(/\(250 g\)\) had 77\.5 g protein and 413 kcal/)
    setLog([RICE, CHICKEN, row("3", "lunch", "Chicken Breast — cooked", 100, 165, 31)])
    const added = await ask("How much protein was in it?", LAST)
    expect(added.reply).toMatch(/\(200 g\)\) had 62 g protein and 330 kcal/)
    expect(added.reply).toMatch(/added to your lunch since then aren't counted/)
  })

  it("H. multi-food lunch with one component deleted: the change is said, the remaining verified component answers", async () => {
    const lunch = [row("1", "lunch", "White Rice — cooked", 150, 195, 4.1), row("2", "lunch", "Chicken Breast — cooked", 200, 330, 62)]
    setLog([lunch[0]])
    const json = await ask("How much protein was in it?", "Your lunch was 150 g of cooked white rice and 200 g of cooked chicken breast: 525 kcal and 66.1 g of protein.", lunch)
    expect(json.reply).toMatch(/changed since we discussed it: Chicken Breast — cooked is no longer logged/)
    expect(json.reply).toMatch(/White Rice — cooked \(150 g\)\) had 4\.1 g protein and 195 kcal/)
    expect(json.reply).not.toMatch(/\b66\.1\b|\b62\b|\b525\b/)
  })

  it("K. a historical question about the replaced food is attributed to the earlier chat", async () => {
    setLog([RICE, SALMON])
    const json = await ask("What did that meal contain before I deleted it?", LAST)
    expect(json.reply).toMatch(/earlier in this chat/i)
    expect(json.reply).not.toMatch(/from your food log|\b33\b/)
  })

  it("L/M/N. log unavailable, planner malformed, provider down: never Salmon as the discussed meal", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValueOnce({ date: "2026-10-23", entries: [], totals: null, unavailable: true } as never)
    const unavailable = await ask("How much protein was in it?", LAST)
    expect(JSON.stringify(unavailable)).not.toMatch(/\b62\b|\b33\b/)
    setLog([RICE, SALMON])
    planner = "malformed"
    composer(STALE)
    expect((await ask("How much protein was in it?", LAST)).reply).toMatch(changed)
    vi.mocked(callOpenAiWithFallback).mockRejectedValue(new Error("provider down"))
    const down = await ask("How much protein was in it?", LAST)
    expect(down.reply).toMatch(changed)
    expect(down.reply).not.toMatch(/\b33\b|\b62\b/)
  })

  it("O/P. user B's log and a refresh never inherit the discussed lunch", async () => {
    setLog([SALMON], USER_B)
    user = USER_B
    expect((await ask("How much protein was in it?", LAST)).reply).toMatch(changed)
    expect((await ask("How much protein was in it?")).reply).not.toMatch(/\b62\b|chicken/i)
  })

  it("Q. craving and hypothetical turns are unaffected", async () => {
    setLog([RICE, SALMON])
    composer("200 g of salmon would be a solid dinner.")
    expect((await ask("If I had 200 g of salmon for dinner, would that be a good choice?", LAST)).route).not.toBe("food_log")
    expect((await ask("I'm craving chocolate cereal", LAST)).intent).toBe("NEW_CRAVING_REQUEST")
  })
})

/**
 * Row identity (Codex final P1): a shared food word ("rice", "chicken", "salmon") or an identical re-added name is not the
 * discussed entry. Only a row that was logged when the coach spoke (id + food, echoed as conversation.loggedRows) is.
 */
describe("row identity: shared words and re-added names are not the discussed entry", () => {
  const changed = /changed since we discussed it/i
  const swaps = [
    { name: "White Rice -> Brown Rice", was: row("1", "lunch", "White Rice — cooked", 200, 260, 5.4), now: row("21", "lunch", "Brown Rice — cooked", 200, 246, 5.5), last: "Your last meal was lunch, where you had 200 g of cooked white rice: 260 calories and 5.4 g of protein.", it: "Your last meal, which was 200 g of cooked white rice, provided 5.4 g of protein.", bad: /\b5\.5\b|\b246\b|\b5\.4\b|\b260\b/ },
    { name: "Chicken Breast -> Chicken Thigh", was: CHICKEN, now: row("22", "lunch", "Chicken Thigh — cooked", 200, 418, 50), last: LAST, it: IT, bad: /\b50 g\b|\b418\b|\b62\b|\b330\b/ },
    { name: "Grilled Salmon -> Raw Salmon", was: row("3", "lunch", "Salmon — grilled", 150, 310, 33), now: row("23", "lunch", "Salmon — raw", 150, 208, 30), last: "Your last meal was lunch, where you had 150 g of grilled salmon: 310 calories and 33 g of protein.", it: "Your last meal, which was 150 g of grilled salmon, provided 33 g of protein.", bad: /\b30 g\b|\b208\b|\b33\b|\b310\b/ },
    { name: "Chicken -> Salmon", was: CHICKEN, now: row("24", "lunch", "Salmon — cooked", 150, 310, 33), last: LAST, it: IT, bad: /\b33\b|\b310\b|\b62\b|\b330\b/ },
  ]

  for (const swap of swaps) {
    it(`${swap.name}: replacement macros are never attributed to the discussed food (healthy, malformed, provider down)`, async () => {
      setLog([swap.now])
      for (const mode of ["ok", "malformed", "down"] as const) {
        planner = mode === "malformed" ? "malformed" : "ok"
        composer(STALE)
        if (mode === "down") vi.mocked(callOpenAiWithFallback).mockRejectedValue(new Error("provider down"))
        for (const last of [swap.last, swap.it]) {
          const json = await ask("How much protein was in it?", last, [swap.was])
          expect(json.route).toBe("food_log")
          expect(json.reply).toMatch(changed)
          expect(json.reply).not.toMatch(swap.bad)
          expect(json.reply).not.toMatch(/from your food log/)
        }
        expect((await ask("Was that meal suitable for my goal?", swap.last, [swap.was])).reply).toMatch(changed)
      }
      expect(composed).toHaveLength(0)
      // "My lunch now" answers the current lunch from its own row.
      vi.mocked(callOpenAiWithFallback).mockReset()
      composer(STALE)
      const now = await ask("How much protein is in my lunch now?", swap.last, [swap.was])
      expect(now.reply).toContain(`${swap.now.foodName} (${swap.now.quantityGrams} g)) had ${swap.now.proteinG} g protein and ${swap.now.calories} kcal`)
    })
  }

  it("same-name delete + re-add (new id, new portion): uncertain, and a historical question never gets the new row's macros", async () => {
    setLog([RICE, row("31", "lunch", "Chicken Breast — cooked", 150, 248, 46.5)])
    const json = await ask("How much protein was in it?", IT)
    expect(json.reply).toMatch(changed)
    expect(json.reply).not.toMatch(/\b46\.5\b|\b248\b|\b62\b/)
    const past = await ask("What did that meal contain before I deleted it?", LAST)
    expect(past.reply).toMatch(/earlier in this chat/i)
    expect(past.reply).not.toMatch(/\b46\.5\b|\b248\b|from your food log/)
  })

  it("after a 'changed' reply, 'it' still means the gone entry: the snapshot is carried, the re-added row never becomes it (live chain)", async () => {
    setLog([RICE, row("31", "lunch", "Chicken Breast — cooked", 150, 248, 46.5)])
    const first = (await ask("How much protein was in it?", LAST)) as unknown as { reply: string; conversation: { loggedRows: unknown } }
    expect(first.reply).toMatch(changed)
    expect(first.conversation.loggedRows).toEqual([{ id: "1", meal: "breakfast", food: "White Rice — cooked" }, { id: "2", meal: "lunch", food: "Chicken Breast — cooked" }])
    for (const message of ["What did that meal contain before I deleted it?", "How much protein was in it?"]) {
      const next = await ask(message, first.reply)
      expect(next.reply).not.toMatch(/\b46\.5\b|\b248\b|from your food log/)
    }
  })

  it("an existing row edited in place keeps its identity and answers with its current macros", async () => {
    setLog([RICE, row("2", "lunch", "Chicken Breast — cooked", 250, 413, 77.5)])
    for (const last of [LAST, IT]) expect((await ask("How much protein was in it?", last)).reply).toMatch(/\(250 g\)\) had 77\.5 g protein and 413 kcal, from your food log\.$/)
  })

  it("an old client that echoes no snapshot gets an explicit uncertainty, never a name-matched answer", async () => {
    const json = await ask("How much protein was in it?", LAST, null)
    expect(json.reply).toMatch(/can't confirm from this chat which logged entry/)
    expect(json.reply).not.toMatch(/\b62\b/)
    expect((await ask("How much protein is in my lunch now?", LAST, null)).reply).toMatch(/62 g protein/)
  })

  it("the response carries today's rows as the next turn's snapshot (ids from the user's own log only)", async () => {
    const json = (await ask("How much protein was in it?", LAST)) as unknown as { conversation: { loggedRows: unknown } }
    expect(json.conversation.loggedRows).toEqual([{ id: "1", meal: "breakfast", food: "White Rice — cooked" }, { id: "2", meal: "lunch", food: "Chicken Breast — cooked" }])
    // User B echoing user A's snapshot: B's own rows never match A's ids.
    setLog([row("2b", "lunch", "Chicken Breast — cooked", 200, 330, 62)], USER_B)
    user = USER_B
    const other = await ask("How much protein was in it?", LAST)
    expect(other.reply).toMatch(changed)
    expect(other.reply).not.toMatch(/from your food log/)
  })

  it("food-log read unavailable: no identity, no numbers", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-23", entries: [], totals: null, unavailable: true } as never)
    const json = await ask("How much protein was in it?", LAST)
    expect(JSON.stringify(json)).not.toMatch(/\b62\b/)
  })

  it("a craving is unaffected", async () => {
    expect((await ask("I'm craving chocolate cereal", LAST)).intent).toBe("NEW_CRAVING_REQUEST")
  })
})
