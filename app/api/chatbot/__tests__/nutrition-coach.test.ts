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
  callOpenAiWithFallback: vi.fn(async () => ({ reply: "Greek yogurt with berries is a solid high-protein snack.", model: "test" })),
}))
vi.mock("@/lib/dante-core/openai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/config")>()),
  isOpenAiConfigured: vi.fn(() => true),
}))
vi.mock("@/lib/nutrition/coach/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nutrition/coach/chat")>()
  return { ...actual, handleNutritionCoachChat: vi.fn(actual.handleNutritionCoachChat) }
})

import { POST } from "@/app/api/chatbot/route"
import { checkDanteRateLimit } from "@/lib/chatbot-rate-limit"
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol"
import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { getDanteTool, DANTE_TOOLS } from "@/lib/dante-core/tools/registry"
import { getCoachMode, handleNutritionCoachChat, NUTRITION_COACH_TOOLS } from "@/lib/nutrition/coach/chat"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { createClient } from "@/lib/supabase/server"

const USER_A = "00000000-0000-4000-8000-00000000000a"
const USER_B = "00000000-0000-4000-8000-00000000000b"

function client(userId: string | null) {
  return {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: userId ? null : { message: "none" } }) },
    from: vi.fn(() => {
      throw new Error("Nutrition Coach tests must not touch tables directly")
    }),
  }
}

function plan(userId: string) {
  const isB = userId === USER_B
  return {
    plan: {
      target: { calories: isB ? 3000 : 2200, protein: isB ? 200 : 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 },
      input: { goal: "fat_loss", allergies: isB ? ["dairy"] : [], excludedFoods: isB ? [] : ["tofu"], foodPreferences: ["chicken"] },
    },
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  }
}

function mockData(consumed = { calories: 1680, protein: 106 }) {
  vi.mocked(loadNutritionContext).mockImplementation((async (_s: unknown, userId: string) => plan(userId)) as never)
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: consumed.calories, protein: consumed.protein, carbs: 0, fat: 0 } } as never)
}

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

function danteClient() {
  const empty: Record<string, unknown> = {}
  Object.assign(empty, { eq: () => empty, in: () => empty, order: () => empty, limit: () => empty, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), select: () => empty })
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_A } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "dante_nof1_experiments" || table === "dante_tool_actions") return { select: () => empty, update: () => empty }
      if (table !== "profiles") throw new Error(`Unexpected table access before safety short-circuit: ${table}`)
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Asia/Singapore" }, error: null }) }) }) }
    }),
  }
}

const DANTE_SAFETY_PROMPT = "I slept 4 hours, recovery is 42, my shoulder feels irritated, but I want to PR bench today. My shoulder feels slightly irritated, I slept 8 hours, recovery is good, but I want to test a 1RM today."

beforeEach(() => {
  vi.clearAllMocks()
  mockData()
  vi.mocked(createClient).mockResolvedValue(client(USER_A) as never)
})

describe("coachMode routing", () => {
  it("defaults to Dante when coachMode is omitted, unknown or 'dante'", () => {
    expect(getCoachMode({ message: "hi" })).toBe("dante")
    expect(getCoachMode({ message: "hi", coachMode: "dante" })).toBe("dante")
    expect(getCoachMode({ message: "hi", coachMode: "gym-bro" })).toBe("dante")
    expect(getCoachMode(null)).toBe("dante")
    expect(getCoachMode({ coachMode: "nutrition" })).toBe("nutrition")
  })

  it("keeps the existing Dante pipeline for omitted and 'dante' coachMode (regression)", async () => {
    for (const extra of [{}, { coachMode: "dante" }]) {
      vi.mocked(createClient).mockResolvedValue(danteClient() as never)
      const response = await post({ message: DANTE_SAFETY_PROMPT, messages: [{ role: "user", content: DANTE_SAFETY_PROMPT }], ...extra })
      const { events } = parseChatStreamChunk("", await response.text())
      expect(handleNutritionCoachChat).not.toHaveBeenCalled()
      expect(events[events.length - 1]).toMatchObject({ type: "done", safetyTriggered: true })
    }
  })

  it("nutrition mode selects the nutrition context and returns a meal draft, not a Dante stream", async () => {
    const response = await post({ message: "Build my next meal", coachMode: "nutrition" })
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(handleNutritionCoachChat).toHaveBeenCalledTimes(1)
    expect(json).toMatchObject({ ok: true, coachMode: "nutrition", intent: "NEW_MEAL_REQUEST", route: "build" })
    expect(json.draft.sessionContextSnapshot).toMatchObject({ caloriesRemaining: 520, proteinRemaining: 54 })
    expect(json.draft.ingredients.length).toBeGreaterThan(0)
  })
})

