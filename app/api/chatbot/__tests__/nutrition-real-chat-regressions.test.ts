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
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
import { createClient } from "@/lib/supabase/server"

/**
 * N1.6.4 real-chat regressions, end to end through the real handler. The engine (draft + option list) and the model's own
 * written list are two owners of "what the options are"; the user can only act on what they were shown.
 */

const USER = "00000000-0000-4000-8000-00000000000a"
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const FIRST_ASK = "I’ve got about 620 calories left today. I’m really hungry after training, want something sweet, at least 35g protein, no peanut butter, and I seriously don’t want to cook. Give me 3 options."
const SWEET_ASK = "I’ve got about 620 calories left today. Hungry after training. Which sweet ideas with at least 35g protein, no peanut butter, and no cooking would work? I would like 3 options."
const SHOWN_LIST = "Here are 3 options:\n1. Greek Yogurt Bowl\n2. Protein Shake\n3. Cottage Cheese Delight\nWhich one?"

const basePlan = (): Json => ({
  understanding: { userGoal: "stay on track", explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
  need: { primaryNeed: "general", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
  strategy: { mode: "ANSWER", primaryObjective: "answer", supportingObjectives: [], requiresConfirmation: false },
  clarification: null,
  foods: [],
})
const withPlan = (patch: (p: Json) => void): Json => {
  const p = basePlan()
  patch(p)
  return p
}
const continuing = (patch: (p: Json) => void = () => {}) => withPlan((p) => { p.strategy.mode = "CONTINUE"; p.understanding.continuationOfPreviousTurn = true; patch(p) })

let prompts: { planner: string[]; response: string[] }
/** Scripts the model by prompt role. `response` may be a list: each call consumes the next reply (the last one repeats). */
function script(options: { planner?: Json; response?: string | string[] }) {
  prompts = { planner: [], response: [] }
  const replies = Array.isArray(options.response) ? [...options.response] : [options.response ?? "Sounds good."]
  vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => {
    if (prompt.includes(PLANNER_MARKER)) {
      prompts.planner.push(prompt)
      return { reply: JSON.stringify(options.planner ?? basePlan()), model: "test" }
    }
    if (prompt.includes("SYSTEM RULES:")) {
      prompts.response.push(prompt)
      return { reply: replies.length > 1 ? replies.shift()! : replies[0], model: "test" }
    }
    return { reply: "ok", model: "test" }
  })
}
const responseContext = (index = 0): Json => JSON.parse(prompts.response[index].split("CONTEXT: ")[1].split("\n")[0])

/** A stand-in for the panel: echoes the active draft and conversation back exactly as the UI does. `shown` = what the user actually saw. */
function session() {
  let active: Json | null = null
  let conversation: Json | undefined
  const recent: Array<{ role: "user" | "coach"; text: string }> = []
  return {
    async say(message: string, shown?: string): Promise<Json> {
      recent.push({ role: "user", text: message })
      const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", activeDraft: active, conversation: { ...(conversation ?? {}), recentMessages: recent.slice(-6) } }) }))
      const json = (await response.json()) as Json
      recent.push({ role: "coach", text: shown ?? json.reply })
      conversation = json.conversation
      if (json.mealDraft) active = json.mealDraft
      if (json.conversation?.deactivateDraft) active = null
      return json
    },
  }
}

let remaining = 520
beforeEach(() => {
  vi.clearAllMocks()
  remaining = 520
  vi.mocked(isOpenAiConfigured).mockReturnValue(true)
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }, from: vi.fn(() => { throw new Error("no direct table access") }) } as never)
  vi.mocked(loadNutritionContext).mockImplementation((async () => ({
    plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: ["peanut"], excludedFoods: [], foodPreferences: [] } },
    targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  })) as never)
  vi.mocked(loadFoodLogForDate).mockImplementation((async () => ({ date: "2026-10-07", entries: [], totals: { calories: 2200 - remaining, protein: 106, carbs: 0, fat: 0 } })) as never)
  script({})
})

/** The observed session: an engine meal (tofu) exists, then the model writes its own three options. */
async function engineThenModelList() {
  const s = session()
  script({})
  const engine = await s.say("I have tofu, bread and chicken. Build dinner under 600 calories")
  expect(engine.route).toBe("build")
  script({ planner: withPlan((p) => { p.strategy.mode = "PROPOSE" }), response: SHOWN_LIST })
  const ask = await s.say(SWEET_ASK, SHOWN_LIST)
  expect(ask.route).toBe("orchestrated")
  return { s, engine, ask }
}

