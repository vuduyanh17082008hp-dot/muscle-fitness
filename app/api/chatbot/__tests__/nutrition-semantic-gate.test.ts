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
import { createClient } from "@/lib/supabase/server"

const USER = "00000000-0000-4000-8000-00000000000b"
const HEADER = "NUTRITION KNOWLEDGE — CURATED STRATEGY GUIDANCE"
const GATE_MARK = "Classify ONE message sent to a nutrition coach"

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let gateReply: string | Error | null = '{"needsKnowledge":true,"category":"flavor_texture","sensory":["crunchy"],"cuisine":[],"food":[]}'

const prompts = () => vi.mocked(callOpenAiWithFallback).mock.calls.map((c) => c[0] as string)
const gateCalls = () => prompts().filter((p) => p.includes(GATE_MARK))
const otherCalls = () => prompts().filter((p) => !p.includes(GATE_MARK))

function session() {
  let active: Json | null = null
  let conversation: Json | undefined
  const recent: Array<{ role: "user" | "coach"; text: string }> = []
  return {
    async say(message: string): Promise<Json> {
      recent.push({ role: "user", text: message })
      const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", activeDraft: active, conversation: { ...(conversation ?? {}), recentMessages: recent.slice(-6) } }) }))
      expect(response.status).toBe(200)
      const json = (await response.json()) as Json
      recent.push({ role: "coach", text: json.reply })
      conversation = json.conversation
      if (json.mealDraft) active = json.mealDraft
      return json
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  gateReply = '{"needsKnowledge":true,"category":"flavor_texture","sensory":["crunchy"],"cuisine":[],"food":[]}'
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.mocked(callOpenAiWithFallback).mockImplementation((async (prompt: string) => {
    if (prompt.includes(GATE_MARK)) {
      if (gateReply instanceof Error) throw gateReply
      return gateReply === null ? null : { reply: gateReply, model: "test" }
    }
    return { reply: "Try a little contrast: something crisp on top keeps it interesting.", model: "test" }
  }) as never)
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }, from: vi.fn() } as never)
  vi.mocked(loadNutritionContext).mockResolvedValue({
    plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: [] } },
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  } as never)
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 1680, protein: 106, carbs: 0, fat: 0 } } as never)
})

describe("semantic knowledge gate: model-call policy", () => {
  it("an obvious deterministic YES costs no gate call (one answer call, with knowledge)", async () => {
    await session().say("I'm craving Coco Pops.")
    expect(gateCalls()).toHaveLength(0)
    expect(otherCalls()).toHaveLength(1)
    expect(otherCalls()[0]).toContain(HEADER)
  })

  it("an obvious deterministic NO costs no gate call", async () => {
    await session().say("How many calories do I have left?")
    expect(gateCalls()).toHaveLength(0)
  })

  it("an uncertain message makes exactly ONE gate call; a semantic YES retrieves the right section", async () => {
    await session().say("Can we give this more bite?")
    expect(gateCalls()).toHaveLength(1)
    expect(otherCalls()).toHaveLength(1)
    expect(otherCalls()[0]).toContain(HEADER)
    expect(otherCalls()[0]).toMatch(/Crunch/i)
  })

  it("a semantic NO answers without knowledge", async () => {
    gateReply = '{"needsKnowledge":false,"category":"none","sensory":[],"cuisine":[],"food":[]}'
    await session().say("Can we give this more bite?")
    expect(gateCalls()).toHaveLength(1)
    expect(otherCalls()[0]).not.toContain(HEADER)
  })

  it("malformed, unsupported-category, null and throwing gate output never fail the turn and add no knowledge", async () => {
    for (const bad of ["flat is a vibe", '{"needsKnowledge":true,"category":"supplements"}', '{"needsKnowledge":true,"category":"none"}', null, new Error("provider down")]) {
      vi.mocked(callOpenAiWithFallback).mockClear()
      gateReply = bad
      const json = await session().say("Can we give this more bite?")
      expect(json.ok).toBe(true)
      expect(json.reply).toBeTruthy()
      expect(otherCalls()[0]).not.toContain(HEADER)
    }
  })

  it("the gate call is not repeated within a turn (still one gate call, even with a long history)", async () => {
    const s = session()
    await s.say("hello there")
    vi.mocked(callOpenAiWithFallback).mockClear()
    await s.say("It feels kinda one-note, lacks depth.")
    expect(gateCalls()).toHaveLength(1)
  })
})

describe("deterministic paths stay zero-model (N1.5 / N1.5.6 regression)", () => {
  const TUNA = "I have tuna, wraps and cucumber. Build dinner under 600 calories"

  it("'detailed ingredients' after a meal suggestion: no gate call, no answer call, no retrieval", async () => {
    const s = session()
    await s.say(TUNA)
    vi.mocked(callOpenAiWithFallback).mockClear()
    const json = await s.say("detailed ingredients")
    expect(json.route).toBe("followup_ingredients")
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("an explicit draft edit keeps the deterministic fast path (no gate call)", async () => {
    const s = session()
    await s.say(TUNA)
    vi.mocked(callOpenAiWithFallback).mockClear()
    const json = await s.say("Remove the cucumber.")
    expect(json.intent).toBe("EDIT_ACTIVE_DRAFT")
    expect(gateCalls()).toHaveLength(0)
  })
})