describe("shared Athlete State stays canonical", () => {
  it("derives targets from the same loaders Dante and the dashboard use, with no nutrition-only store", async () => {
    await post({ message: "Build my next meal", coachMode: "nutrition" })
    expect(loadNutritionContext).toHaveBeenCalledWith(expect.anything(), USER_A)
    expect(loadFoodLogForDate).toHaveBeenCalledWith(expect.anything(), USER_A, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    const athleteState = await import("node:fs").then((fs) => fs.readFileSync("lib/athlete-state/build-athlete-state.ts", "utf8"))
    expect(athleteState).toContain("loadNutritionContext")
  })

  it("preserves performance as the saved goal in coach context", async () => {
    vi.mocked(loadNutritionContext).mockResolvedValue({
      ...plan(USER_A),
      fitnessGoal: "performance",
    } as never)

    const response = await post({ message: "Build my next meal", coachMode: "nutrition" })
    const json = await response.json()

    expect(json.draft.sessionContextSnapshot.goal).toBe("performance")
  })

  it("reads allergies/exclusions from the profile, never from the request body", async () => {
    const response = await post({ message: "Build my next meal", coachMode: "nutrition", allergies: [], excludedFoods: [] })
    const json = await response.json()
    // user A excludes tofu server-side
    expect(json.draft.ingredients.map((i: { ingredientId: string }) => i.ingredientId)).not.toContain("tofu")
  })
})

describe("auth, shared rate limit, isolation", () => {
  it("requires authentication before anything else", async () => {
    vi.mocked(createClient).mockResolvedValue(client(null) as never)
    const response = await post({ message: "Build my next meal", coachMode: "nutrition" })
    expect(response.status).toBe(401)
    expect(checkDanteRateLimit).not.toHaveBeenCalled()
    expect(handleNutritionCoachChat).not.toHaveBeenCalled()
  })

  it("uses the same application rate limiter as Dante, before any coach work", async () => {
    vi.mocked(checkDanteRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 17 })
    const response = await post({ message: "Build my next meal", coachMode: "nutrition" })
    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("17")
    expect(checkDanteRateLimit).toHaveBeenCalledWith(USER_A)
    expect(handleNutritionCoachChat).not.toHaveBeenCalled()
    expect(loadNutritionContext).not.toHaveBeenCalled()
  })

  it("fails closed when the limiter is unavailable", async () => {
    vi.mocked(checkDanteRateLimit).mockRejectedValueOnce(new Error("down"))
    const response = await post({ message: "Build my next meal", coachMode: "nutrition" })
    expect(response.status).toBe(503)
    expect(handleNutritionCoachChat).not.toHaveBeenCalled()
  })

  it("isolates users: each user's own targets and allergies are used", async () => {
    const a = await (await post({ message: "Build my next meal", coachMode: "nutrition" })).json()
    vi.mocked(createClient).mockResolvedValue(client(USER_B) as never)
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 2300, protein: 120, carbs: 0, fat: 0 } } as never)
    const b = await (await post({ message: "Build my next meal", coachMode: "nutrition" })).json()
    expect(loadNutritionContext).toHaveBeenCalledWith(expect.anything(), USER_B)
    expect(a.draft.sessionContextSnapshot.caloriesTarget).toBe(2200)
    expect(b.draft.sessionContextSnapshot.caloriesTarget).toBe(3000)
    const ids = b.draft.ingredients.map((i: { ingredientId: string }) => i.ingredientId)
    expect(ids).not.toContain("greek_yogurt")
    expect(ids).not.toContain("cottage_cheese")
  })
})

