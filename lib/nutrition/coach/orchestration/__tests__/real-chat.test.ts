import { describe, expect, it, vi } from "vitest"

import { makeCtx } from "../../__tests__/fixtures"
import { buildContextBudget } from "../budget"
import { resolveConversationContext, statedBudgetOf } from "../context"
import { resolveContinuation } from "../continuation"
import { applyContextLifecycle } from "../lifecycle"
import { buildPlan } from "../plan"
import { deriveActiveEntity, groundEntities, hasProvenance, resolveFocusOwner } from "../provenance"
import { buildResponsePrompt, composeReply, contradictsBinding, replyViolations } from "../respond"
import { runDeterministicTools } from "../tools"
import type { ActiveEntityReference, PlanningExtras, RecentMessage } from "../types"
import { validatePlannerOutput } from "../validate"

/**
 * Real-chat regressions RC-01 .. RC-08 (N1.6.4 Phase 2 resume). Every case is a failure observed in a manual chat,
 * reproduced at the layer that owns the invariant. The end-to-end sequence lives in
 * app/api/chatbot/__tests__/nutrition-real-chat-regressions.test.ts.
 */

const FIRST_ASK = "I’ve got about 620 calories left today. I’m really hungry after training, want something sweet, at least 35g protein, no peanut butter, and I seriously don’t want to cook. Give me 3 options."
const LIST = "Here are 3 options:\n1. Greek Yogurt Bowl\n2. Protein Shake\n3. Cottage Cheese Delight\nWhich one?"
const AFTER_ASK: RecentMessage[] = [{ role: "user", text: FIRST_ASK }, { role: "coach", text: LIST }]
const AFTER_PICK: RecentMessage[] = [...AFTER_ASK, { role: "user", text: "option 2" }, { role: "coach", text: "Protein shake it is." }]

const guards = { allergies: ["peanut"], excludedFoods: [] as string[] }
const stateCtx = makeCtx({ caloriesRemaining: 520, proteinRemaining: 54, allergies: ["peanut"] })

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
const cont = { ...raw().understanding, continuationOfPreviousTurn: true }
const need = (patch: Record<string, unknown>) => ({ ...raw().need, ...patch })

function plan(message: string, recent: RecentMessage[], overrides: Record<string, unknown> = {}, extras: PlanningExtras = {}, athleteStateAvailable = true) {
  const resolved = resolveConversationContext(message, recent)
  const { context, invalidations } = applyContextLifecycle(message, resolved, extras)
  const validated = validatePlannerOutput(raw(overrides), context)
  if (!validated.ok) throw new Error(validated.reason)
  return { context, plan: buildPlan(validated.value, context, guards, { athleteStateAvailable, message, extras, invalidations }) }
}

const STALE_DRAFT: PlanningExtras = { hasActiveDraft: true, activeDraftName: "High-Protein Tofu Bread Bowl", currentTopicFood: "High-Protein Tofu Bread Bowl" }

async function compose(p: ReturnType<typeof plan>, message: string, replies: string[], results = runDeterministicTools(p.plan, stateCtx)) {
  const call = vi.fn(async () => replies.shift() ?? null)
  const budget = buildContextBudget(p.plan, p.context, stateCtx, results, [], null)
  const composed = await composeReply({ message, plan: p.plan, context: p.context, ctx: stateCtx, results, budget, knowledgeText: null, call })
  return { composed, call, budget }
}