describe("RC-01/03 'option 2' picks the displayed option and needs no confirmation", () => {
  it("resolves to Protein Shake (never the engine's unrelated bowl), CONTINUE/PENDING_CHOICE, no confirmation", async () => {
    const { s, engine } = await engineThenModelList()
    expect(engine.mealDraft.name).toMatch(/Tofu/) // the stale engine draft really is in play
    // The planner (wrongly) asks for confirmation: a pick is not a mutation.
    script({ planner: continuing((p) => { p.need.needActionConfirmation = true; p.strategy.requiresConfirmation = true }), response: "Protein Shake it is — quick and no cooking." })
    const pick = await s.say("option 2")
    expect(pick.route).toBe("orchestrated")
    expect(pick.route).not.toMatch(/followup_/)
    expect(pick.orchestration).toMatchObject({ responseMode: "CONTINUE", continuationTarget: "PENDING_CHOICE", confirmationRequired: false })
    expect(pick.reply).not.toMatch(/Tofu/i)
    const context = responseContext()
    expect(context).toMatchObject({ chosenOption: { text: "Protein Shake" }, activeItem: "Protein Shake" })
    expect(JSON.stringify(context)).not.toMatch(/Tofu|Tuna/i)
    expect(pick.conversation.followUp?.presentedOptions ?? null).toBeNull() // the engine's old choice does not survive
  })

  it.each(["the second one", "cái thứ 2"])("'%s' resolves the same way", async (message) => {
    const { s } = await engineThenModelList()
    script({ planner: continuing(), response: "Protein Shake it is." })
    const pick = await s.say(message)
    expect(pick.orchestration).toMatchObject({ continuationTarget: "PENDING_CHOICE" })
    expect(responseContext().chosenOption).toMatchObject({ text: "Protein Shake" })
  })

  it("when the engine's OWN list is the one shown, the engine still resolves the pick (unchanged behaviour)", async () => {
    const s = session()
    script({})
    const built = await s.say("I have tofu, bread and chicken. Build dinner under 600 calories")
    const second = built.presentedOptions.options[1].label
    const pick = await s.say("the second one")
    expect(pick.route).toBe("followup_select")
    expect(pick.reply).toContain(second)
  })
})

describe("RC-04/05 a modification stays on the selected item; numbers stay deterministic", () => {
  it("'make it cheaper...' applies to Protein Shake, not the stale draft; no engine edit runs", async () => {
    const { s } = await engineThenModelList()
    script({ planner: continuing(), response: "Protein Shake it is." })
    await s.say("option 2")
    script({ planner: continuing(), response: "Use plain whey and water to keep the shake cheap." })
    const cheaper = await s.say("but make it cheaper and keep the protein about the same.")
    expect(cheaper.route).toBe("orchestrated")
    expect(cheaper.mealDraft).toBeNull()
    expect(cheaper.action.type).toBe("NONE")
    expect(cheaper.orchestration).toMatchObject({ continuationTarget: "ACTIVE_MODIFICATION" })
    expect(responseContext()).toMatchObject({ activeItem: "Protein Shake", chosenOption: { text: "Protein Shake" } })
    expect(cheaper.reply).not.toMatch(/tofu|chicken/i)
  })

  it("a reply that silently changes the exact macros is rejected rather than shown", async () => {
    const { s } = await engineThenModelList()
    script({ planner: continuing(), response: "Protein Shake — about 589 kcal and 44g protein." })
    const pick = await s.say("option 2")
    // 589/44 is not grounded in any tool result, the user's text or an earlier turn: it must not be presented as exact.
    expect(pick.route).not.toBe("orchestrated")
    script({ planner: continuing(), response: "Now it is about 489 kcal and 45g protein." })
    const later = await s.say("but make it cheaper")
    expect(later.reply).not.toMatch(/489|589/)
  })
})

describe("RC-02 constraints survive select -> modify -> recipe", () => {
  it("'give me the recipe' goes to the conversation (not a fresh engine meal) with the no-cook constraint, and a baked reply is repaired", async () => {
    const { s } = await engineThenModelList()
    script({ planner: continuing(), response: "Protein Shake it is." })
    await s.say("option 2")
    script({ planner: continuing(), response: ["Bake it at 180C for 20-25 minutes in the oven.", "No cooking needed: blend whey, milk and ice for 30 seconds."] })
    const recipe = await s.say("give me the recipe")
    expect(recipe.route).toBe("orchestrated")
    expect(recipe.mealDraft).toBeNull()
    expect(prompts.response).toHaveLength(2) // exactly one bounded repair
    expect(recipe.reply).toBe("No cooking needed: blend whey, milk and ice for 30 seconds.")
    expect(responseContext().hardConstraints).toEqual(expect.arrayContaining(["low_prep", "without:peanut butter", "min_protein:35", "allergy:peanut"]))
  })

  it("constraints outlive the 6-message window through the echoed conversation state, and can be lifted", async () => {
    const { s } = await engineThenModelList()
    script({ planner: continuing(), response: "Protein Shake it is." })
    const pick = await s.say("option 2")
    expect(pick.conversation.constraints).toEqual(expect.arrayContaining(["low_prep", "without:peanut butter"]))
    script({ planner: continuing(), response: "Use plain whey and water." })
    await s.say("make it cheaper")
    script({ planner: continuing(), response: "Add ice." })
    await s.say("thicker please")
    script({ planner: continuing(), response: "Blend whey, milk and ice." })
    const late = await s.say("what goes in it?")
    expect(responseContext().hardConstraints).toContain("low_prep") // the first message is long out of the window
    expect(late.conversation.constraints).toContain("low_prep")
    script({ planner: continuing(), response: "Sure — here is the oven version." })
    const lifted = await s.say("actually I can cook tonight")
    expect(lifted.conversation.constraints).not.toContain("low_prep")
    expect(lifted.conversation.constraints).toContain("without:peanut butter")
  })
})

