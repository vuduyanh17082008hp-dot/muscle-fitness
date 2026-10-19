import { describe, expect, it } from "vitest"

import { makeCtx } from "../../__tests__/fixtures"
import { resolveConversationContext } from "../context"
import { orchestrateTurn } from "../orchestrate"
import { buildPlan } from "../plan"
import { buildContextBudget, buildResponsePrompt, composeReply, mentionsBlockedFood } from "../respond"
import { runDeterministicTools } from "../tools"
import type { PlannerOutput, RecentMessage } from "../types"
import { extractJson, validatePlannerOutput } from "../validate"

const OFFER = "Wanting donuts is fair. Want me to fit the donuts into what you have left today?"
const OPTIONS = "Ideas:\nOption A: Yogurt bowl\nOption B: Protein baked donut\nOption C: Cottage cheese toast"

/** Raw planner JSON as a model would return it; override pieces per test. */
function raw(overrides: Record<string, unknown> = {}) {
  return {
    understanding: { userGoal: "stay on track", explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "general", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "MEDIUM" },
    strategy: { mode: "ANSWER", primaryObjective: "answer the user", supportingObjectives: [], requiresConfirmation: false },
    clarification: null,
    foods: [],
    ...overrides,
  }
}

function plannerOutput(message: string, recent: RecentMessage[], overrides: Record<string, unknown> = {}) {
  const context = resolveConversationContext(message, recent)
  const validated = validatePlannerOutput(raw(overrides), context)
  if (!validated.ok) throw new Error(`invalid: ${validated.reason}`)
  return { context, output: validated.value }
}

const guards = { allergies: [] as string[], excludedFoods: [] as string[] }
const plan = (message: string, recent: RecentMessage[], overrides: Record<string, unknown> = {}, g = guards) => {
  const { context, output } = plannerOutput(message, recent, overrides)
  return { context, plan: buildPlan(output, context, g, { athleteStateAvailable: true }) }
}

describe("N. structured output validation", () => {
  const context = resolveConversationContext("hi", [])

  it("extracts JSON from fenced or chatty replies", () => {
    expect(extractJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 })
    expect(extractJson("Sure! {\"a\":1} hope that helps")).toEqual({ a: 1 })
    expect(extractJson("no json here")).toBeNull()
    expect(extractJson("{broken")).toBeNull()
  })

  it.each([
    ["non-object", "nope"],
    ["missing required sections", { understanding: {} }],
    ["missing need fields", raw({ need: { primaryNeed: "x" } })],
    ["wrong types", raw({ strategy: { mode: "ANSWER", primaryObjective: 5, supportingObjectives: [], requiresConfirmation: false } })],
  ])("rejects %s as malformed", (_label, value) => {
    expect(validatePlannerOutput(value, context)).toEqual({ ok: false, reason: "malformed" })
  })

  it("rejects an unknown response mode", () => {
    expect(validatePlannerOutput(raw({ strategy: { mode: "TAKE_OVER", primaryObjective: "x", supportingObjectives: [], requiresConfirmation: false } }), context)).toEqual({ ok: false, reason: "invalid_plan" })
  })

  it("normalizes the mode case", () => {
    const result = validatePlannerOutput(raw({ strategy: { mode: "answer", primaryObjective: "x", supportingObjectives: [], requiresConfirmation: false } }), context)
    expect(result.ok && result.value.strategy.mode).toBe("ANSWER")
  })

  it("drops an unsupported option reference and an offer nobody made", () => {
    const result = validatePlannerOutput(raw({ understanding: { ...raw().understanding, referencedOption: 2, referencedPriorOffer: true } }), context)
    expect(result.ok && result.value.understanding).toMatchObject({ referencedOption: null, referencedPriorOffer: false })
  })

  it("an action request always requires confirmation", () => {
    const result = validatePlannerOutput(raw({ need: { ...raw().need, needActionConfirmation: true }, strategy: { mode: "PROPOSE", primaryObjective: "log it", supportingObjectives: [], requiresConfirmation: false } }), context)
    expect(result.ok && result.value.strategy.requiresConfirmation).toBe(true)
  })

  it("keeps only the first question of a multi-question clarification", () => {
    const result = validatePlannerOutput(raw({ strategy: { mode: "ASK_ONE_QUESTION", primaryObjective: "ask", supportingObjectives: [], requiresConfirmation: false }, clarification: { question: "How big? And what flavour? Any allergies?", affects: "calculation" } }), context)
    expect(result.ok && result.value.clarification?.question).toBe("How big?")
  })

  it("asking without a question degrades to answering; refusing computes nothing", () => {
    const ask = validatePlannerOutput(raw({ strategy: { mode: "ASK_ONE_QUESTION", primaryObjective: "ask", supportingObjectives: [], requiresConfirmation: false } }), context)
    expect(ask.ok && ask.value.strategy.mode).toBe("ANSWER")
    const refuse = validatePlannerOutput(raw({ need: { ...raw().need, needExactCalculation: true, needKnowledgeRetrieval: true }, strategy: { mode: "REFUSE_POLICY", primaryObjective: "decline", supportingObjectives: [], requiresConfirmation: false } }), context)
    expect(refuse.ok && refuse.value.need).toMatchObject({ needExactCalculation: false, needKnowledgeRetrieval: false })
  })
})

