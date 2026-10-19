import { describe, expect, it } from "vitest"

import { makeCtx } from "../../__tests__/fixtures"
import { buildContextBudget, DEFAULT_CONTEXT_LIMITS } from "../budget"
import { resolveConversationContext } from "../context"
import { checkDecisionConsistency } from "../needs"
import { deterministicPlannerOutput, orchestrateTurn } from "../orchestrate"
import { buildPlan } from "../plan"
import { applyContextLifecycle, REFERENT_TTL } from "../lifecycle"
import { buildResponsePrompt, composeReply, contradictsBinding } from "../respond"
import { SAFETY_RESPONSE_CONTRACT, safetyReply, screenSafety } from "../safety"
import { buildToolPlan, validateToolPlan } from "../toolplan"
import { runDeterministicTools } from "../tools"
import type { PlanningExtras, RecentMessage } from "../types"
import { validatePlannerOutput } from "../validate"

const OFFER = "Wanting donuts is fair. Want me to fit the donuts into what you have left today?"
const OPTIONS = "Ideas:\nOption A: Yogurt bowl\nOption B: Protein baked donut\nOption C: Cottage cheese toast"
const PICKED: RecentMessage[] = [{ role: "coach", text: OPTIONS }, { role: "user", text: "the second one" }, { role: "coach", text: "Option B, nice." }]

function raw(overrides: Record<string, unknown> = {}) {
  return {
    understanding: { userGoal: "stay on track", explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "general", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
    strategy: { mode: "ANSWER", primaryObjective: "answer the user", supportingObjectives: [], requiresConfirmation: false },
    clarification: null,
    foods: [],
    ...overrides,
  }
}
const need = (patch: Record<string, unknown>) => ({ ...raw().need, ...patch })
const cont = { ...raw().understanding, continuationOfPreviousTurn: true }
const guards = { allergies: ["peanut"], excludedFoods: ["tofu"] }

function plan(message: string, recent: RecentMessage[], overrides: Record<string, unknown> = {}, extras: PlanningExtras = {}) {
  const resolved = resolveConversationContext(message, recent)
  const { context, invalidations } = applyContextLifecycle(message, resolved, extras)
  const validated = validatePlannerOutput(raw(overrides), context)
  if (!validated.ok) throw new Error(validated.reason)
  return { context, plan: buildPlan(validated.value, context, guards, { athleteStateAvailable: true, message, extras, invalidations }) }
}

const ctx = makeCtx({ caloriesRemaining: 520, proteinRemaining: 54, allergies: ["peanut"] })

describe("response strategy: CONTINUE contract", () => {
  it("'yes' to a fit offer continues the PRIOR_OFFER, fits macros deterministically, no retrieval, no question", () => {
    const { plan: p } = plan("yes", [{ role: "user", text: "craving donuts" }, { role: "coach", text: OFFER }], { understanding: cont, need: need({ needKnowledgeRetrieval: true }) })
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "PRIOR_OFFER", responseDepth: "SHORT" })
    expect(p.toolNeed).toMatchObject({ needMacroCalculation: true, needNutritionState: true, needKnowledgeRetrieval: false, needClarification: false })
    expect(p.foods).toEqual([{ text: "donuts", grams: null }])
    expect(p.toolPlan.steps.map((s) => s.tool)).toEqual(["athlete_state_read", "food_lookup", "macro_calculation"])
  })

  it("'the second one' continues the PENDING_CHOICE with no tools", () => {
    const { plan: p } = plan("the second one", [{ role: "coach", text: OPTIONS }], { need: need({ needKnowledgeRetrieval: true, needAthleteState: true, needFoodLookup: true }) })
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "PENDING_CHOICE" })
    expect(p.strategy.useTools).toEqual([])
    expect(p.clarification).toBeNull()
  })

  it("'make it lower calorie' modifies the active referent instead of restarting", () => {
    const { plan: p } = plan("make it lower calorie", PICKED, {})
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "ACTIVE_MODIFICATION" })
    expect(p.strategy.useTools).toEqual([])
  })

  it("an active draft is a valid continuation target", () => {
    const { plan: p } = plan("make it sweeter", [{ role: "coach", text: "Here's a bowl." }], { understanding: cont }, { hasActiveDraft: true })
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "ACTIVE_DRAFT" })
  })

  it("CONTINUE without a resolvable target never survives: context-leaning => CLARIFY, standalone => ANSWER", () => {
    const lean = plan("make it bigger", [], { strategy: { ...raw().strategy, mode: "CONTINUE" } }).plan
    expect(lean.strategy.mode).toBe("CLARIFY")
    expect(lean.strategy.continuationTarget).toBeUndefined()
    expect(lean.plannerConfidence).toBe("LOW")
    const standalone = plan("How can I make protein donuts?", [], { strategy: { ...raw().strategy, mode: "CONTINUE" } }).plan
    expect(standalone.strategy.mode).toBe("ANSWER")
  })

  it("the model cannot supply the target: a bogus continuationTarget in planner output is ignored", () => {
    const { plan: p } = plan("how about dinner", [], { strategy: { ...raw().strategy, mode: "ANSWER", continuationTarget: "PRIOR_OFFER" } })
    expect(p.strategy.continuationTarget).toBeUndefined()
  })
})

