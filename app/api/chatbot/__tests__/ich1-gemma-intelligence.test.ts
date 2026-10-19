/**
 * ICH-1 — the shared Performance Intelligence Core through the REAL nutrition-coach (Gemma) route.
 * Same harness as the other nutrition route tests: only the provider call and the data loaders are stubbed.
 * Proves Gemma consumes the SAME brief Dante does (one knowledge base, nutrition lens), that conversation control and
 * the shared hard-safety layer reach this surface, and that the frozen deterministic rules still hold.
 */
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

import { POST } from "@/app/api/chatbot/route"
import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
import { createClient } from "@/lib/supabase/server"

const USER = "00000000-0000-4000-8000-0000000000d1"
const state = { reply: "Complete protein already covers it, so extra BCAA adds little." }

const chat = async (message: string, extra: Record<string, unknown> = {}) =>
  (await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", ...extra }) }))).json()
const prompts = () => vi.mocked(callOpenAiWithFallback).mock.calls.map((call) => call[0] as string)
/** The prompt that produced the reply: the last one carrying the brief (planner / classifier calls do not). */
const briefPrompt = () => prompts().reverse().find((prompt) => prompt.includes("PERFORMANCE INTELLIGENCE BRIEF")) ?? ""

beforeEach(() => {
  vi.clearAllMocks()
  state.reply = "Complete protein already covers it, so extra BCAA adds little."
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.mocked(callOpenAiWithFallback).mockImplementation(async () => ({ reply: state.reply, model: "test" }) as never)
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }, from: vi.fn() } as never)
  vi.mocked(loadNutritionContext).mockResolvedValue({
    plan: {
      target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 },
      input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: ["chicken"] },
    },
    targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  } as never)
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 1680, protein: 106, carbs: 0, fat: 0 } } as never)
})

describe("Gemma consumes the shared intelligence brief", () => {
  it("a supplement question arrives with the shared evidence, read through the dietary lens", async () => {
    const json = await chat("do I need BCAA if I already eat enough protein?")
    expect(json.ok).toBe(true)
    const prompt = briefPrompt()
    expect(prompt).toContain("KNOWLEDGE_STATE: CANONICAL_KNOWLEDGE_AVAILABLE")
    expect(prompt).toMatch(/low value \/ usually unnecessary here: BCAA \(redundant_with_adequate_complete_protein\)/)
    expect(prompt).toMatch(/YOUR LENS \(Gemma\): dietary adequacy and food-first alternatives/)
    expect(prompt).toMatch(/protein adequate: yes/)
    // the frozen nutrition rules are still in the same prompt
    expect(prompt).toMatch(/Use ONLY (?:the )?numbers (?:that appear )?in CONTEXT/)
    expect(json.reply).toMatch(/adds little/)
  })

  it("a nutrition concept gets canonical claims with their strength, and Gemma is the owner (no authority note)", async () => {
    state.reply = "No — the timing matters far less than your total for the day."
    await chat("do I need protein immediately after training?")
    const prompt = briefPrompt()
    expect(prompt).toMatch(/\[UNCERTAIN · LIMITED · MIXED\] The importance, and even the existence, of a post-exercise anabolic window/)
    expect(prompt).not.toMatch(/AUTHORITY: this topic is/)
  })

  it("a figure printed in a canonical claim is grounded, so the answer is not thrown away", async () => {
    state.reply = "Aim for roughly 20-40 g of protein per meal, spread every 3-4 hours; hitting your daily total matters most."
    const json = await chat("how many meals a day should I spread my protein over?")
    expect(briefPrompt()).toMatch(/20-40 g/)
    expect(json.reply).toMatch(/20-40 g of protein per meal/)
  })

  it("a personal macro number that is in neither CONTEXT nor canonical knowledge is still rejected (frozen invariant)", async () => {
    state.reply = "You should eat exactly 213 g of protein today."
    const json = await chat("how many meals a day should I spread my protein over?")
    expect(json.reply).not.toMatch(/213/)
  })

  it("an unverified topic is presented as a knowledge gap, never as established", async () => {
    state.reply = "I don't have verified information on magnesium for training, so I won't claim a benefit."
    await chat("is a magnesium supplement worth taking?")
    const prompt = briefPrompt()
    expect(prompt).toContain("KNOWLEDGE_STATE: KNOWLEDGE_INSUFFICIENT")
    expect(prompt).toMatch(/KNOWLEDGE GAP — magnesium/)
    expect(prompt).toMatch(/SAFETY POSTURE: DOWNGRADE_CLAIM/)
  })

  it("under a no-dosing posture a dose never leaves, whatever the model wrote", async () => {
    state.reply = "Creatine is optional at your age. Take 5 g of creatine every day. Food, training and sleep come first."
    const json = await chat("I'm 15, should I take creatine?")
    expect(briefPrompt()).toMatch(/under 18/)
    expect(json.reply).not.toMatch(/5 g of creatine/)
    expect(json.reply).toMatch(/Food, training and sleep come first/)
  })
})

describe("conversation control reaches Gemma", () => {
  it("an explicit language request earlier in the conversation still decides the reply language", async () => {
    state.reply = "Whey is just a convenient protein source; food works as well."
    await chat("whey có cần không", { conversation: { recentMessages: [{ role: "user", text: "english only from now" }, { role: "coach", text: "Sure, English from here." }] } })
    expect(briefPrompt()).toMatch(/LANGUAGE: write the whole reply in English \(the user asked for it earlier and has not changed it\)/)
  })

  it("assistant-directed frustration is feedback, not a safety or distress turn", async () => {
    state.reply = "Sorry — that missed your question. Whey is optional if food covers your protein."
    const json = await chat("sao mày vô duyên thế", { conversation: { recentMessages: [{ role: "user", text: "whey có cần không" }, { role: "coach", text: "Bạn nên ăn uống lành mạnh." }] } })
    expect(json.route).not.toMatch(/^safety/)
    expect(briefPrompt()).toMatch(/FEEDBACK: the user is reacting to YOUR previous reply/)
  })
})

describe("safety and authority on the Gemma surface", () => {
  it("'I feel like hurting myself' is handled by the shared hard-safety layer (was: unhandled on this surface)", async () => {
    const json = await chat("I feel like hurting myself")
    expect(json.route).toBe("safety_self_harm")
    expect(json.reply).toMatch(/emergency number|crisis line/)
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("chest pain keeps its existing escalation", async () => {
    const json = await chat("chest pain and dizziness during training")
    expect(json.route).toMatch(/^safety/)
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("medication + supplements keeps the existing deterministic supplement boundary", async () => {
    const json = await chat("I take medication, what supplements should I use?")
    expect(json.route).toBe("safety_supplement_medical")
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("a training decision is still Dante's: deferred before any model call", async () => {
    const json = await chat("should I train to failure every set?")
    expect(json.route).toBe("defer_to_dante")
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })
})