describe("A/H. prior offer + exact macros use deterministic state", () => {
  const recent: RecentMessage[] = [{ role: "user", text: "I'm craving donuts but want to stay in shape" }, { role: "coach", text: OFFER }]
  const exact = { need: { ...raw().need, needExactCalculation: true, needAthleteState: true, needFoodLookup: true }, understanding: { ...raw().understanding, referencedPriorOffer: true, continuationOfPreviousTurn: true }, foods: [{ text: "donuts", grams: null }] }

  it("marks the continuation and requires Athlete State for remaining macros", () => {
    const { plan: built } = plan("yes", recent, exact)
    expect(built.understanding).toMatchObject({ continuationOfPreviousTurn: true, referencedPriorOffer: true })
    expect(built.toolNeed).toMatchObject({ needMacroCalculation: true, needAthleteState: true, needClarification: false })
    expect(built.strategy.useTools).toEqual(expect.arrayContaining(["athlete_state", "macro_calculator", "food_lookup"]))
  })

  it("forces Athlete State whenever an exact calculation is needed, even if the model forgot", () => {
    const { plan: built } = plan("how much protein is left after that", [], { need: { ...raw().need, needExactCalculation: true, needAthleteState: false } })
    expect(built.toolNeed.needAthleteState).toBe(true)
  })

  it("remaining macros come from state; an unverified food returns no invented numbers", () => {
    const ctx = makeCtx({ caloriesRemaining: 520, proteinRemaining: 54 })
    const { plan: built } = plan("yes", recent, exact)
    const results = runDeterministicTools(built, ctx)
    expect(results.athleteState?.remaining).toEqual({ calories: 520, protein: 54 })
    expect(results.foods?.[0]).toMatchObject({ asked: "donuts", matched: null, macros: null })
    expect(results.fit).toBeUndefined()
  })

  it("computes fit arithmetic only from verified foods and known grams", () => {
    const ctx = makeCtx({ caloriesRemaining: 520, proteinRemaining: 54 })
    const { plan: built } = plan("fit 150g chicken in", [], { ...exact, foods: [{ text: "chicken breast", grams: 150 }] })
    const results = runDeterministicTools(built, ctx)
    expect(results.foods?.[0].macros).not.toBeNull()
    expect(results.fit).toMatchObject({ withinCalories: true })
    expect(results.fit!.afterCalories).toBe(520 - results.foods![0].macros!.calories)
  })

  it("the response context carries remaining macros only when the plan asked for state", () => {
    const ctx = makeCtx()
    const withState = plan("yes", recent, exact)
    const noState = plan("make it spicier", recent, {})
    const a = buildContextBudget(withState.plan, withState.context, ctx, runDeterministicTools(withState.plan, ctx), [], null)
    const b = buildContextBudget(noState.plan, noState.context, ctx, runDeterministicTools(noState.plan, ctx), [], null)
    expect(a.included).toContain("athleteState")
    expect(b.included).not.toContain("athleteState")
    expect(JSON.stringify(b.context)).not.toContain("520")
    expect(b.included).toContain("hardConstraints")
  })
})