describe("ASK_ONE_QUESTION vs CLARIFY", () => {
  it("a missing fact asks one question; an ambiguous referent clarifies; never both", () => {
    const ask = plan("fit it in", [], { strategy: { ...raw().strategy, mode: "ASK_ONE_QUESTION" }, clarification: { question: "About how many donuts?", affects: "calculation" } }).plan
    expect(ask.strategy.mode).toBe("ASK_ONE_QUESTION")
    const clarify = plan("make it bigger", [{ role: "coach", text: OPTIONS }], {}).plan
    expect(clarify.strategy.mode).toBe("CLARIFY")
    for (const p of [ask, clarify]) expect(p.clarification?.question.match(/\?/g)).toHaveLength(1)
  })

  it("does not ask for a quick idea, a defaultable detail, or a question the coach already asked", () => {
    const q = { strategy: { ...raw().strategy, mode: "ASK_ONE_QUESTION" }, clarification: { question: "How hungry are you?", affects: "option" } }
    expect(plan("just give me a quick idea", [], q).plan.clarification).toBeNull()
    const repeated = { ...q, clarification: { question: "Which meal is this for?", affects: "calculation" } }
    expect(plan("something light", [{ role: "coach", text: "Which meal is this for?" }], repeated).plan.clarification).toBeNull()
  })
})

describe("response depth and option count", () => {
  it("SHORT for continuations/questions, NORMAL for proposals, DETAILED on request", () => {
    expect(plan("yes", [{ role: "coach", text: OFFER }], { understanding: cont }).plan.strategy.responseDepth).toBe("SHORT")
    expect(plan("something sweet and high protein", [], { strategy: { ...raw().strategy, mode: "PROPOSE", responseDepth: "DETAILED" } }).plan.strategy.responseDepth).toBe("NORMAL")
    expect(plan("explain in detail why fibre keeps me full", [], {}).plan.strategy.responseDepth).toBe("DETAILED")
  })

  it("PROPOSE tells the model to offer 2-3 options", () => {
    const { plan: p, context } = plan("something sweet and high protein", [], { strategy: { ...raw().strategy, mode: "PROPOSE" } })
    const prompt = buildResponsePrompt("something sweet", p, context, buildContextBudget(p, context, ctx, runDeterministicTools(p, ctx), [], null))
    expect(prompt).toMatch(/2-3 strong options/)
  })
})

describe("multi-need planning", () => {
  it("one coherent PROPOSE plan with state, goal, no clarification and no extra branches", () => {
    const msg = "I'm hungry af, trained legs, have 700 calories left, want something sweet, high protein, and don't want to cook."
    const { plan: p } = plan(msg, [], {
      strategy: { ...raw().strategy, mode: "PROPOSE", primaryObjective: "recommend a practical food", supportingObjectives: ["satisfy hunger", "sweet", "high protein", "low prep", "fit calories"] },
      need: need({ needAthleteState: true, needFoodLookup: false }),
    })
    expect(p.strategy.mode).toBe("PROPOSE")
    expect(p.strategy.supportingObjectives).toHaveLength(5)
    expect(p.clarification).toBeNull()
    expect(p.contextNeed).toMatchObject({ nutritionState: true, athleteState: true, retrievedKnowledge: false })
  })
})