describe("RC-07 'the other one' is ambiguous => CLARIFY with no invented entity", () => {
  it("asks which one, names only displayed options, calls no response model", async () => {
    const { s } = await engineThenModelList()
    script({ planner: continuing(), response: "Protein Shake it is." })
    await s.say("option 2")
    script({ planner: continuing(), response: "High-Protein Tuna Wrap Bowl, bigger." })
    const other = await s.say("Make the other one bigger.")
    expect(other.orchestration).toMatchObject({ responseMode: "CLARIFY" })
    expect(other.reply).toBe("Which one do you mean: Greek Yogurt Bowl or Cottage Cheese Delight?")
    expect(prompts.response).toHaveLength(0)
    expect(other.reply).not.toMatch(/Tuna|Tofu/)
    expect(other.mealDraft).toBeNull()
  })
})

describe("RC-06 'I meant 620 is what I've eaten' beats the earlier 620-left assumption", () => {
  const CORRECTION = "Wait, I meant 620 calories is what I’ve already eaten, not what I have left."
  const earlier = async () => {
    const { s } = await engineThenModelList()
    return s
  }

  it("with trusted state: remaining is recomputed from state; a reply that revives '620 left' is not used", async () => {
    const s = await earlier()
    script({ planner: withPlan((p) => { p.understanding.continuationOfPreviousTurn = true; p.need.needAthleteState = true }), response: ["You have 620 calories left, so go big.", "Understood — 620 eaten so far. You have 520 calories left today."] })
    const fixed = await s.say(CORRECTION)
    expect(fixed.route).toBe("orchestrated")
    const context = responseContext()
    expect(context.userCorrection).toMatchObject({ retracted: "remainingCalories=620", recorded: "consumedCalories=620" })
    expect(context.athleteState.remaining.calories).toBe(520)
    expect(fixed.reply).not.toMatch(/620 calories left/)
  })
})

describe("P2S: a safety event ends conversational continuation", () => {
  it("after a pick, a safety message stops coaching, calls no model and clears the focus", async () => {
    const { s } = await engineThenModelList()
    script({ planner: continuing(), response: "Protein Shake it is." })
    const pick = await s.say("option 2")
    expect(pick.conversation.focus).toMatchObject({ owner: "CONVERSATION", item: "Protein Shake" })
    script({ planner: continuing(), response: "should never be used" })
    const stop = await s.say("yes but I'm having chest pain")
    expect(stop.route).toBe("safety_chest_pain")
    expect(prompts.planner).toHaveLength(0)
    expect(prompts.response).toHaveLength(0)
    expect(stop.conversation.focus).toBeNull()
    expect(stop.mealDraft).toBeNull()
  })
})

describe("RC-08 no entity without provenance", () => {
  it("the planner inventing a dish does not make it the active entity", async () => {
    const { s } = await engineThenModelList()
    script({ planner: continuing((p) => { p.understanding.referencedEntities = ["High-Protein Tuna Wrap Bowl"]; p.foods = [{ text: "High-Protein Tuna Wrap Bowl", grams: 300 }]; p.need.needFoodLookup = true; p.need.needExactCalculation = true }), response: "Protein Shake it is." })
    const pick = await s.say("option 2")
    expect(pick.orchestration).toMatchObject({ continuationTarget: "PENDING_CHOICE" })
    expect(prompts.response[0]).not.toMatch(/Tuna/)
    expect(responseContext().foodToolResults ?? []).toEqual([])
  })
})

describe("RC-01 the engine owns an engine-built turn", () => {
  it("a model-written option list never sits beside the engine's own options", async () => {
    const s = session()
    script({ planner: withPlan((p) => { p.strategy.mode = "PROPOSE" }), response: SHOWN_LIST })
    const ask = await s.say(FIRST_ASK)
    expect(ask.route).toBe("build")
    expect(ask.reply).not.toMatch(/Greek Yogurt Bowl|Protein Shake|Cottage Cheese Delight/)
    expect(ask.conversation.presented.owner).toBe("ENGINE")
  })
})