describe("I. retrieval is optional support", () => {
  it("never retrieves for a bare yes/no, even if the model asks for it", () => {
    const recent: RecentMessage[] = [{ role: "coach", text: OFFER }]
    expect(plan("yes", recent, { need: { ...raw().need, needKnowledgeRetrieval: true } }).plan.toolNeed.needKnowledgeRetrieval).toBe(false)
    expect(plan("nah", recent, { need: { ...raw().need, needKnowledgeRetrieval: true } }).plan.toolNeed.needKnowledgeRetrieval).toBe(false)
  })

  it("simple conversation asks for no tools at all", () => {
    const { plan: built } = plan("what about dinner?", [], {})
    expect(built.strategy.useTools).toEqual([])
    expect(built.toolNeed.reason).toBe("no tool support needed")
  })

  it("keeps retrieval for a real recipe question", () => {
    const { plan: built } = plan("How can I make protein donuts?", [], { need: { ...raw().need, needKnowledgeRetrieval: true } })
    expect(built.strategy.useTools).toEqual(["knowledge_retrieval"])
  })
})

describe("clarification policy (E)", () => {
  it("asks ONE question for a genuinely ambiguous referent even if the model guessed", () => {
    const { plan: built } = plan("make it bigger", [{ role: "coach", text: OPTIONS }], {})
    expect(built.strategy.mode).toBe("CLARIFY")
    expect(built.clarification?.question.match(/\?/g)).toHaveLength(1)
    expect(built.clarification?.question).toMatch(/Option A or Option B or Option C/)
    expect(built.strategy.useTools).toEqual([])
  })

  it("asks in Vietnamese for a Vietnamese user", () => {
    const { plan: built } = plan("làm cho nó to hơn", [{ role: "coach", text: OPTIONS }], {})
    expect(built.clarification?.question).toMatch(/Bạn muốn/)
  })

  it("does not ask when the user already picked an option", () => {
    const recent: RecentMessage[] = [{ role: "coach", text: OPTIONS }, { role: "user", text: "the second one" }, { role: "coach", text: "Option B, nice." }]
    expect(plan("make it bigger", recent, {}).plan.clarification).toBeNull()
  })

  it("drops a question whose answer is already in Athlete State or does not matter", () => {
    const remaining = { strategy: { mode: "ASK_ONE_QUESTION", primaryObjective: "ask", supportingObjectives: [], requiresConfirmation: false }, clarification: { question: "How many calories do you have left today?", affects: "calculation" } }
    expect(plan("something sweet", [], remaining).plan.strategy.mode).toBe("ANSWER")
    const trivial = { ...remaining, clarification: { question: "What exactly do you want?", affects: "none" } }
    expect(plan("I want something sweet and high protein", [], trivial).plan.clarification).toBeNull()
  })

  it("does not ask for the daily protein/calorie target when the canonical target is available", () => {
    const ask = (question: string) => ({ strategy: { mode: "ASK_ONE_QUESTION", primaryObjective: "ask", supportingObjectives: [], requiresConfirmation: false }, clarification: { question, affects: "calculation" } })
    for (const q of ["What is your total protein goal for today?", "What's your protein target?", "What is your daily calorie goal?"]) {
      const built = plan("How much protein do I have left today?", [], ask(q)).plan
      expect(built.clarification).toBeNull()
      expect(built.strategy.mode).toBe("ANSWER")
    }
  })

  it("still allows the target question when no nutrition state exists", () => {
    const { context, output } = plannerOutput("How much protein do I have left today?", [], { strategy: { mode: "ASK_ONE_QUESTION", primaryObjective: "ask", supportingObjectives: [], requiresConfirmation: false }, clarification: { question: "What is your total protein goal for today?", affects: "calculation" } })
    const built = buildPlan(output, context, guards, { athleteStateAvailable: false })
    expect(built.clarification?.question).toMatch(/protein goal/)
  })

  it("keeps a question that materially changes a calculation", () => {
    const material = { strategy: { mode: "ASK_ONE_QUESTION", primaryObjective: "ask", supportingObjectives: [], requiresConfirmation: false }, clarification: { question: "About how many donuts, one or two?", affects: "calculation" } }
    const { plan: built } = plan("yes", [{ role: "coach", text: OFFER }], material)
    expect(built.strategy.mode).toBe("ASK_ONE_QUESTION")
    expect(built.toolNeed.needClarification).toBe(true)
  })
})

