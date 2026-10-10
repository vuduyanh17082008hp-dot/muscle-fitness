import { describe, expect, it } from "vitest"

import {
  FOLLOW_UP_IDLE_MS,
  FOLLOW_UP_TURN_LIMIT,
  classifyFollowUp,
  detectExplicitNewTopic,
  isFollowUpLive,
  matchMeals,
  nextFollowUpState,
  normalizeMessage,
  resolveTurn,
  toMealResultReference,
  type FollowUpState,
  type MealResultState,
} from "../followup"

const NOW = new Date("2026-10-07T10:00:00Z")
const meal = (id: string, name: string, items: MealResultState["items"]): MealResultState => ({ id, name, items, source: "meal_builder", createdAt: NOW.toISOString() })
const TUNA = meal("tuna-1", "High-Protein Tuna Wrap Bowl", [{ ingredientId: "tuna", grams: 150 }, { ingredientId: "wraps", grams: 60 }])
const CHICKEN = meal("chicken-1", "Chicken & Rice Plate", [{ ingredientId: "chicken_breast", grams: 150 }, { ingredientId: "rice", grams: 180 }])
const YOGURT = meal("yogurt-1", "Greek Yogurt Berry Bowl", [{ ingredientId: "greek_yogurt", grams: 200 }, { ingredientId: "berries", grams: 80 }])

const live = (patch: Partial<FollowUpState> = {}): FollowUpState => ({
  ...nextFollowUpState(null, { upsertMeals: [TUNA], referent: { type: "MEAL_RESULT", id: TUNA.id, name: TUNA.name }, newReferent: true }, NOW)!,
  ...patch,
})

describe("normalization (bilingual, small vocabulary)", () => {
  it.each([
    ["Detailed ingredients?", "detailed ingredients"],
    ["nguyên liệu?", "ingredients"],
    ["chi tiết nguyên liệu?", "detailed ingredients"],
    ["bao nhiêu tuna?", "how much tuna"],
    ["cheaper không?", "cheaper"],
    ["rẻ hơn được không?", "cheaper"],
    ["thay chicken được không?", "replace chicken"],
    ["bỏ rice đi", "remove rice"],
    ["thêm avocado", "add avocado"],
    ["cái thứ 2", "second one"],
    ["option 2 đi", "option 2"],
    ["tại sao món này?", "why this"],
    ["ok, macros?", "macros"],
  ])("%s -> %s", (raw, expected) => expect(normalizeMessage(raw)).toBe(expected))
})