describe("RC-01 selecting a recommendation is not a state mutation", () => {
  it("'the second one' never requires confirmation, even when the planner asks for it", () => {
    const { plan: p } = plan("the second one", AFTER_ASK, { understanding: cont, need: need({ needActionConfirmation: true }), strategy: { ...raw().strategy, mode: "CONTINUE", requiresConfirmation: true } })
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "PENDING_CHOICE", requiresConfirmation: false })
    expect(p.toolNeed.needActionTool).toBe(false)
  })

  it("a real mutation request keeps its confirmation boundary", () => {
    const { plan: p } = plan("the second one, log it", AFTER_ASK, { understanding: cont, need: need({ needActionConfirmation: true }), strategy: { ...raw().strategy, mode: "CONTINUE", requiresConfirmation: true } })
    expect(p.strategy.requiresConfirmation).toBe(true)
    expect(p.toolNeed.needActionTool).toBe(true)
  })

  it("a reply that asks to 'confirm this choice' is repaired once, then used", async () => {
    const p = plan("option 2", AFTER_ASK, { understanding: cont })
    const { composed, call } = await compose(p, "option 2", ["Great pick! Do you want to confirm this choice?", "Protein Shake it is — a quick, no-cook pick."])
    expect(call).toHaveBeenCalledTimes(2)
    expect(composed?.reply).toBe("Protein Shake it is — a quick, no-cook pick.")
  })
})

describe("RC-02 active constraints survive select -> modify -> recipe", () => {
  it("the first message's constraints are extracted as constraints, not left in free text", () => {
    const context = resolveConversationContext("option 2", AFTER_ASK)
    expect(context.activeConstraints).toEqual(expect.arrayContaining(["low_prep", "without:peanut butter", "min_protein:35", "taste:sweet"]))
  })

  it("they are still active, and still hard constraints, on the recipe turn", () => {
    const { context, plan: p } = plan("give me the recipe", AFTER_PICK, { understanding: cont })
    expect(context.activeConstraints).toEqual(expect.arrayContaining(["low_prep", "without:peanut butter"]))
    expect(p.hardConstraints).toEqual(expect.arrayContaining(["low_prep", "without:peanut butter", "min_protein:35", "allergy:peanut"]))
    const prompt = buildResponsePrompt("give me the recipe", p, context, buildContextBudget(p, context, stateCtx, runDeterministicTools(p, stateCtx), [], null))
    expect(prompt).toContain("low_prep")
  })

  it("a user can lift a constraint explicitly; nothing else is dropped", () => {
    const lifted = resolveConversationContext("ok", [...AFTER_PICK, { role: "user", text: "actually I can cook tonight" }, { role: "coach", text: "Great." }])
    expect(lifted.activeConstraints).not.toContain("low_prep")
    expect(lifted.activeConstraints).toContain("without:peanut butter")
  })

  it("a baked 20-25 minute recipe is not returned for a no-cook request: one repair, then a no-cook reply", async () => {
    const p = plan("give me the recipe", AFTER_PICK, { understanding: cont })
    const { composed, call } = await compose(p, "give me the recipe", ["Bake at 180C for 20-25 minutes in the oven.", "No cooking needed: blend whey, milk and ice for 30 seconds."])
    expect(call).toHaveBeenCalledTimes(2)
    expect(composed?.reply).toMatch(/No cooking needed/)
  })

  it("a conflict that is acknowledged is allowed through without a repair", async () => {
    const p = plan("give me the recipe", AFTER_PICK, { understanding: cont })
    const { composed, call } = await compose(p, "give me the recipe", ["You don't want to cook, so skip the oven: blend whey, milk and ice."])
    expect(call).toHaveBeenCalledTimes(1)
    expect(composed?.reply).toMatch(/skip the oven/)
  })

  it("if the repair still breaks the constraint the model reply is not used", async () => {
    const p = plan("give me the recipe", AFTER_PICK, { understanding: cont })
    const { composed } = await compose(p, "give me the recipe", ["Bake it for 20 minutes.", "Roast it for 25 minutes."])
    expect(composed).toBeNull()
  })
})