describe("G. a multi-need message yields one coherent strategy", () => {
  const message = "I'm starving after legs, got 700 calories left, want something sweet, high protein, and I don't want to cook."

  it("keeps every need inside one PROPOSE plan, with state and no clarification", () => {
    const { plan: built, context } = plan(message, [], {
      understanding: { ...raw().understanding, userGoal: "recover and eat satisfying food", implicitNeeds: ["hunger after training", "low effort"], constraints: ["no cooking", "700 kcal left", "sweet", "high protein"] },
      need: { ...raw().need, primaryNeed: "hungry post-workout", secondaryNeeds: ["sweet taste", "protein", "convenience"], needAthleteState: true, needKnowledgeRetrieval: true },
      strategy: { mode: "PROPOSE", primaryObjective: "propose a no-cook sweet high-protein option within calories", supportingObjectives: ["acknowledge training", "respect convenience"], requiresConfirmation: false },
    })
    expect(built.strategy.mode).toBe("PROPOSE")
    expect(built.strategy.supportingObjectives).toHaveLength(2)
    expect(built.need.secondaryNeeds).toEqual(["sweet taste", "protein", "convenience"])
    expect(built.toolNeed.needClarification).toBe(false)
    expect(built.strategy.useTools).toEqual(expect.arrayContaining(["athlete_state", "knowledge_retrieval"]))
    expect(context.referencedAmounts).toContain("700 calories")
  })
})

describe("J. safety / allergy stay authoritative", () => {
  it("hard constraints rank allergy > exclusion > user limits > meal slot", () => {
    const { plan: built } = plan("a dinner under 600 calories without milk", [], {}, { allergies: ["peanut"], excludedFoods: ["tofu"] })
    expect(built.hardConstraints).toEqual(["allergy:peanut", "exclude:tofu", "without:milk", "max_kcal:600", "meal:dinner"])
  })

  it("the response prompt always carries allergies, even when no state is requested", () => {
    const ctx = makeCtx({ allergies: ["peanut"], excludedFoods: ["tofu"] })
    const { plan: built, context } = plan("something sweet", [], {}, ctx.guards)
    const prompt = buildResponsePrompt("something sweet", built, context, buildContextBudget(built, context, ctx, runDeterministicTools(built, ctx), [], null), null)
    expect(prompt).toContain("peanut")
    expect(prompt).toContain("tofu")
  })

  it("blocks a reply that recommends an allergen but allows 'peanut-free' / 'avoid peanuts'", () => {
    const g = { allergies: ["peanut"], excludedFoods: ["tofu"] }
    expect(mentionsBlockedFood("Try a peanut butter toast.", g)).toBe(true)
    expect(mentionsBlockedFood("Add tofu scramble.", g)).toBe(true)
    expect(mentionsBlockedFood("A peanut-free option is oats with berries.", g)).toBe(false)
    expect(mentionsBlockedFood("I'll avoid peanuts and skip the tofu.", g)).toBe(false)
  })

  it("composeReply discards a model reply that recommends an excluded food, and replaces unsafe advice", async () => {
    const ctx = makeCtx({ allergies: ["peanut"] })
    const { plan: built, context } = plan("something sweet", [], {}, ctx.guards)
    const results = runDeterministicTools(built, ctx)
    const budget = buildContextBudget(built, context, ctx, results, [], null)
    const base = { message: "something sweet", plan: built, context, ctx, results, budget, knowledgeText: null }
    expect(await composeReply({ ...base, call: async () => "Peanut butter on toast is great." })).toBeNull()
    const unsafe = await composeReply({ ...base, call: async () => "Go run an extra 5k to earn it." })
    expect(unsafe?.reply).toMatch(/earn|punish|restrict|balance/i)
  })

  it("discards a reply with invented macros", async () => {
    const ctx = makeCtx()
    const { plan: built, context } = plan("something sweet", [], {}, ctx.guards)
    const results = runDeterministicTools(built, ctx)
    const budget = buildContextBudget(built, context, ctx, results, [], null)
    expect(await composeReply({ message: "something sweet", plan: built, context, ctx, results, budget, knowledgeText: null, call: async () => "That's about 333 kcal." })).toBeNull()
  })
})