describe("fast follow-up classification", () => {
  const cases: Array<[string, string]> = [
    ["ingredients", "SHOW_INGREDIENTS"], ["ingredients?", "SHOW_INGREDIENTS"], ["detailed ingredients", "SHOW_INGREDIENTS"], ["ingredient list", "SHOW_INGREDIENTS"], ["what's in it", "SHOW_INGREDIENTS"], ["what is in this", "SHOW_INGREDIENTS"], ["nguyên liệu?", "SHOW_INGREDIENTS"], ["chi tiết nguyên liệu?", "SHOW_INGREDIENTS"],
    ["macros", "SHOW_MACROS"], ["macros?", "SHOW_MACROS"], ["calories?", "SHOW_MACROS"], ["protein?", "SHOW_MACROS"], ["carbs?", "SHOW_MACROS"], ["fat?", "SHOW_MACROS"], ["bao nhiêu protein?", "SHOW_MACROS"],
    ["why?", "EXPLAIN_RECOMMENDATION"], ["why this?", "EXPLAIN_RECOMMENDATION"], ["why this one?", "EXPLAIN_RECOMMENDATION"], ["tại sao món này?", "EXPLAIN_RECOMMENDATION"],
    ["how much tuna?", "SHOW_PORTIONS"], ["how much rice?", "SHOW_PORTIONS"], ["what sauce?", "SHOW_PORTIONS"], ["bao nhiêu tuna?", "SHOW_PORTIONS"],
    ["cheaper?", "MODIFY_PREVIOUS_RESULT"], ["more filling?", "MODIFY_PREVIOUS_RESULT"], ["more protein?", "MODIFY_PREVIOUS_RESULT"], ["less calories?", "MODIFY_PREVIOUS_RESULT"], ["cheaper không?", "MODIFY_PREVIOUS_RESULT"], ["rẻ hơn được không?", "MODIFY_PREVIOUS_RESULT"],
    ["first one", "SELECT_PREVIOUS_OPTION"], ["second one", "SELECT_PREVIOUS_OPTION"], ["third one", "SELECT_PREVIOUS_OPTION"], ["option 1", "SELECT_PREVIOUS_OPTION"], ["option 2", "SELECT_PREVIOUS_OPTION"], ["the tuna one", "SELECT_PREVIOUS_OPTION"], ["cái thứ 2", "SELECT_PREVIOUS_OPTION"], ["option 2 đi", "SELECT_PREVIOUS_OPTION"], ["that one", "SELECT_PREVIOUS_OPTION"],
    ["can I use chicken instead?", "SUBSTITUTE_IN_PREVIOUS_RESULT"], ["thay chicken được không?", "SUBSTITUTE_IN_PREVIOUS_RESULT"],
    ["add avocado", "ADD_INGREDIENT"], ["thêm avocado", "ADD_INGREDIENT"], ["add peanuts", "ADD_INGREDIENT"],
    ["remove rice", "REMOVE_INGREDIENT"], ["bỏ rice đi", "REMOVE_INGREDIENT"],
    ["less rice", "ADJUST_QUANTITY"], ["double the chicken", "ADJUST_QUANTITY"],
    ["make it dairy-free", "APPLY_DIETARY_CONSTRAINT"],
    ["no, I meant the chicken bowl", "CORRECT_PREVIOUS_RESOLUTION"], ["not that one", "CORRECT_PREVIOUS_RESOLUTION"],
    ["undo that", "UNDO_LAST_PROPOSAL"], ["actually keep the original", "REVERT_TO_ORIGINAL"],
  ]
  it.each(cases)("%s -> %s", (message, intent) => expect(classifyFollowUp(normalizeMessage(message))?.intent).toBe(intent))

  it("does not hijack ordinary requests, questions or new topics", () => {
    for (const message of [
      "Is Greek yogurt good for cutting?", "What should I eat for dinner?", "I want a Vietnamese meal with lots of protein.", "I'm craving pizza", "Build dinner under 500 calories",
      "How much protein should I eat per day?", "yo, what u capable of?", "Make this bowl under 400 calories", "add me to the waitlist please", "I want more protein in my day",
      "Tuna is getting boring.", "Can we try something Asian?", "hello", "thanks!",
    ]) expect(classifyFollowUp(normalizeMessage(message)), message).toBeNull()
  })
})

describe("explicit new-topic detection (layer 1) — and its false-positive rate", () => {
  const positives: Array<[string, string | undefined]> = [
    ["actually I want pizza", "pizza"], ["what about pizza?", "pizza"], ["Actually, I feel like ice cream", "ice cream"], ["let's have burgers", "burgers"], ["how about sushi", "sushi"],
  ]
  it.each(positives)("%s", (message, food) => expect(detectExplicitNewTopic(message)?.food).toBe(food))
  it("recognises topic-switch phrases without a food", () => {
    for (const message of ["forget that, something else", "I changed my mind", "let's do something else", "different meal please", "actually I want something lighter"]) expect(detectExplicitNewTopic(message), message).not.toBeNull()
  })
  it("newTopicFalsePositiveRate is 0 on messages that stay on the same meal", () => {
    const stay = ["actually I want more protein", "what about adding rice", "how about cheaper", "I want it cheaper", "what about the second one", "let's make it lighter", "actually keep the original", "no, I meant the chicken bowl", "I want to see the ingredients", "what about the macros"]
    const falsePositives = stay.filter((message) => detectExplicitNewTopic(message))
    expect(falsePositives).toEqual([])
  })
})