describe("context / tool decision policy", () => {
  it("educational question: retrieval allowed, no nutrition state, no Athlete State, no food lookup (even if the model over-asks)", () => {
    const { plan: p } = plan("Why does protein help with fullness?", [], { need: need({ needKnowledgeRetrieval: true, needAthleteState: true, needFoodLookup: true }) })
    expect(p.toolNeed).toMatchObject({ needKnowledgeRetrieval: true, needNutritionState: false, needGoalContext: false, needAthleteState: false })
    expect(p.contextNeed).toMatchObject({ athleteState: false, nutritionState: false })
  })

  it("exact state query: nutrition state + deterministic calculation, no retrieval, bound result", () => {
    const { plan: p } = plan("How much protein do I have left today?", [], { need: need({ needExactCalculation: true, needAthleteState: true, needKnowledgeRetrieval: true }) })
    expect(p.toolNeed).toMatchObject({ needNutritionState: true, needMacroCalculation: true, needKnowledgeRetrieval: false, needFoodLookup: false, needGoalContext: false })
    expect(p.toolPlan.steps.map((s) => s.tool)).toEqual(["athlete_state_read", "macro_calculation"])
    const results = runDeterministicTools(p, ctx)
    expect(results.athleteState?.remaining.protein).toBe(54)
    expect(results.athleteState?.goal).toBeNull()
    expect(results.binding).toMatchObject({ source: "DETERMINISTIC_SERVICE", mayRecalculate: false, mayInvent: false, allowedInResponse: true, mayRound: true })
  })

  it("generic recipe: no state by default; retrieval optional", () => {
    const { plan: p } = plan("How can I make protein donuts?", [], { strategy: { ...raw().strategy, mode: "PROPOSE" }, need: need({ needAthleteState: true, needKnowledgeRetrieval: true }) })
    expect(p.toolNeed).toMatchObject({ needNutritionState: false, needAthleteState: false, needKnowledgeRetrieval: true })
  })

  it("'fit exact macros' on a recipe does pull deterministic state", () => {
    const { plan: p } = plan("How can I make protein donuts that fit my macros?", [], { need: need({ needExactCalculation: true, needAthleteState: true }) })
    expect(p.toolNeed.needNutritionState).toBe(true)
  })

  it("simple continuity messages trigger no retrieval, lookup or state even when the model asks for them", () => {
    const asks = need({ needKnowledgeRetrieval: true, needAthleteState: true, needFoodLookup: true })
    for (const [message, recent] of [["yes", [{ role: "coach", text: "Want me to make it sweeter?" }]], ["the second one", [{ role: "coach", text: OPTIONS }]], ["same but cheaper", PICKED], ["without milk", PICKED], ["make it sweeter", PICKED], ["why?", PICKED]] as Array<[string, RecentMessage[]]>) {
      const { plan: p } = plan(message, recent, { understanding: cont, need: asks })
      expect(p.toolNeed, message).toMatchObject({ needKnowledgeRetrieval: false, needFoodLookup: false, needAthleteState: false })
      expect(p.strategy.useTools, message).toEqual([])
    }
  })

  it("ContextNeedDecision and ToolNeedDecision never disagree", () => {
    const variants = [need({}), need({ needExactCalculation: true, needAthleteState: true }), need({ needKnowledgeRetrieval: true }), need({ needActionConfirmation: true }), need({ needFoodLookup: true, needExactCalculation: true, needAthleteState: true })]
    const messages: Array<[string, RecentMessage[]]> = [["yes", [{ role: "coach", text: OFFER }]], ["what should I eat for dinner?", []], ["why does fibre fill me up", []], ["make it bigger", [{ role: "coach", text: OPTIONS }]]]
    for (const n of variants) for (const [m, recent] of messages) {
      const { plan: p } = plan(m, recent, { need: n, foods: [{ text: "chicken breast", grams: 150 }] }, { pendingAction: { kind: "X", name: "y" } })
      expect(checkDecisionConsistency(p.toolNeed, p.contextNeed), m).toEqual([])
    }
  })

  it("macro calculation exposes its deterministic inputs", () => {
    const { plan: p } = plan("fit 150g chicken breast in", [], { need: need({ needExactCalculation: true }), foods: [{ text: "chicken breast", grams: 150 }] })
    expect(p.contextNeed).toMatchObject({ nutritionState: true, resolvedFoodData: true })
  })
})