describe("RC-03 'option 2' maps to the option actually displayed", () => {
  it.each([["option 2"], ["the second one"], ["cái thứ 2"]])("%s -> PENDING_CHOICE, Protein Shake, despite a stale unrelated draft", (message) => {
    const { context, plan: p } = plan(message, AFTER_ASK, { understanding: cont }, STALE_DRAFT)
    expect(context.selectedOption?.text).toBe("Protein Shake")
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "PENDING_CHOICE" })
    expect(p.understanding.referencedOption).toBe(2)
    expect(p.activeEntity).toMatchObject({ label: "Protein Shake", sourceType: "ASSISTANT_DISPLAYED_OPTION", sourceRef: "turn:1#2" })
    expect(JSON.stringify(p)).not.toMatch(/Tofu/i)
  })

  it("the response context carries the chosen option and nothing from the stale draft", () => {
    const { context, plan: p } = plan("option 2", AFTER_ASK, { understanding: cont }, STALE_DRAFT)
    const budget = buildContextBudget(p, context, stateCtx, runDeterministicTools(p, stateCtx), [], null)
    expect(budget.context.chosenOption).toMatchObject({ text: "Protein Shake" })
    expect(budget.context.activeItem).toBe("Protein Shake")
    expect(JSON.stringify(budget)).not.toMatch(/Tofu/i)
  })

  it("who owns the focus: the coach's own list beats the engine's stale options; the engine's list still wins when it is the one shown", () => {
    const engine = { names: ["High-Protein Tofu Bread Bowl", "High-Protein Tuna Wrap Bowl"], optionLabels: ["High-Protein Tuna Wrap Bowl", "High-Protein Tofu Bread Bowl", "High-Protein Cottage Cheese Oats Bowl"] }
    expect(resolveFocusOwner([{ role: "user", text: FIRST_ASK }, { role: "coach", text: LIST }, { role: "user", text: "option 2" }], engine)).toBe("CONVERSATION")
    const engineList = "Options:\n1. High-Protein Tuna Wrap Bowl\n2. High-Protein Tofu Bread Bowl\n3. High-Protein Cottage Cheese Oats Bowl"
    expect(resolveFocusOwner([{ role: "coach", text: engineList }, { role: "user", text: "option 2" }], engine)).toBe("ENGINE")
    expect(resolveFocusOwner([{ role: "coach", text: "High-Protein Tuna Wrap Bowl: about 588 kcal." }, { role: "user", text: "cheaper" }], engine)).toBe("ENGINE")
    expect(resolveFocusOwner([{ role: "coach", text: "Hello!" }, { role: "user", text: "hi" }], engine)).toBe("ENGINE")
  })
})

describe("RC-04 a modification stays on the selected item", () => {
  it("'make it cheaper and keep the protein about the same' -> ACTIVE_MODIFICATION of Protein Shake, not the stale draft", () => {
    const message = "but make it cheaper and keep the protein about the same."
    const { plan: p } = plan(message, AFTER_PICK, { understanding: cont }, STALE_DRAFT)
    expect(p.strategy).toMatchObject({ mode: "CONTINUE", continuationTarget: "ACTIVE_MODIFICATION", requiresConfirmation: false })
    expect(p.activeEntity).toMatchObject({ label: "Protein Shake", sourceType: "ASSISTANT_DISPLAYED_OPTION" })
  })

  it("a reply that jumps to a different presented option is rejected", () => {
    const { context, plan: p } = plan("but make it cheaper", AFTER_PICK, { understanding: cont })
    expect(replyViolations("Swap the Greek Yogurt Bowl toppings for something cheaper.", p, context, "but make it cheaper").join(" ")).toMatch(/chosen item/)
    expect(replyViolations("Use plain whey and water instead of the premium blend.", p, context, "but make it cheaper")).toEqual([])
  })

  it("comparison questions are exempt from the drift guard", () => {
    const { context, plan: p } = plan("how is it different from the Greek Yogurt Bowl?", AFTER_PICK, { understanding: cont })
    expect(replyViolations("The Greek Yogurt Bowl has more carbs than the shake.", p, context, "how is it different from the Greek Yogurt Bowl? compare them")).toEqual([])
  })
})

