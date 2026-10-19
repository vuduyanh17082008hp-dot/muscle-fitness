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
import { isOpenAiConfigured } from "@/lib/dante-core/openai/config"
import { PLANNER_MARKER } from "@/lib/nutrition/coach/orchestration"
import { getOptionalNutritionKnowledgeContext } from "@/lib/nutrition/knowledge/retrieve"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
import { createClient } from "@/lib/supabase/server"

const USER = "00000000-0000-4000-8000-00000000000a"
const OFFER = "Wanting donuts is completely fair. Want me to fit the donuts into what you have left today?"
const OPTIONS = "Three ideas:\nOption A: Greek yogurt bowl with berries\nOption B: Protein baked donut\nOption C: Cottage cheese toast"

type Plan = Record<string, unknown>
const basePlan = (): Plan => ({
  understanding: { userGoal: "stay on track", explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
  need: { primaryNeed: "general", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
  strategy: { mode: "ANSWER", primaryObjective: "answer", supportingObjectives: [], requiresConfirmation: false },
  clarification: null,
  foods: [],
})
const withPlan = (patch: (p: Plan & { understanding: Record<string, unknown>; need: Record<string, unknown>; strategy: Record<string, unknown> }) => void): Plan => {
  const p = basePlan() as Plan & { understanding: Record<string, unknown>; need: Record<string, unknown>; strategy: Record<string, unknown> }
  patch(p)
  return p
}

let prompts: { planner: string[]; response: string[]; other: string[] }

/** Scripts the model by prompt role: planner JSON, orchestrated response text, and everything else (existing paths). */
function script(options: { planner?: Plan | string | (() => never); response?: string; other?: string }) {
  prompts = { planner: [], response: [], other: [] }
  vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => {
    if (prompt.includes(PLANNER_MARKER)) {
      prompts.planner.push(prompt)
      if (typeof options.planner === "function") options.planner()
      return { reply: typeof options.planner === "string" ? options.planner : JSON.stringify(options.planner ?? basePlan()), model: "test" }
    }
    if (prompt.includes("SYSTEM RULES:")) {
      prompts.response.push(prompt)
      return { reply: options.response ?? "Sounds good.", model: "test" }
    }
    prompts.other.push(prompt)
    return { reply: options.other ?? OFFER, model: "test" }
  })
}

const post = (body: unknown) => POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const turn = async (message: string, recentMessages: Array<{ role: "user" | "coach"; text: string }>, extra: Record<string, unknown> = {}) => {
  const response = await post({ message, coachMode: "nutrition", conversation: { recentMessages: [...recentMessages, { role: "user", text: message }].slice(-6), ...extra } })
  return { status: response.status, json: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isOpenAiConfigured).mockReturnValue(true)
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }, from: vi.fn(() => { throw new Error("no direct table access") }) } as never)
  vi.mocked(loadNutritionContext).mockImplementation((async () => ({
    plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: ["peanut"], excludedFoods: ["tofu"], foodPreferences: ["chicken"] } },
    targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  })) as never)
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 1680, protein: 106, carbs: 0, fat: 0 } } as never)
  script({})
})