describe("tool execution plan", () => {
  it("runs food lookup before macro calculation; macro consumes only declared outputs; no duplicate calls", () => {
    const { plan: p } = plan("fit 150g chicken breast in", [], { need: need({ needExactCalculation: true, needAthleteState: true }), foods: [{ text: "chicken breast", grams: 150 }] })
    const steps = p.toolPlan.steps
    expect(steps.map((s) => s.tool)).toEqual(["athlete_state_read", "food_lookup", "macro_calculation"])
    const macro = steps[2]
    expect(macro.inputRefs).toEqual(["FOOD_RESOLUTION", "NUTRITION_STATE"])
    expect(macro.dependsOnStepIds).toEqual([steps[0].stepId, steps[1].stepId])
    expect(new Set(steps.map((s) => s.tool)).size).toBe(steps.length)
    expect(validateToolPlan(p.toolPlan)).toEqual([])
    const results = runDeterministicTools(p, ctx)
    expect(results.executed).toEqual(["step1", "step2", "step3"])
    expect(results.fit?.afterCalories).toBe(520 - results.foods![0].macros!.calories)
  })

  it("a single-tool need does not become a chain", () => {
    expect(buildToolPlan({ needNutritionState: false, needGoalContext: false, needFoodLookup: false, needMacroCalculation: false, needKnowledgeRetrieval: true }).steps).toHaveLength(1)
  })

  it("rejects invalid plans: duplicate calls, wrong order, undeclared consumption", () => {
    const step = (stepId: string, tool: "food_lookup" | "macro_calculation", inputRefs: string[], outputRef: string, dependsOnStepIds: string[] = []) => ({ stepId, tool, inputRefs, outputRef, dependsOnStepIds })
    expect(validateToolPlan({ steps: [step("a", "food_lookup", ["CURRENT_FOOD_REFERENCE"], "FOOD_RESOLUTION"), step("b", "food_lookup", ["CURRENT_FOOD_REFERENCE"], "OTHER")] })).toEqual(expect.arrayContaining([expect.stringMatching(/duplicate tool/)]))
    expect(validateToolPlan({ steps: [step("a", "macro_calculation", ["FOOD_RESOLUTION"], "MACRO_RESULT", ["b"]), step("b", "food_lookup", ["CURRENT_FOOD_REFERENCE"], "FOOD_RESOLUTION")] })).not.toEqual([])
    expect(validateToolPlan({ steps: [step("a", "food_lookup", ["CURRENT_FOOD_REFERENCE"], "FOOD_RESOLUTION"), step("b", "macro_calculation", ["FOOD_RESOLUTION"], "MACRO_RESULT")] })).toEqual(expect.arrayContaining([expect.stringMatching(/without declaring/)]))
  })

  it("a missing dependency output blocks the dependent step and never fabricates an exact answer", () => {
    const { plan: p } = plan("fit 150g chicken breast in", [], { need: need({ needExactCalculation: true, needAthleteState: true }), foods: [{ text: "chicken breast", grams: 150 }] })
    const noState = makeCtx()
    noState.snapshot = { ...noState.snapshot, caloriesRemaining: Number.NaN }
    const results = runDeterministicTools(p, noState)
    expect(results.executed).not.toContain("step3")
    expect(results.blocked).toContain("step3")
    expect(results.exactUnavailable).toBe(true)
    expect(results.fit).toBeUndefined()
    expect(results.binding).toBeUndefined()
  })

  it("the plan contains no mutation tool and never marks an action executed", () => {
    const { plan: p } = plan("that works", [{ role: "coach", text: "Here's the plan." }], { need: need({ needActionConfirmation: true }) })
    expect(p.strategy.requiresConfirmation).toBe(true)
    expect(p.toolNeed.needActionTool).toBe(true)
    expect(JSON.stringify(p)).not.toMatch(/executed|logged"/)
    expect(p.toolPlan.steps.every((s) => ["athlete_state_read", "food_lookup", "macro_calculation", "knowledge_retrieval"].includes(s.tool))).toBe(true)
  })
})

describe("planner confidence", () => {
  it("LOW confidence on an ambiguous reference never guesses: no mutation, clarification, no tools", () => {
    const { plan: p } = plan("make it bigger", [{ role: "coach", text: "Option A: Yogurt bowl\nOption B: Toast" }], { need: need({ confidence: "LOW", needActionConfirmation: true, needExactCalculation: true }), understanding: cont })
    expect(p.strategy.mode).toBe("CLARIFY")
    expect(p.plannerConfidence).toBe("LOW")
    expect(p.strategy.useTools).toEqual([])
    expect(p.clarification).not.toBeNull()
    expect(JSON.stringify(p)).not.toMatch(/"executed"/)
  })

  it("LOW confidence with only a soft referent asks instead of continuing", () => {
    const { plan: p } = plan("without milk", PICKED, { need: need({ confidence: "LOW" }), understanding: cont })
    expect(p.strategy.mode).toBe("CLARIFY")
  })

  it("confidence cannot authorize: HIGH confidence on an action still only requires confirmation", () => {
    const { plan: p } = plan("log it", [{ role: "coach", text: "Here's the plan." }], { need: need({ confidence: "HIGH", needActionConfirmation: true }) })
    expect(p.strategy.requiresConfirmation).toBe(true)
  })
})

describe("context budget", () => {
  const fat = (n: number) => "x".repeat(n)
  const bigTurns: RecentMessage[] = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? ("user" as const) : ("coach" as const), text: fat(300) }))

  it("defaults are explicit and bounded", () => {
    expect(DEFAULT_CONTEXT_LIMITS).toMatchObject({ maxRecentTurns: 4, maxRecentTurnChars: 300, maxStateSections: 2, maxRetrievalChunks: 6, maxRetrievalChars: 5500, maxToolResultChars: 1500, maxTotalContextChars: 8000 })
  })

  it("keeps required context, drops optional by priority, records drops, and is not 'exceeded'", () => {
    const { plan: p, context } = plan("yes", [...bigTurns.slice(0, 5), { role: "coach", text: OFFER }], { understanding: cont, need: need({ needKnowledgeRetrieval: true }) })
    const results = runDeterministicTools(p, ctx)
    const tight = { ...DEFAULT_CONTEXT_LIMITS, maxTotalContextChars: 700 }
    const budget = buildContextBudget(p, context, ctx, results, [{ kind: "LIKE", value: "spicy" }], null, tight)
    expect(budget.included).toEqual(expect.arrayContaining(["hardConstraints", "priorOffer", "athleteState"]))
    expect(budget.context.hardConstraints).toEqual(expect.arrayContaining(["allergy:peanut"]))
    expect(budget.droppedRefs.some((d) => d.reason === "over_budget")).toBe(true)
    expect(budget.exceeded).toBe(false)
    expect(budget.metrics.contextBudgetExceeded).toBe(false)
    expect(budget.metrics.droppedContextCount).toBe(budget.droppedRefs.length)
  })

  it("flags contextBudgetExceeded only when the REQUIRED minimum cannot fit, naming what was lost; safety is never dropped", () => {
    const { plan: p, context } = plan("yes", [{ role: "coach", text: OFFER }], { understanding: cont })
    const results = runDeterministicTools(p, ctx)
    const budget = buildContextBudget(p, context, ctx, results, [], null, { ...DEFAULT_CONTEXT_LIMITS, maxTotalContextChars: 60 })
    expect(budget.exceeded).toBe(true)
    expect(budget.requiredMissing.length).toBeGreaterThan(0)
    expect(budget.included).toContain("hardConstraints")
    expect(budget.context.allergies).toEqual(["peanut"])
  })

  it("retrieval is injected only when planned, and never half-cut", () => {
    const knowledge = "NUTRITION KNOWLEDGE\n\n[MF Curated | Primary]\nT — H\nsome strategy"
    const planned = plan("why does fibre fill me", [], { need: need({ needKnowledgeRetrieval: true }) })
    const withKnowledge = buildContextBudget(planned.plan, planned.context, ctx, runDeterministicTools(planned.plan, ctx), [], knowledge)
    expect(withKnowledge.knowledgeText).toBe(knowledge)
    expect(withKnowledge.metrics.retrievalChunksIncluded).toBe(1)
    const unplanned = plan("same but cheaper", PICKED, { understanding: cont, need: need({ needKnowledgeRetrieval: true }) })
    const without = buildContextBudget(unplanned.plan, unplanned.context, ctx, runDeterministicTools(unplanned.plan, ctx), [], knowledge)
    expect(without.knowledgeText).toBeNull()
    expect(without.droppedRefs).toContainEqual({ ref: "knowledge", reason: "not_needed" })
    const oversized = buildContextBudget(planned.plan, planned.context, ctx, runDeterministicTools(planned.plan, ctx), [], fat(6000))
    expect(oversized.knowledgeText).toBeNull()
  })

  it("older turns are bounded and trimmed; the prompt carries only budgeted turns", () => {
    const { plan: p, context } = plan("something light", bigTurns, {})
    const budget = buildContextBudget(p, context, ctx, runDeterministicTools(p, ctx), [], null)
    expect(budget.turns.length).toBeLessThanOrEqual(4)
    expect(budget.turns.every((t) => t.text.length <= 300)).toBe(true)
    expect(budget.metrics.totalContextChars).toBeLessThanOrEqual(DEFAULT_CONTEXT_LIMITS.maxTotalContextChars)
  })
})