describe("RC-05 exact macros stay bound to a deterministic result", () => {
  const exact = { need: need({ needExactCalculation: true, needFoodLookup: true }), foods: [{ text: "chicken breast", grams: 150 }] }

  it("the same active calculation yields the same calculationId and values every time", () => {
    const a = runDeterministicTools(plan("fit 150g chicken breast in", [], exact).plan, stateCtx)
    const b = runDeterministicTools(plan("fit 150g chicken breast in", [], exact).plan, stateCtx)
    expect(a.binding?.calculationId).toBe(b.binding?.calculationId)
    expect(a.numbers).toEqual(b.numbers)
    expect(a.binding).toMatchObject({ source: "DETERMINISTIC_SERVICE", mayRecalculate: false, mayInvent: false })
  })

  it("changing the portion produces a NEW calculationId and new values (never a silent mutation)", () => {
    const a = runDeterministicTools(plan("fit 150g chicken breast in", [], exact).plan, stateCtx)
    const b = runDeterministicTools(plan("fit 200g chicken breast in", [], { ...exact, foods: [{ text: "chicken breast", grams: 200 }] }).plan, stateCtx)
    expect(b.binding?.calculationId).not.toBe(a.binding?.calculationId)
    expect(b.foods?.[0].macros?.calories).toBeGreaterThan(a.foods![0].macros!.calories)
  })

  it("an earlier ~589 kcal / 44g cannot silently become ~489 kcal / 45g without a new deterministic result", async () => {
    const earlier: RecentMessage[] = [{ role: "user", text: "give me a bowl" }, { role: "coach", text: "Bowl: about 589 kcal and 44g protein." }]
    const p = plan("make it a bit lighter", earlier, { understanding: cont })
    const { composed } = await compose(p, "make it a bit lighter", ["Now it is about 489 kcal and 45g protein."])
    expect(composed).toBeNull() // 489 / 45 appear in no tool result, message or earlier turn: ungrounded
    const kept = await compose(p, "make it a bit lighter", ["Same bowl, about 589 kcal and 44g protein, just a smaller portion of rice."])
    expect(kept.composed?.reply).toMatch(/589 kcal/)
  })

  it("no calculation available => no exact numbers are fabricated", () => {
    const p = plan("how much do I have left?", [], { need: need({ needExactCalculation: true, needAthleteState: true }) }, {}, false)
    const results = runDeterministicTools(p.plan, makeCtx({ caloriesRemaining: Number.NaN, proteinRemaining: Number.NaN }))
    expect(results.exactUnavailable).toBe(true)
    expect(results.binding).toBeUndefined()
    expect(results.numbers).toEqual([])
  })
})