describe("reference resolution + response mode", () => {
  const resolve = (message: string, state: FollowUpState | null, extra: Partial<Parameters<typeof resolveTurn>[0]> = {}) => resolveTurn({ message, state, activeDraft: null, topicType: null, now: NOW, ...extra })

  it("binds the last assistant referent for read-only follow-ups", () => {
    const turn = resolve("detailed ingredients", live())
    expect(turn).toMatchObject({ kind: "follow_up", resolution: { intent: "SHOW_INGREDIENTS", responseMode: "READ_ONLY", confidence: "HIGH" } })
  })

  it("an explicit reference in the current message beats the last referent", () => {
    const state = live({ meals: [TUNA, CHICKEN] })
    const turn = resolve("ingredients of the chicken one?", state)
    // not a canned phrase: stays unclaimed by the fast path
    expect(turn.kind).toBe("none")
    const correction = resolve("no, I meant the chicken bowl", state)
    expect(correction).toMatchObject({ kind: "follow_up", intent: "CORRECT_PREVIOUS_RESOLUTION", target: { kind: "meal", meal: { id: CHICKEN.id }, via: "explicit" } })
  })

  it("never auto-resolves several candidates", () => {
    const state = live({ meals: [TUNA, CHICKEN, YOGURT], referent: null, candidateReferents: [TUNA, CHICKEN, YOGURT].map((m) => ({ type: "MEAL_RESULT", id: m.id, name: m.name })) })
    const turn = resolve("that one", state)
    expect(turn).toMatchObject({ kind: "follow_up", resolution: { responseMode: "CLARIFY" }, target: { kind: "clarify", reason: "ambiguous" } })
  })

  it("a presented option set resolves ordinals; a clarification answer continues the ORIGINAL intent", () => {
    const options = { options: [TUNA, CHICKEN, YOGURT].map((m) => ({ id: m.id, label: m.name })), createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString() }
    const state = live({ meals: [TUNA, CHICKEN, YOGURT], referent: null, presentedOptions: options })
    expect(resolve("second one", state)).toMatchObject({ kind: "follow_up", intent: "SELECT_PREVIOUS_OPTION", target: { kind: "meal", meal: { id: CHICKEN.id }, via: "option" } })
    expect(resolve("option 3", state)).toMatchObject({ target: { meal: { id: YOGURT.id } } })

    const asked = live({
      meals: [TUNA, CHICKEN, YOGURT],
      referent: null,
      clarification: { question: "Do you mean…?", candidateReferents: [TUNA, CHICKEN].map((m) => ({ type: "MEAL_RESULT", id: m.id, name: m.name })), expectedResponseType: "REFERENT_SELECTION", expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), pendingIntent: { intent: "SHOW_MACROS", args: {} } },
    })
    expect(resolve("the chicken one", asked)).toMatchObject({ kind: "follow_up", intent: "SHOW_MACROS", viaClarification: true, target: { meal: { id: CHICKEN.id } } })
    expect(resolve("first", asked)).toMatchObject({ intent: "SHOW_MACROS", target: { meal: { id: TUNA.id } } })
  })

  it("the active draft never wins merely because it exists", () => {
    const turn = resolve("macros?", null, { activeDraft: TUNA, topicType: "CRAVING" })
    expect(turn).toMatchObject({ kind: "follow_up", resolution: { responseMode: "CLARIFY" }, target: { kind: "clarify", reason: "unanchored_draft" } })
    // …but when the current topic IS the meal, it is the referent.
    expect(resolve("macros?", null, { activeDraft: TUNA, topicType: "MEAL" })).toMatchObject({ target: { kind: "meal", via: "topic", confidence: "MEDIUM" } })
  })

  it("a bare nutrient word without any anchor is left to the ordinary pipeline", () => {
    expect(resolve("protein?", null).kind).toBe("none")
  })

  it("proposal answers are claimed only while a proposal is pending", () => {
    const pending = { sourceMealResultId: TUNA.id, ops: [{ type: "cheaper" as const }], baseKey: "k", expiresAt: new Date(NOW.getTime() + 60_000).toISOString() }
    expect(resolve("yes", live({ pendingProposal: pending }))).toMatchObject({ kind: "proposal_decision", accept: true, stale: false })
    expect(resolve("no", live({ pendingProposal: pending }))).toMatchObject({ kind: "proposal_decision", accept: false })
    expect(resolve("yes", live())).toMatchObject({ kind: "none" })
    expect(resolve("yes", live({ pendingProposal: { ...pending, expiresAt: new Date(NOW.getTime() - 1).toISOString() } }))).toMatchObject({ kind: "proposal_decision", stale: true })
  })

  it("a stated new topic wins and the old referent does not control routing", () => {
    expect(resolve("actually I want pizza", live())).toMatchObject({ kind: "new_topic", topic: { food: "pizza" } })
  })

  it("steps aside for messages the legacy draft editor handles deterministically", () => {
    expect(resolve("cheaper", live(), { legacyHandles: true }).kind).toBe("none")
  })
})