describe("29. donut 'yes' regression", () => {
  it("turn 1 is a craving; turn 2 'yes' resolves to the offer and uses Athlete State, not generic donut advice", async () => {
    script({ other: OFFER })
    const first = await turn("I'm really craving some donuts, but I still want to stay in shape.", [])
    expect(first.json.route).toBe("craving_ask")
    vi.mocked(getOptionalNutritionKnowledgeContext).mockClear()

    script({
      planner: withPlan((p) => {
        p.understanding.referencedPriorOffer = true
        p.understanding.continuationOfPreviousTurn = true
        p.understanding.userGoal = "fit donuts into remaining macros"
        p.need.needExactCalculation = true
        p.need.needAthleteState = true
        p.foods = [{ text: "donuts", grams: null }]
        p.strategy.mode = "PROPOSE"
        p.strategy.primaryObjective = "fit donuts into remaining macros"
      }),
      response: "You've got 520 kcal and 54g protein left, so one donut fits easily. Pair it with a protein shake. Nothing is logged until you confirm.",
    })
    const second = await turn("yes", [
      { role: "user", text: "I'm really craving some donuts, but I still want to stay in shape." },
      { role: "coach", text: first.json.reply },
    ], first.json.conversation)

    expect(second.status).toBe(200)
    expect(second.json.route).toBe("orchestrated")
    // The planner saw the prior offer and the food it names.
    expect(prompts.planner[0]).toContain("fit the donuts")
    expect(prompts.planner[0]).toContain("donuts")
    // Exact numbers came from deterministic state; donuts have no verified data so none were invented.
    expect(prompts.response[0]).toContain("520")
    expect(prompts.response[0]).toContain("54")
    expect(prompts.response[0]).toMatch(/"matched":null/)
    expect(second.json.orchestration).toMatchObject({ conversationContinuation: true, referencedPriorOffer: true, responseMode: "CONTINUE", continuationTarget: "PRIOR_OFFER", responseDepth: "SHORT", athleteStateUsed: true, retrievalUsed: false, plannerCalls: 1, source: "model" })
    expect(second.json.orchestration.toolNeeds).toEqual(expect.arrayContaining(["athlete_state", "macro_calculator"]))
    expect(getOptionalNutritionKnowledgeContext).not.toHaveBeenCalled()
    // Exactly one planner + one response call on this turn.
    expect(prompts.planner).toHaveLength(1)
    expect(prompts.response).toHaveLength(1)
    // No mutation: nothing drafted, nothing logged.
    expect(second.json).toMatchObject({ action: { type: "NONE" }, mealDraft: null })
    // The craving thread continues: topic stays CRAVING.
    expect(second.json.conversation.currentTopic).toMatchObject({ type: "CRAVING" })
  })

  it("an ungrounded number in the model reply is rejected and the turn still succeeds", async () => {
    script({ planner: withPlan((p) => { p.need.needAthleteState = true; p.need.needExactCalculation = true }), response: "A donut is about 333 kcal.", other: "Tell me more." })
    const result = await turn("yes", [{ role: "coach", text: OFFER }])
    expect(result.status).toBe(200)
    expect(result.json.route).not.toBe("orchestrated")
    expect(result.json.orchestration).toMatchObject({ source: "fallback", fallbackReason: "model_failed" })
  })
})

describe("30. protein donut request", () => {
  it("does not force retrieval when the plan says none is needed", async () => {
    script({ planner: withPlan((p) => { p.understanding.userGoal = "recipe modification: protein donuts"; p.strategy.primaryObjective = "explain a practical protein donut approach" }), response: "Use Greek yogurt and whey for structure, bake instead of fry." })
    const result = await turn("How can I make protein donuts?", [])
    expect(result.status).toBe(200)
    expect(getOptionalNutritionKnowledgeContext).not.toHaveBeenCalled()
    expect(result.json.reply).toBeTruthy()
  })
})

describe("37. retrieval only when the plan asks for it", () => {
  const message = "Any tips to make chicken rice lower in calories without losing the flavour?"

  it("a plan that needs knowledge reaches the existing retrieval gate; one that does not never does", async () => {
    script({ planner: withPlan((p) => { p.need.needKnowledgeRetrieval = true }), response: "Skim the chicken skin and lean on ginger and chilli for flavour." })
    const asked = await turn(message, [])
    expect(asked.json.route).toBe("orchestrated")
    expect(getOptionalNutritionKnowledgeContext).toHaveBeenCalledTimes(1)

    vi.mocked(getOptionalNutritionKnowledgeContext).mockClear()
    script({ planner: basePlan(), response: "Skim the chicken skin and lean on ginger and chilli for flavour." })
    const notAsked = await turn(message, [])
    expect(notAsked.json.route).toBe("orchestrated")
    expect(getOptionalNutritionKnowledgeContext).not.toHaveBeenCalled()
    expect(notAsked.json.orchestration.retrievalUsed).toBe(false)
  })

  it("bare continuations and quantity tweaks never retrieve, even if the model asks", async () => {
    script({ planner: withPlan((p) => { p.need.needKnowledgeRetrieval = true }), response: "Okay, one it is." })
    const result = await turn("yes", [{ role: "coach", text: OFFER }])
    expect(result.json.route).toBe("orchestrated")
    expect(getOptionalNutritionKnowledgeContext).not.toHaveBeenCalled()
  })
})

describe("small talk", () => {
  it("a greeting skips planning entirely (no planner call)", async () => {
    script({ other: "Hey 👋 What are we solving?" })
    const result = await turn("yo", [])
    expect(prompts.planner).toHaveLength(0)
    expect(result.json.orchestration).toBeNull()
  })
})