describe("RC-06 an explicit correction beats prior state", () => {
  const CORRECTION = "Wait, I meant 620 calories is what I’ve already eaten, not what I have left."
  const history: RecentMessage[] = [{ role: "user", text: FIRST_ASK }, { role: "coach", text: LIST }]

  it("invalidates remaining=620 and records consumed=620", () => {
    expect(statedBudgetOf([FIRST_ASK]).remainingCalories).toBe(620)
    expect(statedBudgetOf([FIRST_ASK, CORRECTION])).toEqual({ remainingCalories: null, consumedCalories: 620, invalidatedRemaining: 620 })
    const context = resolveConversationContext(CORRECTION, history)
    expect(context.statedBudget).toEqual({ remainingCalories: null, consumedCalories: 620, invalidatedRemaining: 620 })
    expect(applyContextLifecycle(CORRECTION, context).invalidations[0]).toMatchObject({ trigger: "CONTRADICTION_DETECTED", invalidatedRefs: expect.arrayContaining(["remainingCalories"]) })
  })

  it("an unrelated '620 calories eaten' is not a retraction", () => {
    expect(statedBudgetOf([FIRST_ASK, "I’ve eaten 620 calories so far"]).invalidatedRemaining).toBeNull()
  })

  it("Vietnamese correction works the same way", () => {
    expect(statedBudgetOf(["Mình còn lại 620 calo", "Nhầm rồi, 620 calo là mình đã ăn rồi, không phải còn lại"])).toMatchObject({ remainingCalories: null, consumedCalories: 620, invalidatedRemaining: 620 })
  })

  it("with trusted state the remaining amount is recomputed deterministically from state, not from the user's number", async () => {
    const p = plan(CORRECTION, history, { understanding: cont }, {}, true)
    expect(p.plan.toolNeed).toMatchObject({ needMacroCalculation: true, needNutritionState: true, needKnowledgeRetrieval: false })
    const results = runDeterministicTools(p.plan, stateCtx)
    expect(results.athleteState?.remaining).toEqual({ calories: 520, protein: 54 })
    expect(results.binding?.source).toBe("DETERMINISTIC_SERVICE")
    const budget = buildContextBudget(p.plan, p.context, stateCtx, results, [], null)
    expect(budget.context.userCorrection).toMatchObject({ retracted: "remainingCalories=620", recorded: "consumedCalories=620" })
    // the old assumption cannot come back as "what is left"; the trusted number can
    expect((await compose(p, CORRECTION, ["You have 620 calories left, so we have room for a big bowl."], results)).composed).toBeNull()
    expect((await compose(p, CORRECTION, ["Got it, 620 eaten so far. You have 520 calories left today."], results)).composed?.reply).toMatch(/520 calories left/)
    expect(contradictsBinding("620 calories left", { ...results, binding: undefined }, [620], 620)).toBe(true)
  })

  it("without trusted state nothing is fabricated: one material question, no tools", async () => {
    const p = plan(CORRECTION, history, { understanding: cont }, {}, false)
    expect(p.plan.strategy.mode).toBe("ASK_ONE_QUESTION")
    expect(p.plan.clarification).toMatchObject({ affects: "calculation" })
    expect(p.plan.clarification!.question).toMatch(/calorie target/i)
    expect(p.plan.strategy.useTools).toEqual([])
    const { composed, call } = await compose(p, CORRECTION, [])
    expect(call).not.toHaveBeenCalled()
    expect(composed?.source).toBe("question")
  })

  it("the correction does not wipe unrelated constraints", () => {
    expect(resolveConversationContext(CORRECTION, history).activeConstraints).toEqual(expect.arrayContaining(["low_prep", "without:peanut butter"]))
  })
})

describe("RC-07 'the other one' with several referents => CLARIFY, never a guess", () => {
  it.each([
    ["ANSWER", raw()],
    ["CONTINUE", { understanding: cont, strategy: { ...raw().strategy, mode: "CONTINUE" } }],
  ])("planner says %s", async (_label, overrides) => {
    const p = plan("Make the other one bigger.", AFTER_PICK, overrides)
    expect(p.context.otherReference).toBe(true)
    expect(p.context.referentCandidates).toEqual(["1", "3"])
    expect(resolveContinuation("Make the other one bigger.", p.context, {}, true)).toBeNull()
    expect(p.plan.strategy.mode).toBe("CLARIFY")
    expect(p.plan.strategy.continuationTarget).toBeUndefined()
    expect(p.plan.clarification?.question).toBe("Which one do you mean: Greek Yogurt Bowl or Cottage Cheese Delight?")
    const { composed, call } = await compose(p, "Make the other one bigger.", ["High-Protein Tuna Wrap Bowl, bigger."])
    expect(call).not.toHaveBeenCalled() // the deterministic question is the whole reply: no entity can be invented
    expect(composed?.reply).not.toMatch(/Tuna/)
  })

  it("exactly one option left => 'the other one' resolves to it (no question needed)", () => {
    const two: RecentMessage[] = [{ role: "coach", text: "Pick:\n1. Greek Yogurt Bowl\n2. Protein Shake" }, { role: "user", text: "option 2" }, { role: "coach", text: "Shake it is." }]
    const { context, plan: p } = plan("Make the other one bigger.", two, { understanding: cont })
    expect(context.selectedOption?.text).toBe("Greek Yogurt Bowl")
    expect(p.strategy.mode).toBe("CONTINUE")
    expect(p.activeEntity?.label).toBe("Greek Yogurt Bowl")
  })
})