describe("K. confirmation boundary", () => {
  it("'that works' never authorizes a log: the plan only ever marks confirmation required", () => {
    const recent: RecentMessage[] = [{ role: "coach", text: "Here's a plan: oats + whey. Want me to log it?" }]
    const { plan: built } = plan("that works", recent, { need: { ...raw().need, needActionConfirmation: true }, strategy: { mode: "PROPOSE", primaryObjective: "confirm in panel", supportingObjectives: [], requiresConfirmation: false } })
    expect(built.strategy.requiresConfirmation).toBe(true)
    expect(built.toolNeed.needActionTool).toBe(true)
    // The response contract: nothing in the plan or prompt can say a meal was logged.
    const ctx = makeCtx()
    const { context } = plan("that works", recent, {})
    const prompt = buildResponsePrompt("that works", built, context, buildContextBudget(built, context, ctx, runDeterministicTools(built, ctx), [], null), null)
    expect(prompt).toMatch(/Never say a meal was logged/)
    expect(prompt).toMatch(/not permission to log/)
  })
})

describe("O. orchestration never throws and degrades cleanly", () => {
  const ctx = makeCtx()

  it("falls back when no model is configured", async () => {
    const outcome = await orchestrateTurn({ message: "yes", recent: [], ctx, call: null })
    expect(outcome).toMatchObject({ kind: "fallback", diagnostics: { fallbackReason: "not_configured", source: "fallback", plannerCalls: 0 } })
  })

  it("falls back when the model call fails, returns junk, or throws", async () => {
    expect(await orchestrateTurn({ message: "yes", recent: [], ctx, call: async () => null })).toMatchObject({ kind: "fallback", diagnostics: { fallbackReason: "model_failed" } })
    expect(await orchestrateTurn({ message: "yes", recent: [], ctx, call: async () => "totally not json" })).toMatchObject({ kind: "fallback", diagnostics: { fallbackReason: "malformed" } })
    expect(await orchestrateTurn({ message: "yes", recent: [], ctx, call: async () => { throw new Error("boom") } })).toMatchObject({ kind: "fallback", diagnostics: { fallbackReason: "error" } })
  })

  it("produces privacy-safe diagnostics only", async () => {
    const outcome = await orchestrateTurn({ message: "yes", recent: [{ role: "coach", text: OFFER }], ctx, call: async () => JSON.stringify(raw()) })
    expect(outcome.kind).toBe("plan")
    const diag = JSON.stringify(outcome.kind === "fallback" ? outcome.diagnostics : { ...outcome.plan })
    expect(JSON.stringify(Object.keys(outcome.kind === "fallback" ? outcome.diagnostics : {}))).not.toMatch(/reason|thought/i)
    expect(diag.length).toBeGreaterThan(0)
  })
})

describe("planner output type", () => {
  it("has no free-form reasoning field", () => {
    const keys = Object.keys(raw()) as Array<keyof PlannerOutput>
    expect(keys).toEqual(["understanding", "need", "strategy", "clarification", "foods"])
  })
})