describe("31/32. option follow-ups", () => {
  it("'the second one' resolves against the presented options", async () => {
    script({ planner: withPlan((p) => { p.understanding.referencedOption = 2; p.understanding.continuationOfPreviousTurn = true; p.strategy.primaryObjective = "go ahead with Option B" }), response: "Option B it is: the protein baked donut." })
    const result = await turn("the second one", [{ role: "user", text: "give me a sweet high protein idea" }, { role: "coach", text: OPTIONS }])
    expect(result.json.route).toBe("orchestrated")
    expect(prompts.planner[0]).toContain("Protein baked donut")
    expect(prompts.planner[0]).toContain('"n":2')
  })

  it("'make it lower calorie' after the pick modifies Option B, not a restart", async () => {
    script({ planner: withPlan((p) => { p.understanding.continuationOfPreviousTurn = true; p.strategy.primaryObjective = "lower the calories of Option B" }), response: "Bake it and swap the glaze for a thin yogurt drizzle." })
    const result = await turn("make it lower calorie", [
      { role: "user", text: "give me a sweet high protein idea" },
      { role: "coach", text: OPTIONS },
      { role: "user", text: "the second one" },
      { role: "coach", text: "Option B it is: the protein baked donut." },
    ])
    expect(result.json.route).toBe("orchestrated")
    expect(prompts.planner[0]).toContain('"optionAlreadyChosen":2')
    expect(prompts.response[0]).toContain("Protein baked donut")
    expect(result.json.orchestration.clarificationNeeded).toBe(false)
  })
})

describe("33. correction", () => {
  it("'No, I meant dinner' replaces the earlier lunch inference", async () => {
    script({ planner: withPlan((p) => { p.understanding.continuationOfPreviousTurn = true; p.understanding.constraints = ["dinner"] }), response: "Got it, dinner then. Here's a lighter plate idea." })
    const result = await turn("No, I meant dinner.", [{ role: "user", text: "what should I eat for lunch?" }, { role: "coach", text: "A chicken rice bowl works for lunch." }])
    expect(result.json.route).toBe("orchestrated")
    expect(prompts.planner[0]).toContain('"userIsCorrectingEarlierInference":true')
    expect(prompts.planner[0]).toContain("meal:dinner")
    expect(prompts.planner[0]).not.toContain("meal:lunch")
    expect(prompts.response[0]).toContain('"isCorrection":true')
  })
})

describe("34. ambiguity", () => {
  it("asks exactly one question, with a single model call", async () => {
    script({ planner: basePlan() })
    const result = await turn("make it bigger", [{ role: "coach", text: OPTIONS }])
    expect(result.json.route).toBe("orchestrated")
    expect(result.json.reply).toMatch(/Option A or Option B or Option C/)
    expect(result.json.reply.match(/\?/g)).toHaveLength(1)
    expect(prompts.response).toHaveLength(0)
    expect(result.json.orchestration).toMatchObject({ responseMode: "CLARIFY", clarificationNeeded: true })
  })
})

describe("35. multi-need", () => {
  it("one strategy for a message with hunger, calories, taste, protein and convenience", async () => {
    script({
      planner: withPlan((p) => {
        p.need.primaryNeed = "hungry post-workout"
        p.need.secondaryNeeds = ["sweet", "protein", "no cooking"]
        p.need.needAthleteState = true
        p.strategy.mode = "PROPOSE"
        p.strategy.primaryObjective = "no-cook sweet high-protein option within calories"
      }),
      response: "After legs, a Greek yogurt with berries and a scoop of whey is sweet, no cooking and protein-heavy. Nothing is logged until you confirm.",
    })
    const result = await turn("I'm ravenous after legs, got 700 calories left, want something sweet, high protein, and I don't want to cook.", [])
    expect(result.json.route).toBe("orchestrated")
    expect(prompts.planner).toHaveLength(1)
    expect(result.json.orchestration).toMatchObject({ responseMode: "PROPOSE", clarificationNeeded: false })
  })
})