describe("context invalidation and referent TTL", () => {
  const donuts: RecentMessage[] = [{ role: "user", text: "how can I make protein donuts" }, { role: "coach", text: `Bake them with oat flour. ${OFFER}` }]

  it("an explicit topic switch invalidates the donut referent, offer and history; only the new request survives", () => {
    const message = "forget the donuts, what should I eat for dinner?"
    const { context, invalidations } = applyContextLifecycle(message, resolveConversationContext(message, donuts))
    expect(invalidations[0]).toMatchObject({ trigger: "EXPLICIT_NEW_TOPIC" })
    expect(invalidations[0].invalidatedRefs).toEqual(expect.arrayContaining(["priorOffer", "recentTurns"]))
    expect(invalidations[0].retainedRefs).toContain("hardConstraints")
    expect(context.turns).toEqual([])
    expect(context.lastAssistantOffer).toBeNull()
    expect(context.referencedFoods.join(" ")).not.toMatch(/donut/)
    expect(context.mealSlot).toBe("dinner")
  })

  it("stale donut context never reaches the response prompt after a topic switch", () => {
    const message = "forget that, what should I eat for dinner?"
    const { plan: p, context } = plan(message, donuts, { strategy: { ...raw().strategy, mode: "PROPOSE" }, need: need({ needAthleteState: true }) })
    expect(p.contextInvalidations[0].trigger).toBe("EXPLICIT_NEW_TOPIC")
    const budget = buildContextBudget(p, context, ctx, runDeterministicTools(p, ctx), [], null, undefined)
    const prompt = buildResponsePrompt(message, p, context, budget)
    expect(prompt.split("USER:")[0].toLowerCase()).not.toContain("donut")
    expect(p.toolNeed.needNutritionState).toBe(true) // current nutrition state is still available for the new objective
  })

  it("'start over' clears context", () => {
    const { invalidations } = applyContextLifecycle("start over please", resolveConversationContext("start over please", donuts))
    expect(invalidations[0].trigger).toBe("USER_CLEARS_CONTEXT")
  })

  it("an explicit correction is recorded as a contradiction without discarding hard constraints", () => {
    const { invalidations } = applyContextLifecycle("No, I meant dinner", resolveConversationContext("No, I meant dinner", [{ role: "user", text: "lunch idea" }, { role: "coach", text: "Sure." }]))
    expect(invalidations.map((i) => i.trigger)).toContain("CONTRADICTION_DETECTED")
  })

  it("TTL A: a referent inside the turn window resolves normally", () => {
    const { context, invalidations } = applyContextLifecycle("the second one", resolveConversationContext("the second one", [{ role: "coach", text: OPTIONS }]))
    expect(context.selectedOption?.index).toBe(2)
    expect(invalidations).toEqual([])
  })

  it("TTL B: explicit topic change invalidates regardless of time", () => {
    const message = "never mind, something else"
    const { context } = applyContextLifecycle(message, resolveConversationContext(message, [{ role: "coach", text: OPTIONS }]), { followUpExpiredByServerTime: false })
    expect(context.presentedOptions).toEqual([])
  })

  // options, then three unrelated user turns (u,c,u,c,u) = the whole 6-turn read window.
  const stale: RecentMessage[] = [{ role: "coach", text: OPTIONS }, { role: "user", text: "unrelated 0" }, { role: "coach", text: "reply 0" }, { role: "user", text: "unrelated 1" }, { role: "coach", text: "reply 1" }, { role: "user", text: "unrelated 2" }]

  it("TTL C: excessive turn distance expires the pending choice => the pick is no longer resolved", () => {
    // The options are still inside the 6-turn read window, so the TURN TTL (not the window) is what expires them.
    const near = resolveConversationContext("the second one", stale)
    expect(near.presentedOptions.length).toBe(3)
    expect(REFERENT_TTL.pendingChoiceTurns).toBe(2)
    const { context, invalidations } = applyContextLifecycle("the second one", near)
    expect(context.selectedOption).toBeNull()
    expect(invalidations[0]).toMatchObject({ trigger: "TURN_LIMIT_REACHED" })
  })

  it("TTL D: a stale pendingChoice never silently resolves; the turn asks instead", () => {
    const { plan: p } = plan("the second one", stale, { understanding: cont, strategy: { ...raw().strategy, mode: "CONTINUE" } })
    expect(p.strategy.mode).not.toBe("CONTINUE")
    expect(p.strategy.continuationTarget).toBeUndefined()
    expect(p.contextInvalidations[0]?.trigger).toBe("TURN_LIMIT_REACHED")
  })

  it("server-time expiry (secondary) expires option referents; client clock is never read", () => {
    const base = resolveConversationContext("the second one", [{ role: "coach", text: OPTIONS }])
    const { context, invalidations } = applyContextLifecycle("the second one", base, { followUpExpiredByServerTime: true })
    expect(context.presentedOptions).toEqual([])
    expect(invalidations[0]).toMatchObject({ trigger: "REFERENT_EXPIRED", reasonCode: "server_time_ttl" })
  })
})