describe("RC-08 no active entity without valid provenance", () => {
  const FAKE: ActiveEntityReference = { entityId: "opt:2:high-protein-tuna-wrap-bowl", label: "High-Protein Tuna Wrap Bowl", sourceType: "ASSISTANT_DISPLAYED_OPTION", sourceRef: "turn:1#2", createdTurn: 1, lastValidatedTurn: 0 }

  it("a derived entity re-resolves against the conversation it came from", () => {
    const context = resolveConversationContext("option 2", AFTER_ASK)
    const entity = deriveActiveEntity("option 2", context, STALE_DRAFT)!
    expect(entity.sourceRef).toBe("turn:1#2")
    expect(hasProvenance(entity, "option 2", context, STALE_DRAFT)).toBe(true)
  })

  it("an invented dish has no source and is rejected", () => {
    const context = resolveConversationContext("make the other one bigger", AFTER_ASK)
    expect(hasProvenance(FAKE, "make the other one bigger", context, {})).toBe(false)
    expect(hasProvenance({ ...FAKE, sourceType: "USER_MESSAGE", sourceRef: "message" }, "make it bigger", context, {})).toBe(false)
    expect(hasProvenance({ ...FAKE, sourceType: "ACTIVE_DRAFT", sourceRef: "draft" }, "x", context, { hasActiveDraft: true, activeDraftName: "Chicken Plate" })).toBe(false)
    expect(hasProvenance({ ...FAKE, sourceType: "TOOL_RESULT", sourceRef: "tool" }, "x", context, {}, ["rice"])).toBe(false)
  })

  it("planner-named entities and foods with no conversational support are dropped and reported", () => {
    const { plan: p } = plan("option 2", AFTER_ASK, {
      understanding: { ...cont, referencedEntities: ["Protein Shake", "High-Protein Tuna Wrap Bowl"] },
      foods: [{ text: "High-Protein Tuna Wrap Bowl", grams: 300 }],
    })
    expect(p.understanding.referencedEntities).toEqual(["Protein Shake"])
    expect(p.rejectedEntities).toEqual(expect.arrayContaining(["High-Protein Tuna Wrap Bowl"]))
    expect(p.foods).toEqual([])
    expect(groundEntities(["Cottage Cheese Delight"], "x", resolveConversationContext("x", AFTER_ASK)).kept).toEqual(["Cottage Cheese Delight"])
  })

  it("a modification of 'it' with nothing to point at does not invent a referent", () => {
    const { plan: p } = plan("make it bigger", [{ role: "coach", text: "Hello! How can I help?" }, { role: "user", text: "hi" }, { role: "coach", text: "What are you hungry for?" }], { understanding: cont })
    expect(p.activeEntity).toBeNull()
    expect(p.strategy.continuationTarget).not.toBe("ACTIVE_MODIFICATION")
  })

  it("a stale server-side draft is a valid source only for the draft's own name", () => {
    const context = resolveConversationContext("make it sweeter", [{ role: "coach", text: "Here's a bowl." }])
    const entity = deriveActiveEntity("make it sweeter", context, STALE_DRAFT)!
    expect(entity).toMatchObject({ sourceType: "ACTIVE_DRAFT", label: "high-protein tofu bread bowl" })
    expect(hasProvenance(entity, "make it sweeter", context, { hasActiveDraft: false })).toBe(false)
  })
})