describe("scope and safety", () => {
  it("redirects training/recovery questions to Dante without loading data or calling the model", async () => {
    const response = await post({ message: "Change my squat program and tell me how to treat my sore knee", coachMode: "nutrition" })
    const json = await response.json()
    expect(json.route).toBe("redirect_training")
    expect(json.reply).toMatch(/Dante/)
    expect(loadNutritionContext).not.toHaveBeenCalled()
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("answers compensation/restriction talk with the safe message, never an exercise prescription", async () => {
    const response = await post({ message: "I ate too much, how long should I run to burn it off?", coachMode: "nutrition" })
    const json = await response.json()
    expect(json.route).toBe("safety")
    expect(json.reply).toMatch(/doesn't require compensation/)
    expect(json.reply).not.toMatch(/run for|\d+ minutes/i)
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("replaces an unsafe model reply", async () => {
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: "You should work it off with a 60 minute run.", model: "t" })
    const json = await (await post({ message: "what is a good snack idea", coachMode: "nutrition" })).json()
    expect(json.reply).toMatch(/doesn't require compensation/)
  })

  it("never exposes a workout or recovery tool to the Nutrition Coach", () => {
    const forbidden = /workout|session|schedule|recovery|checkin|adaptive|nof1|training|exercise/i
    for (const name of NUTRITION_COACH_TOOLS) {
      expect(getDanteTool(name)).toBeDefined()
      expect(name).not.toMatch(forbidden)
    }
    const writeTools = NUTRITION_COACH_TOOLS.filter((name) => getDanteTool(name)?.mode === "write")
    expect(writeTools).toEqual(["log_meal_draft"])
  })

  it("keeps log_meal_draft out of Dante's model-selectable tools", () => {
    expect(DANTE_TOOLS.map((tool) => tool.name)).not.toContain("log_meal_draft")
    expect(getDanteTool("log_meal_draft")?.requiresConfirmation).toBe(true)
  })
})

describe("conversation edits are deterministic", () => {
  it("Scenario A: 'Build dinner under 500 calories and high protein' returns a draft with gap suggestions", async () => {
    const json = await (await post({ message: "Build dinner under 500 calories and high protein.", coachMode: "nutrition" })).json()
    expect(json.intent).toBe("NEW_MEAL_REQUEST")
    expect(json.draft.nutrition.calories).toBeLessThanOrEqual(500)
    expect(json.draft.constraints).toMatchObject({ calorieCeiling: 500, calorieCeilingStrict: true })
    expect(json.draft.suggestions.length).toBeLessThanOrEqual(3)
    expect(json.draft.status).toMatch(/READY|DRAFT/)
  })

  it("Scenarios C/D: 'make this 450 calories' and 'swap chicken for fish' recalculate the active draft", async () => {
    const built = await (await post({ message: "I have chicken, rice and broccoli. Build dinner under 600 calories", coachMode: "nutrition" })).json()
    const draft = built.draft
    const scaledRes = await post({ message: "Make this 450 calories", coachMode: "nutrition", activeDraft: draft })
    const scaled = await scaledRes.json()
    expect(Math.abs(scaled.draft.nutrition.calories - 450)).toBeLessThanOrEqual(25)
    const swapped = await (await post({ message: "Swap chicken for fish", coachMode: "nutrition", activeDraft: scaled.draft })).json()
    const names = (swapped.proposal ?? swapped.draft).ingredients.map((i: { ingredientId: string }) => i.ingredientId)
    expect(names).toContain("white_fish")
    expect(names).not.toContain("chicken_breast")
  })

  it("Scenario B: 'I'm craving chocolate cereal' is a conversation first — no automatic draft", async () => {
    const json = await (await post({ message: "I'm craving chocolate cereal", coachMode: "nutrition" })).json()
    expect(json.intent).toBe("NEW_CRAVING_REQUEST")
    expect(json.action.type).toBe("ASK_BEFORE_BUILD")
    expect(json.mealDraft).toBeNull()
    expect(json.draft).toBeNull()
  })

  it("uses the LLM only for open conversation, with structured context", async () => {
    await post({ message: "is greek yogurt a good snack?", coachMode: "nutrition" })
    expect(callOpenAiWithFallback).toHaveBeenCalledTimes(1)
    const prompt = vi.mocked(callOpenAiWithFallback).mock.calls[0][0]
    expect(prompt).toContain("Use ONLY the numbers in CONTEXT")
    expect(prompt).toContain('"remaining":{"calories":520,"protein":54}')
  })

  it("rejects malformed nutrition requests", async () => {
    const response = await post({ message: "", coachMode: "nutrition" })
    expect(response.status).toBe(400)
  })
})