describe("TTL (turn + time) and state transitions", () => {
  it("expires by idle time", () => {
    const state = live()
    expect(isFollowUpLive(state, NOW)).toBe(true)
    expect(isFollowUpLive(state, new Date(NOW.getTime() + FOLLOW_UP_IDLE_MS + 1))).toBe(false)
  })

  it("expires by turn count, and the counter restarts with a new referent", () => {
    let state: FollowUpState | null = live()
    for (let turn = 0; turn < FOLLOW_UP_TURN_LIMIT; turn++) state = nextFollowUpState(state, {}, NOW)
    expect(isFollowUpLive(state, NOW)).toBe(false)
    const fresh = nextFollowUpState(state, { upsertMeals: [CHICKEN], referent: { type: "MEAL_RESULT", id: CHICKEN.id, name: CHICKEN.name }, newReferent: true }, NOW)
    expect(fresh?.context.turnCount).toBe(0)
    expect(fresh?.meals.map((m) => m.id)).toEqual([CHICKEN.id]) // the expired state carried nothing over
  })

  it("an expired state carries nothing; reset clears; a new referent remembers the previous one", () => {
    expect(nextFollowUpState(live(), { reset: true }, NOW)).toBeNull()
    const moved = nextFollowUpState(live(), { upsertMeals: [CHICKEN], referent: { type: "MEAL_RESULT", id: CHICKEN.id, name: CHICKEN.name }, newReferent: true }, NOW)
    expect(moved?.previousReferent).toMatchObject({ id: TUNA.id })
    expect(moved?.meals.map((m) => m.id)).toEqual([CHICKEN.id, TUNA.id])
  })

  it("a clarification lives for exactly one answer", () => {
    const asked = nextFollowUpState(live(), { clarification: { question: "q", candidateReferents: [], expectedResponseType: "REFERENT_SELECTION", expiresAt: NOW.toISOString() } }, NOW)
    expect(asked?.clarification).not.toBeNull()
    expect(nextFollowUpState(asked, {}, NOW)?.clarification).toBeNull()
  })
})

describe("structured meal result", () => {
  it("derives macros from ids + grams only (the deterministic calculator)", () => {
    const reference = toMealResultReference(TUNA)
    expect(reference.ingredients).toEqual([
      expect.objectContaining({ foodId: "tuna", quantity: 150, unit: "g" }),
      expect.objectContaining({ foodId: "wraps", quantity: 60, unit: "g" }),
    ])
    expect(reference.macros?.protein).toBeCloseTo(150 * 0.26 + 60 * 0.08, 0)
    expect(matchMeals("the tuna one", [TUNA, CHICKEN]).map((m) => m.id)).toEqual([TUNA.id])
    expect(matchMeals("bowl", [TUNA, CHICKEN, YOGURT])).toEqual([]) // generic words identify nothing
    expect(matchMeals("the chicken bowl", [TUNA, CHICKEN, YOGURT]).map((m) => m.id)).toEqual([CHICKEN.id])
    expect(matchMeals("berry bowl", [TUNA, CHICKEN, YOGURT]).map((m) => m.id)).toEqual([YOGURT.id])
  })
})