describe("38. safety stays authoritative", () => {
  it("a disordered-eating message is handled before orchestration, with no model call at all", async () => {
    const result = await turn("I want to starve myself to burn off the donuts", [])
    expect(result.json.route).toBe("safety")
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("allergies reach the response context and a reply recommending peanuts is discarded", async () => {
    script({ planner: basePlan(), response: "Try a peanut butter banana toast.", other: "Tell me more about what you want." })
    const result = await turn("something sweet please", [{ role: "coach", text: "What are we solving?" }])
    expect(prompts.response[0]).toContain("peanut")
    expect(prompts.response[0]).toContain("tofu")
    expect(result.json.reply).not.toMatch(/peanut butter/i)
    expect(result.json.orchestration).toMatchObject({ fallbackReason: "model_failed" })
  })
})

describe("39. confirmation", () => {
  it("'that works' never logs: no action, no draft, even when the plan flags an action", async () => {
    script({
      planner: withPlan((p) => { p.need.needActionConfirmation = true; p.strategy.mode = "PROPOSE"; p.strategy.requiresConfirmation = false }),
      response: "Great. When you're ready, confirm it in the Active Meal Draft panel. Nothing is logged yet.",
    })
    const result = await turn("that works", [{ role: "coach", text: "Here's a plan: oats with whey. Want me to put it together?" }])
    expect(result.json.route).toBe("orchestrated")
    expect(result.json).toMatchObject({ action: { type: "NONE" }, mealDraft: null })
    expect(result.json.orchestration.confirmationRequired).toBe(true)
    expect(prompts.response[0]).toMatch(/not permission to log/)
  })
})

describe("40/41. Vietnamese and mixed-language continuity", () => {
  const viOffer = "Thèm donut là bình thường. Bạn có muốn mình tính xem donut vừa với lượng macro còn lại hôm nay không?"
  const thread = [{ role: "user" as const, text: "mình thèm bánh donut quá" }, { role: "coach" as const, text: viOffer }]

  it("'ừ' resolves to the Vietnamese offer and the reply continues in Vietnamese", async () => {
    script({ planner: withPlan((p) => { p.understanding.referencedPriorOffer = true; p.need.needAthleteState = true; p.need.needExactCalculation = true }), response: "Bạn còn 520 kcal và 54g protein, một cái donut vẫn vừa. Chưa có gì được ghi lại nhé." })
    const result = await turn("ừ", thread)
    expect(result.json.route).toBe("orchestrated")
    expect(prompts.planner[0]).toContain("muốn mình")
    expect(prompts.planner[0]).toContain('"language":"vi"')
    expect(prompts.response[0]).toContain("Reply in Vietnamese")
  })

  it("mixed VN/EN keeps the same mixed style", async () => {
    script({ planner: withPlan((p) => { p.understanding.referencedPriorOffer = true }), response: "Okay, mình fit donut vào macro hôm nay nhé." })
    const result = await turn("ừ fit it in đi", thread)
    expect(result.json.route).toBe("orchestrated")
    expect(prompts.response[0]).toContain("mixed Vietnamese/English")
  })
})

describe("42/43. malformed output and failures never break the chat", () => {
  it.each([
    ["junk text", "I think the user wants donuts", "malformed"],
    ["wrong schema", JSON.stringify({ hello: "world" }), "malformed"],
    ["invalid mode", JSON.stringify(withPlan((p) => { p.strategy.mode = "TAKE_OVER" })), "invalid_plan"],
  ])("falls back safely on %s", async (_label, planner, reason) => {
    script({ planner, other: "Tell me more about what you're after." })
    const result = await turn("hmm what about that", [{ role: "coach", text: "Anything else?" }])
    expect(result.status).toBe(200)
    expect(result.json.ok).toBe(true)
    expect(result.json.route).not.toBe("orchestrated")
    expect(result.json.orchestration).toMatchObject({ source: "fallback", fallbackReason: reason })
  })

  it("an orchestration model failure returns a normal 200 reply on the existing path", async () => {
    vi.mocked(callOpenAiWithFallback).mockRejectedValue(new Error("network down"))
    const result = await turn("yes", [{ role: "coach", text: OFFER }])
    expect(result.status).toBe(200)
    expect(result.json.ok).toBe(true)
    expect(result.json.reply).toBeTruthy()
    expect(result.json.orchestration).toMatchObject({ source: "fallback" })
  })

  it("with OpenAI not configured the existing path answers and orchestration reports not_configured", async () => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    const result = await turn("yes", [{ role: "coach", text: OFFER }])
    expect(result.status).toBe(200)
    expect(result.json.orchestration).toMatchObject({ fallbackReason: "not_configured" })
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })
})

describe("26. observability is privacy-safe", () => {
  it("exposes only enums, booleans and counts", async () => {
    script({ planner: withPlan((p) => { p.understanding.userGoal = "SECRET GOAL TEXT"; p.need.primaryNeed = "SECRET NEED TEXT" }), response: "Sure." })
    const result = await turn("hmm what about that", [{ role: "coach", text: "Anything else?" }])
    // Phase 2 adds only enums/booleans/counts/short ref names; still no message text, foods, reasoning or profile data.
    const allowed = ["athleteStateUsed", "clarificationNeeded", "confirmationRequired", "contextBudgetExceeded", "contextChars", "continuationTarget", "conversationContinuation", "degradedCapabilities", "droppedContextCount", "fallbackReason", "fallbackStage", "invalidationTriggers", "orchestrationLatencyMs", "plannerCalls", "plannerConfidence", "plannerLatencyMs", "referencedPriorOffer", "responseDepth", "responseMode", "retrievalUsed", "selectedContextSources", "source", "toolNeeds"]
    expect(Object.keys(result.json.orchestration).filter((key) => !allowed.includes(key))).toEqual([])
    expect(Object.keys(result.json.orchestration)).toEqual(expect.arrayContaining(["responseMode", "responseDepth", "plannerConfidence", "fallbackStage", "contextBudgetExceeded", "selectedContextSources"]))
    expect(JSON.stringify(result.json.orchestration)).not.toMatch(/SECRET/)
  })
})