describe("ambiguity", () => {
  it("equally plausible referents => CLARIFY, no arbitrary guess", () => {
    const { plan: p } = plan("make it bigger", [{ role: "coach", text: "Ideas:\nOption A: Yogurt bowl\nOption B: Toast" }], { understanding: cont })
    expect(p.strategy.mode).toBe("CLARIFY")
    expect(p.strategy.continuationTarget).toBeUndefined()
    expect(p.understanding.referencedOption).toBeNull()
  })
})

describe("multilingual continuity", () => {
  it("'same one bro nhưng lower cal tí' preserves the referent and continues without asking", () => {
    const { plan: p, context } = plan("same one bro nhưng lower cal tí", PICKED, { understanding: cont })
    expect(context.language).toBe("mixed")
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "ACTIVE_MODIFICATION" })
    expect(p.clarification).toBeNull()
  })

  it("'ừ, cái thứ 2 đi nhưng tăng protein lên' resolves option 2 and continues", () => {
    const { plan: p, context } = plan("ừ, cái thứ 2 đi nhưng tăng protein lên", [{ role: "coach", text: OPTIONS }], { understanding: cont })
    expect(context.selectedOption?.index).toBe(2)
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "PENDING_CHOICE" })
    expect(p.clarification).toBeNull()
  })

  it("language normalization does not destroy reference continuity for other Vietnamese follow-ups", () => {
    for (const message of ["cái này bỏ sữa được không?", "giảm calo tí mà vẫn ngon", "thay ức gà bằng cá được không?"]) {
      const { plan: p } = plan(message, PICKED, { understanding: cont })
      expect(p.strategy.mode, message).toBe("CONTINUE")
      expect(p.clarification, message).toBeNull()
    }
  })

  it("'tôi thèm ăn bậy quá' and the sweetener question are standalone: no continuation, no tools unless planned", () => {
    expect(plan("tôi thèm ăn bậy quá", [], {}).plan.strategy.mode).toBe("ANSWER")
    const sweet = plan("đường ăn kiêng với stevia khác gì?", [], { need: need({ needKnowledgeRetrieval: true, needAthleteState: true }) }).plan
    expect(sweet.toolNeed).toMatchObject({ needKnowledgeRetrieval: true, needAthleteState: false })
  })
})

