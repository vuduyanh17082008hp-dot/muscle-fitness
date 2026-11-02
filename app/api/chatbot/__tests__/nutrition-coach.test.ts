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
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
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
    targets: getCanonicalNutritionTargets({ planTarget: { calories: isB ? 3000 : 2200, protein: isB ? 200 : 160, carbs: 250, fat: 70 } }),
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
  // ONE AI COACH: the Nutrition page chat is Dante. A training / recovery question asked there runs Dante's main pipeline
  // (streamed like any Dante turn) — never the nutrition engine, and never an "ask Dante" referral.
  const streamedText = async (response: Response) => parseChatStreamChunk("", `${await response.text()}\n`).events.flatMap((event) => (event.type === "delta" ? [event.text] : [])).join("")

  it("runs a training/recovery question asked on the Nutrition page through Dante's main pipeline", async () => {
    const response = await post({ message: "Change my squat program and tell me how to treat my sore knee", coachMode: "nutrition" })
    expect(response.headers.get("Content-Type")).toMatch(/ndjson/)
    expect(handleNutritionCoachChat).not.toHaveBeenCalled()
    expect(await streamedText(response)).not.toMatch(/ask Dante|one for Dante|I only work on nutrition/i)
  })

  it.each([
    ["tôi muốn đi tập nhưng buồn ngủ quá, nên đi ko bạn"],
    ["I'm really sleepy but want to train. Should I go?"],
  ])("a train/rest decision on the Nutrition page is answered by Dante's main pipeline, not referred: %s", async (message) => {
    // This harness's provider mock is shaped for the nutrition engine, so the main pipeline's own reply isn't asserted here
    // (live-verified); the routing is: the engine never runs and no referral text is produced.
    const response = await post({ message, coachMode: "nutrition" })
    expect(handleNutritionCoachChat).not.toHaveBeenCalled()
    expect(await response.text()).not.toMatch(/ask Dante|hỏi Dante|Dante's call|việc của Dante|"coachMode":"nutrition"/i)
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
    // Planner (junk) + its one reduced retry (junk) -> safe fallback; then the existing open-chat answer, also unsafe text.
    vi.mocked(callOpenAiWithFallback)
      .mockResolvedValueOnce({ reply: "You should work it off with a 60 minute run.", model: "t" })
      .mockResolvedValueOnce({ reply: "You should work it off with a 60 minute run.", model: "t" })
      .mockResolvedValueOnce({ reply: "You should work it off with a 60 minute run.", model: "t" })
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

  it("'What about my last meal?' is answered from the food log, not routed as a craving", async () => {
    const entry = (id: string, mealType: string, foodName: string, calories: number, proteinG: number) => ({ id, logDate: "2026-10-07", mealType, foodName, quantityGrams: 200, servingName: null, servingsConsumed: null, calories, proteinG, carbsG: 0, fatG: 0 })
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [entry("1", "breakfast", "Oatmeal", 300, 10), entry("2", "lunch", "Chicken Rice", 620, 38)], totals: { calories: 920, protein: 48, carbs: 0, fat: 0 } } as never)
    const json = await (await post({ message: "What about my last meal?", coachMode: "nutrition" })).json()
    expect(json.intent).not.toBe("NEW_CRAVING_REQUEST")
    expect(json.route).not.toBe("craving_ask")
    // A question about "that meal" is not a draft edit; an edit with no draft still says there is none.
    expect((await (await post({ message: "Was that meal suitable for my goal?", coachMode: "nutrition" })).json()).route).not.toBe("no_draft")
    expect((await (await post({ message: "make that meal cheaper", coachMode: "nutrition" })).json()).route).toBe("no_draft")
    // A real switch to a food stays a craving topic.
    const craving = await (await post({ message: "what about pizza?", coachMode: "nutrition" })).json()
    expect(craving.intent).toBe("NEW_CRAVING_REQUEST")
  })

  it("planner failure: 'what did I eat?' is answered from the food log, and the fallback model sees the log", async () => {
    const entry = (id: string, mealType: string, foodName: string, calories: number, proteinG: number) => ({ id, logDate: "2026-10-07", mealType, foodName, quantityGrams: 200, servingName: null, servingsConsumed: null, calories, proteinG, carbsG: 0, fatG: 0 })
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [entry("1", "breakfast", "Oatmeal", 300, 10), entry("2", "lunch", "Chicken Rice", 620, 38)], totals: { calories: 920, protein: 48, carbs: 0, fat: 0 } } as never)
    // Every provider call fails: the planner, its retry and the fallback all return nothing.
    vi.mocked(callOpenAiWithFallback).mockResolvedValue(null as never)
    const today = await (await post({ message: "What did I eat today?", coachMode: "nutrition" })).json()
    expect(today.reply).toContain("Oatmeal (200 g): 300 kcal")
    expect(today.reply).toContain("Chicken Rice (200 g): 620 kcal")
    expect((await (await post({ message: "What about my last meal?", coachMode: "nutrition" })).json()).reply).toBe("Your last logged meal today was lunch: Chicken Rice (200 g): 620 kcal, 38 g protein.")
    // The planner fails but the fallback model is up: it never answers the intake question itself...
    vi.mocked(callOpenAiWithFallback).mockReset().mockResolvedValue({ reply: "not a plan", model: "test" })
    expect((await (await post({ message: "What did I eat today?", coachMode: "nutrition" })).json()).reply).toContain("Oatmeal")
    expect(vi.mocked(callOpenAiWithFallback).mock.calls.some(([prompt]) => prompt.startsWith("Handle one ambiguous"))).toBe(false)
    // ...and a follow-up it does answer carries today's log as context.
    await post({ message: "Was that meal suitable for my goal?", coachMode: "nutrition" })
    const fallbackPrompt = vi.mocked(callOpenAiWithFallback).mock.calls.map(([prompt]) => prompt).find((prompt) => prompt.startsWith("Handle one ambiguous"))
    expect(fallbackPrompt).toContain("Chicken Rice (200 g): 620 kcal")
    // An empty log is said plainly, never filled in.
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } } as never)
    vi.mocked(callOpenAiWithFallback).mockResolvedValue(null as never)
    expect((await (await post({ message: "What did I eat today?", coachMode: "nutrition" })).json()).reply).toBe("Nothing is logged for today yet, so I can't say what you've eaten.")
  })

  it("planner failure: follow-ups about a logged meal resolve from the log, never invent a food, goal or number", async () => {
    const entry = (id: string, mealType: string, foodName: string, calories: number, proteinG: number) => ({ id, logDate: "2026-10-07", mealType, foodName, quantityGrams: 200, servingName: null, servingsConsumed: null, calories, proteinG, carbsG: 0, fatG: 0 })
    const log = (...entries: ReturnType<typeof entry>[]) => vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries, totals: { calories: entries.reduce((s, e) => s + e.calories, 0), protein: entries.reduce((s, e) => s + e.proteinG, 0), carbs: 0, fat: 0 } } as never)
    // Like the panel, each turn echoes the food-log snapshot the previous reply returned (what "it" could have meant).
    let loggedRows: unknown
    const ask = async (message: string, lastCoach?: string) => {
      const json = await (await post({ message, coachMode: "nutrition", conversation: lastCoach ? { recentMessages: [{ role: "coach", text: lastCoach }], loggedRows } : undefined })).json()
      loggedRows = json.conversation?.loggedRows
      return json
    }
    const ambiguousCalls = () => vi.mocked(callOpenAiWithFallback).mock.calls.filter(([prompt]) => prompt.startsWith("Handle one ambiguous")).length
    log(entry("1", "breakfast", "Oatmeal", 300, 10), entry("2", "lunch", "Chicken Rice", 620, 38))
    const LUNCH = "Your lunch (Chicken Rice (200 g)) had 38 g protein and 620 kcal, from your food log."

    for (const providerDown of [true, false]) {
      // Planner unavailable (null) vs. planner returns malformed output with the fallback model up.
      vi.mocked(callOpenAiWithFallback).mockReset().mockResolvedValue((providerDown ? null : { reply: "not a plan", model: "test" }) as never)
      const last = (await ask("What about my last meal?")).reply
      expect((await ask("How much protein was in it?", last)).reply).toBe(LUNCH)
      const suitable = (await ask("Was that meal suitable for my goal?", last)).reply
      expect(suitable).toBe(`${LUNCH} The goal on your profile is fat loss, but I can't give a proper judgement of how it fits right now. Try again in a moment.`)
      expect(suitable).not.toMatch(/left today/)
      expect((await ask("How much protein was in my breakfast?")).reply).toBe("Your breakfast (Oatmeal (200 g)) had 10 g protein and 300 kcal, from your food log.")
      expect(ambiguousCalls()).toBe(0)
    }

    // Ambiguous pronoun: the last coach turn named two meals.
    const today = (await ask("What did I eat today?")).reply
    expect((await ask("How much protein was in it?", today)).reply).toBe("Which meal do you mean — breakfast or lunch?")
    // A model-written intake reply rephrases portions but keeps the meal names.
    expect((await ask("How much protein was in it?", "Today, you had: - **Breakfast**: 200 g of oatmeal (300 kcal) - **Lunch**: 200 g of chicken rice (620 kcal)")).reply).toBe("Which meal do you mean — breakfast or lunch?")
    expect((await ask("How much protein was in it?", "Your last meal was lunch, which included 200 g of chicken rice.")).reply).toBe(LUNCH)
    // Deleted meal: the coach named lunch, then it was removed from the log.
    const last = (await ask("What about my last meal?")).reply
    log(entry("1", "breakfast", "Oatmeal", 300, 10))
    expect((await ask("How much protein was in it?", last)).reply).toBe("I can't find that meal in today's log anymore, so I can't give its numbers. Today's log has breakfast.")
    expect((await ask("How much protein was in it?", "Your last meal was lunch, which included 200 g of chicken rice.")).reply).toContain("I can't find that meal in today's log anymore")
    expect((await ask("what's a good snack for my dinner?")).route).not.toBe("food_log")
    expect((await ask("Was my dinner ok?")).reply).toBe("Nothing is logged under dinner today, so I can't give its numbers. Today's log has breakfast.")

    // Goal unavailable: said plainly, never filled in.
    vi.mocked(loadNutritionContext).mockImplementation((async (_s: unknown, userId: string) => { const p = plan(userId); return { ...p, fitnessGoal: null, plan: { ...p.plan, input: { ...p.plan.input, goal: null } } } }) as never)
    expect((await ask("Was my breakfast suitable for my goal?")).reply).toContain("There is no goal on your profile yet, and I can't give a proper judgement")
    mockData()
    log(entry("1", "breakfast", "Oatmeal", 300, 10))

    // "it" that never pointed at the log (a food fact) still goes to the fallback model.
    vi.mocked(callOpenAiWithFallback).mockReset().mockResolvedValue({ reply: "not a plan", model: "test" })
    await ask("How much protein is in it?", "Greek yogurt is a solid high-protein snack.")
    expect(ambiguousCalls()).toBe(1)

    // Fallback model invents an unlogged food: replaced; a logged food or a hypothetical survives.
    const fallback = (reply: string) => vi.mocked(callOpenAiWithFallback).mockReset().mockImplementation((async (prompt: string) => ({ reply: prompt.startsWith("Handle one ambiguous") ? JSON.stringify({ topic: { type: "GENERAL_NUTRITION", food: null, sensoryTargets: [] }, reply }) : "not a plan", model: "test" })) as never)
    fallback("You had oatmeal and a protein shake this morning, nice start.")
    expect((await ask("how's my day looking?")).reply).not.toMatch(/protein shake/)
    fallback("You had oatmeal this morning, nice start.")
    expect((await ask("how's my day looking?")).reply).toBe("You had oatmeal this morning, nice start.")
    fallback("If you had pizza tonight, a thin crust with chicken would fit better.")
    expect((await ask("could pizza work tonight?")).reply).toContain("pizza")

    // Food-log read unavailable: no coaching answer at all.
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: null, unavailable: true } as never)
    const unavailable = await post({ message: "How much protein was in it?", coachMode: "nutrition", conversation: { recentMessages: [{ role: "coach", text: LUNCH }] } })
    expect(unavailable.status).toBe(422)

    // Cravings stay cravings, even right after a food-log answer.
    log(entry("1", "breakfast", "Oatmeal", 300, 10))
    vi.mocked(callOpenAiWithFallback).mockReset().mockResolvedValue(null as never)
    expect((await ask("I'm craving chocolate cereal", last)).intent).toBe("NEW_CRAVING_REQUEST")
    expect((await ask("what about pizza?", last)).intent).toBe("NEW_CRAVING_REQUEST")
  })

  it("uses the LLM only for open conversation, with structured context", async () => {
    await post({ message: "is greek yogurt a good snack?", coachMode: "nutrition" })
    // N1.6.4: planner call + its one reduced retry (default mock is not a plan -> safe fallback) + the unchanged single answer call.
    expect(callOpenAiWithFallback).toHaveBeenCalledTimes(3)
    const prompt = vi.mocked(callOpenAiWithFallback).mock.calls[2][0]
    expect(prompt).toContain("Use ONLY the numbers in CONTEXT")
    expect(prompt).toContain('"remaining":{"calories":520,"protein":54}')
  })

  it("rejects malformed nutrition requests", async () => {
    const response = await post({ message: "", coachMode: "nutrition" })
    expect(response.status).toBe(400)
  })

  it("does not confirm a user calorie claim as the canonical target", async () => {
    const json = await (await post({ message: "I think my target is 1800 calories.", coachMode: "nutrition" })).json()
    expect(json.route).toBe("target_truth")
    expect(json.reply).toMatch(/2200/)
    expect(json.reply).not.toMatch(/confirmed at 1800/i)
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })
})
