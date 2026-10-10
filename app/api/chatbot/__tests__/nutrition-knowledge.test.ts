import { beforeEach, describe, expect, it, vi } from "vitest"

const loader = vi.hoisted(() => ({ fail: false }))

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
  callOpenAiWithFallback: vi.fn(async () => ({ reply: "Keeping a measured portion of the real thing works well.", model: "test" })),
}))
vi.mock("@/lib/dante-core/openai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/config")>()),
  isOpenAiConfigured: vi.fn(() => true),
}))
vi.mock("@/lib/nutrition/knowledge/load", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nutrition/knowledge/load")>()
  return {
    ...actual,
    loadKnowledgeChunks: (...args: Parameters<typeof actual.loadKnowledgeChunks>) => {
      if (loader.fail) throw new Error("corpus unavailable")
      return actual.loadKnowledgeChunks(...args)
    },
  }
})

import { POST } from "@/app/api/chatbot/route"
import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { createClient } from "@/lib/supabase/server"

const USER = "00000000-0000-4000-8000-00000000000a"
const HEADER = "NUTRITION KNOWLEDGE — CURATED STRATEGY GUIDANCE"

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const chat = async (message: string, extra: Record<string, unknown> = {}) => (await post({ message, coachMode: "nutrition", ...extra })).json()
const lastPrompt = () => vi.mocked(callOpenAiWithFallback).mock.calls.at(-1)![0] as string

beforeEach(() => {
  vi.clearAllMocks()
  loader.fail = false
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }, from: vi.fn() } as never)
  vi.mocked(loadNutritionContext).mockResolvedValue({
    plan: {
      target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 },
      input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: ["chicken"] },
    },
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  } as never)
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 1680, protein: 106, carbs: 0, fat: 0 } } as never)
})

describe("graceful failure (runs first: the index cache is still cold)", () => {
  it("a corpus load failure never fails the chat turn — the model is called without knowledge", async () => {
    loader.fail = true
    const response = await post({ message: "I'm craving Coco Pops.", coachMode: "nutrition" })
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toMatchObject({ ok: true, intent: "NEW_CRAVING_REQUEST", route: "craving_ask" })
    expect(callOpenAiWithFallback).toHaveBeenCalledTimes(1)
    expect(lastPrompt()).not.toContain(HEADER)
    expect(json.reply).toContain("measured portion")
  })
})

describe("runtime knowledge integration", () => {
  it("a craving gets curated strategy knowledge under the N1.5 craving prompt", async () => {
    const json = await chat("I'm craving Coco Pops.")
    expect(json).toMatchObject({ intent: "NEW_CRAVING_REQUEST", route: "craving_ask" })
    const prompt = lastPrompt()
    expect(prompt).toContain(HEADER)
    expect(prompt).toContain("[MF Curated | Primary]")
    expect(prompt).toContain("USAGE RULES")
    expect(prompt).toContain("Use ONLY the numbers in CONTEXT")
    expect(prompt).not.toMatch(/Document: |Path: /)
  })

  it("an ambiguous open question can retrieve (cuisine) through the model fallback path", async () => {
    await chat("I want something Vietnamese tonight.")
    expect(lastPrompt()).toContain("Vietnamese")
    expect(lastPrompt()).toContain(HEADER)
  })

  it("does not retrieve for preference updates, macro lookups, logs or remaining-macro questions", async () => {
    for (const message of ["I hate Greek yogurt.", "How much protein is in 150g chicken?", "Log this meal.", "How many calories do I have left?"]) {
      vi.mocked(callOpenAiWithFallback).mockClear()
      await chat(message)
      for (const call of vi.mocked(callOpenAiWithFallback).mock.calls) expect(call[0]).not.toContain(HEADER)
    }
  })

  it("a stale Active Meal Draft does not change whether a NEW topic retrieves — Vietnamese, not cereal", async () => {
    const built = await chat("I have chicken, rice and broccoli. Build dinner under 600 calories")
    const json = await chat("I want Vietnamese food tonight.", { activeDraft: built.draft })
    expect(json.intent).not.toBe("EDIT_ACTIVE_DRAFT")
    expect(json.draftTarget.mode).not.toBe("ACTIVE")
    const prompt = lastPrompt()
    expect(prompt).toContain(HEADER)
    expect(prompt).toContain("Vietnamese")
    expect(prompt).not.toMatch(/Cereal (Cravings|Makeovers)/)
  })

  it("macro truth boundary: a model reply with ungrounded numbers is discarded even when knowledge is present", async () => {
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: "Honestly a bowl like that is about 450 kcal and 12g protein.", model: "t" })
    const json = await chat("I'm craving Coco Pops.")
    expect(json.reply).not.toMatch(/450 kcal/)
  })

  it("never logs the raw prompt in the retrieval trace", async () => {
    await chat("I'm craving Coco Pops.")
    const logged = vi.mocked(console.info).mock.calls.map((c) => c.join(" ")).join("\n")
    expect(logged).toContain("[nutrition-knowledge]")
    expect(logged).not.toContain("craving Coco Pops")
  })
})