describe("deterministic exactness", () => {
  const exact = () => {
    const { plan: p, context } = plan("fit 150g chicken breast in", [], { need: need({ needExactCalculation: true, needAthleteState: true }), foods: [{ text: "chicken breast", grams: 150 }] })
    const results = runDeterministicTools(p, ctx)
    return { p, context, results, budget: buildContextBudget(p, context, ctx, results, [], null) }
  }

  it("the response context carries the deterministic result and its binding", () => {
    const { budget, results } = exact()
    expect(budget.context.macroBinding).toMatchObject({ mayRecalculate: false, mayInvent: false })
    expect(budget.context.fit).toEqual(results.fit)
  })

  it("a reply that contradicts the deterministic remaining amount is rejected; the exact one passes", async () => {
    const { p, context, results, budget } = exact()
    const kcal = results.foods![0].macros!.calories
    const ok = `That's ${kcal} kcal, leaving ${results.fit!.afterCalories} kcal left today.`
    const bad = `That's ${kcal} kcal, leaving 111 kcal left today.`
    const run = (reply: string) => composeReply({ message: "fit 150g chicken breast in", plan: p, context, ctx, results, budget, knowledgeText: null, call: async () => reply })
    expect((await run(ok))?.reply).toBe(ok)
    expect(await run(bad)).toBeNull()
    expect(contradictsBinding(bad, results)).toBe(true)
    expect(contradictsBinding(ok, results)).toBe(false)
  })

  it("unavailable deterministic output: exact values are not fabricated and the model is told so", async () => {
    const { plan: p, context } = plan("fit 150g donuts in", [], { need: need({ needExactCalculation: true, needAthleteState: true }), foods: [{ text: "donuts", grams: 150 }] })
    const results = runDeterministicTools(p, ctx)
    expect(results.exactUnavailable).toBe(true)
    const budget = buildContextBudget(p, context, ctx, results, [], null)
    expect(budget.context.exactCalculation).toBe("UNAVAILABLE")
    const fabricated = await composeReply({ message: "fit 150g donuts in", plan: p, context, ctx, results, budget, knowledgeText: null, call: async () => "A donut like that is about 612 kcal and 7g protein." })
    expect(fabricated).toBeNull()
    const honest = await composeReply({ message: "fit 150g donuts in", plan: p, context, ctx, results, budget, knowledgeText: null, call: async () => "I don't have verified data for donuts, so the exact calculation isn't available." })
    expect(honest?.reply).toMatch(/isn't available/)
  })
})

describe("safety screen (planner level)", () => {
  const cases: Array<[string, string, "ESCALATE" | "SAFE_REDIRECT" | "REFUSE_POLICY"]> = [
    ["yes but I'm having chest pain", "chest_pain", "ESCALATE"],
    ["yes but my chest hurts", "chest_pain", "ESCALATE"],
    ["I want to eat only 800 calories.", "extreme_restriction", "SAFE_REDIRECT"],
    ["I haven't eaten in 3 days.", "prolonged_fasting", "ESCALATE"],
    ["How can I hide vomiting after eating?", "purging", "REFUSE_POLICY"],
    ["I'm pregnant, what should I eat?", "pregnancy", "ESCALATE"],
    ["I have diabetes, can I eat donuts?", "diabetes", "ESCALATE"],
    ["I have kidney disease, how much protein can I eat?", "kidney", "ESCALATE"],
    ["Can I take metformin with a high protein diet?", "medication", "ESCALATE"],
    ["I'm allergic to peanuts, add peanut butter.", "allergy_conflict", "REFUSE_POLICY"],
    ["tôi bị tiểu đường ăn gì", "diabetes", "ESCALATE"],
    ["tôi đang mang thai nên ăn gì", "pregnancy", "ESCALATE"],
    ["ngực tôi đau quá", "chest_pain", "ESCALATE"],
  ]
  for (const [message, kind, mode] of cases) {
    it(`${kind}: ${message}`, () => {
      expect(screenSafety(message)).toMatchObject({ kind, mode })
    })
  }

  it("does not fire on ordinary nutrition messages (no false positives on budgets, chest workouts, negated allergens)", () => {
    for (const m of ["I have 700 calories left for dinner", "only 500 calories left today", "make it under 400 calories", "chest day tomorrow, what should I eat before?", "I'm allergic to peanuts, no peanut butter please", "yes", "I haven't eaten since lunch", "same but cheaper", "protein donut recipe"]) {
      expect(screenSafety(m), m).toBeNull()
    }
  })

  it("every safety reply honours the response contract: concern, no continuation, no prescription numbers, professional pointer", () => {
    expect(Object.values(SAFETY_RESPONSE_CONTRACT).every(Boolean)).toBe(true)
    for (const [message] of cases) {
      const screen = screenSafety(message)!
      const reply = safetyReply(screen, message)
      expect(reply, message).not.toMatch(/\d/)
      expect(reply, message).not.toMatch(/macros?\b|fit (?:it|that)|remaining|per day|grams?/i)
      if (screen.kind !== "allergy_conflict" && screen.kind !== "extreme_restriction") expect(reply, message).toMatch(/doctor|dietitian|pharmacist|emergency|midwife|bác sĩ|dược sĩ|cấp cứu|chuyên gia/i)
      if (screen.kind === "allergy_conflict") expect(reply.toLowerCase()).toContain("peanut")
    }
  })

  it("Vietnamese messages get Vietnamese replies", () => {
    expect(safetyReply(screenSafety("tôi bị tiểu đường ăn gì")!, "tôi bị tiểu đường ăn gì")).toMatch(/đường huyết/)
  })

  it("profile allergens are screened when the user asks to add them", () => {
    expect(screenSafety("add peanuts to it", { allergies: ["peanut"] })).toMatchObject({ kind: "allergy_conflict" })
    expect(screenSafety("no peanuts please", { allergies: ["peanut"] })).toBeNull()
  })
})

describe("fallback hierarchy", () => {
  const offer: RecentMessage[] = [{ role: "coach", text: OFFER }]
  const good = JSON.stringify(raw())

  it("stage 1: one reduced retry recovers a malformed first answer (2 planner calls, no loop)", async () => {
    let calls = 0
    const outcome = await orchestrateTurn({ message: "yes", recent: offer, ctx, call: async () => (++calls === 1 ? "not json" : good) })
    expect(calls).toBe(2)
    expect(outcome).toMatchObject({ kind: "plan", plannerCalls: 2, fallbackStage: 1 })
  })

  it("never retries more than once", async () => {
    let calls = 0
    await orchestrateTurn({ message: "what should I snack on", recent: [], ctx, call: async () => (++calls, "junk") })
    expect(calls).toBe(2)
  })

  it("invalid response mode => retry, then existing path (stage 3) when nothing deterministic applies", async () => {
    const bad = JSON.stringify(raw({ strategy: { ...raw().strategy, mode: "TELEPORT" } }))
    const outcome = await orchestrateTurn({ message: "what should I snack on", recent: [], ctx, call: async () => bad })
    expect(outcome).toMatchObject({ kind: "fallback", diagnostics: { fallbackReason: "invalid_plan", fallbackStage: 3, plannerCalls: 2, degradedCapabilities: ["adaptive_planning"] } })
  })

  it("stage 2: a transient planner failure on 'yes' uses validated deterministic understanding (CONTINUE/PRIOR_OFFER)", async () => {
    const outcome = await orchestrateTurn({ message: "yes", recent: offer, ctx, call: async () => null })
    expect(outcome).toMatchObject({ kind: "plan", fallbackStage: 2 })
    if (outcome.kind === "plan") {
      expect(outcome.plan.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "PRIOR_OFFER" })
      expect(outcome.plan.fallbackUsed).toBe(true)
      expect(outcome.plan.plannerFailureReason).toBe("model_failed")
      expect(outcome.plan.strategy.requiresConfirmation).toBe(false)
    }
  })

  it("stage 4: deterministic evidence of an ambiguous referent asks one safe clarification without a model", async () => {
    const outcome = await orchestrateTurn({ message: "make it bigger", recent: [{ role: "coach", text: OPTIONS }], ctx, call: async () => null })
    expect(outcome).toMatchObject({ kind: "plan", fallbackStage: 4 })
    if (outcome.kind === "plan") expect(outcome.plan.strategy.mode).toBe("CLARIFY")
  })

  it("a throwing planner is contained", async () => {
    expect(await orchestrateTurn({ message: "yes", recent: offer, ctx, call: async () => { throw new Error("boom") } })).toMatchObject({ kind: "fallback", diagnostics: { fallbackReason: "error" } })
  })

  it("deterministic understanding never invents an action or a retrieval", () => {
    const resolved = resolveConversationContext("yes", offer)
    const out = deterministicPlannerOutput("yes", resolved, {})!
    expect(out.need).toMatchObject({ needActionConfirmation: false, needKnowledgeRetrieval: false })
  })

  it("diagnostics stay privacy-safe: no text fields", async () => {
    const outcome = await orchestrateTurn({ message: "yes please, donuts", recent: offer, ctx, call: async () => null })
    const json = JSON.stringify(outcome.kind === "fallback" ? outcome.diagnostics : { plan: outcome.plan.contextInvalidations })
    expect(json).not.toMatch(/donut/i)
  })
})