const VIETNAMESE = "Vietnamese Flavor Architecture"
const contextOf = (prompt: string) => JSON.parse(prompt.match(/^CONTEXT: (.*)$/m)![1])
const withProfile = (input: { allergies?: string[]; excludedFoods?: string[] }) =>
  vi.mocked(loadNutritionContext).mockResolvedValue({
    plan: {
      target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 },
      input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: [], ...input },
    },
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  } as never)

describe("explicit meal builds get the same cuisine knowledge as open conversation", () => {
  it.each([
    ["A", "I want a Vietnamese high-protein dinner."],
    ["B", "Can you help me decide on a Vietnamese high-protein dinner?"],
    ["D", "I want a Vietnamese meal with lots of protein."],
  ])("%s: the engine builds the draft, Vietnamese knowledge shapes the reply", async (_name, message) => {
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: "Serve it with lime, herbs and chilli for a Vietnamese feel; that seasoning isn't counted in the draft.", model: "t" })
    const json = await chat(message)
    expect(json).toMatchObject({ intent: "NEW_MEAL_REQUEST", route: "build", action: { type: "CREATE_MEAL_DRAFT" } })
    expect(json.draft.ingredients.length).toBeGreaterThan(0)
    const prompt = lastPrompt()
    expect(prompt).toContain(HEADER)
    expect(prompt).toContain(VIETNAMESE)
    expect(prompt).toContain("The deterministic meal engine just built activeMealDraft")
    expect(contextOf(prompt).activeMealDraft.nutrition).toEqual(json.draft.nutrition)
    expect(json.reply).toContain("lime, herbs and chilli")
  })

  it("C: the open phrasing reaches the same Vietnamese knowledge through conversation", async () => {
    await chat("Give me something Vietnamese tonight.")
    expect(lastPrompt()).toContain(VIETNAMESE)
  })

  it("macro truth: an invented number in the build reply falls back to the engine's own reply", async () => {
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: "This pho-style bowl is 612 kcal with 71g protein.", model: "t" })
    const json = await chat("I want a Vietnamese high-protein dinner.")
    expect(json.reply).not.toMatch(/612 kcal|71g/)
    expect(json.reply).toContain(`${Math.round(json.draft.nutrition.calories)} kcal`)
  })

  it("a plain build never calls the model or retrieves", async () => {
    await chat("Build dinner under 500 calories and high protein.")
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("with no model configured the build reply is the unchanged engine reply", async () => {
    const { isOpenAiConfigured } = await import("@/lib/dante-core/openai/config")
    vi.mocked(isOpenAiConfigured).mockReturnValueOnce(false)
    const json = await chat("I want a Vietnamese high-protein dinner.")
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
    expect(json.reply).toContain(`${Math.round(json.draft.nutrition.calories)} kcal`)
  })
})

describe("allergy ≠ exclusion ≠ dislike", () => {
  it("allergy: strategy knowledge is kept, the allergy is a hard constraint in the prompt and in the engine", async () => {
    withProfile({ allergies: ["dairy"] })
    await chat("I'm craving Coco Pops.")
    const prompt = lastPrompt()
    expect(prompt).toContain("Cereal Cravings")
    expect(prompt).toContain("adapt it with a safe alternative or skip it")
    expect(contextOf(prompt)).toMatchObject({ allergies: ["dairy"] })
    const built = await chat("Build my next meal")
    for (const i of built.draft.ingredients) expect(["greek_yogurt", "cottage_cheese", "whey_protein", "casein", "skim_milk"]).not.toContain(i.ingredientId)
  })

  it("exclusion: a hard user constraint, separate from allergies; knowledge is kept", async () => {
    withProfile({ excludedFoods: ["greek yogurt"] })
    await chat("I'm craving ice cream.")
    const prompt = lastPrompt()
    expect(prompt).toContain("Ice Cream Cravings")
    expect(contextOf(prompt)).toMatchObject({ allergies: [], excludedFoods: ["greek yogurt"] })
  })

  it("dislike: a session preference only — not an allergy or exclusion, and it does not erase knowledge", async () => {
    withProfile({})
    const signals = [{ kind: "DISLIKE", value: "greek yogurt", strength: "EXPLICIT", scope: "SESSION" }]
    await chat("I'm craving ice cream.", { conversation: { signals } })
    const prompt = lastPrompt()
    expect(prompt).toContain("Ice Cream Cravings")
    expect(contextOf(prompt)).toMatchObject({ allergies: [], excludedFoods: [], sessionPreferences: [{ kind: "DISLIKE", value: "greek yogurt" }] })
  })
})
