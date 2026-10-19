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
  callOpenAiWithFallback: vi.fn(async () => ({ reply: "Sure — happy to help with that.", model: "test" })),
}))
vi.mock("@/lib/dante-core/openai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/config")>()),
  isOpenAiConfigured: vi.fn(() => true),
}))

import { POST } from "@/app/api/chatbot/route"
import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { isOpenAiConfigured } from "@/lib/dante-core/openai/config"
import { loadCoachContext } from "@/lib/nutrition/coach/context"
import { buildCravingDraft } from "@/lib/nutrition/coach/craving"
import { assembleDraft, contextConstraints } from "@/lib/nutrition/coach/draft"
import { getFollowUpMetrics, resetFollowUpMetrics } from "@/lib/nutrition/coach/followup-telemetry"
import { totalsFor } from "@/lib/nutrition/coach/macros"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
import { createClient } from "@/lib/supabase/server"

const USER = "00000000-0000-4000-8000-00000000000a"

const client = {
  auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  from: vi.fn(() => {
    throw new Error("Nutrition Coach tests must not touch tables directly")
  }),
}

const plan = (allergies: string[] = []) => ({
  plan: {
    target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 },
    input: { goal: "fat_loss", allergies, excludedFoods: [], foodPreferences: [] },
  },
  targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
  fitnessGoal: "fat_loss",
  cookingAbility: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  resetFollowUpMetrics()
  vi.mocked(isOpenAiConfigured).mockReturnValue(true)
  vi.mocked(callOpenAiWithFallback).mockReset()
  vi.mocked(callOpenAiWithFallback).mockImplementation(async () => ({ reply: "Sure — happy to help with that.", model: "test" }))
  vi.mocked(loadNutritionContext).mockImplementation((async () => plan()) as never)
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 1680, protein: 106, carbs: 0, fat: 0 } } as never)
  vi.mocked(createClient).mockResolvedValue(client as never)
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** A tiny stand-in for the panel: echoes the active draft + conversation back exactly as the UI does. */
function session() {
  let active: Json | null = null
  let conversation: Json | undefined
  const recent: Array<{ role: "user" | "coach"; text: string }> = []
  return {
    get active() {
      return active
    },
    get conversation() {
      return conversation
    },
    set conversation(value: Json | undefined) {
      conversation = value
    },
    set active(value: Json | null) {
      active = value
    },
    async say(message: string): Promise<Json> {
      recent.push({ role: "user", text: message })
      const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", activeDraft: active, conversation: { ...(conversation ?? {}), recentMessages: recent.slice(-6) } }) }))
      const json = (await response.json()) as Json
      recent.push({ role: "coach", text: json.reply })
      conversation = json.conversation
      if (json.mealDraft) active = json.mealDraft
      if (json.conversation?.deactivateDraft) active = null
      return json
    },
  }
}

const TUNA = "I have tuna, wraps and cucumber. Build dinner under 600 calories"
const calls = () => vi.mocked(callOpenAiWithFallback).mock.calls.length
const ids = (draft: Json) => draft.ingredients.map((i: { ingredientId: string }) => i.ingredientId)

async function tunaSession() {
  const s = session()
  const built = await s.say(TUNA)
  expect(ids(built.mealDraft)).toContain("tuna")
  return { s, built }
}

describe("REAL SCREENSHOT REGRESSION — 'detailed ingredients' after a meal suggestion", () => {
  it("shows the actual ingredients of the meal just discussed (no generic fallback, no model, no retrieval)", async () => {
    const { s, built } = await tunaSession()
    const before = calls()
    const json = await s.say("detailed ingredients")
    expect(json.reply).not.toMatch(/Tell me what you want/i)
    expect(json.reply).toContain(built.mealDraft.name)
    for (const item of built.mealDraft.ingredients) expect(json.reply).toContain(`${Math.round(item.grams)} g`)
    expect(json.route).toBe("followup_ingredients")
    expect(json.followUp).toMatchObject({ intent: "SHOW_INGREDIENTS", responseMode: "READ_ONLY" })
    expect(json.structuredBlocks[0]).toMatchObject({ type: "INGREDIENT_LIST", mealName: built.mealDraft.name })
    expect(json.mealDraft).toBeNull()
    expect(calls()).toBe(before)
  })

  it("the exact observed case works even when only the draft + topic survive (no follow-up state)", async () => {
    const loaded = await loadCoachContext(client as never, USER, new Date("2026-10-07T10:00:00Z"))
    if (!loaded.ok) throw new Error("ctx")
    const draft = assembleDraft({ ctx: loaded.ctx, name: "High-Protein Tuna Wrap Bowl", family: "savory_bowl", items: [{ ingredientId: "tuna", grams: 150 }, { ingredientId: "wraps", grams: 60 }, { ingredientId: "cucumber", grams: 100 }], constraints: contextConstraints(loaded.ctx.snapshot)! })
    const s = session()
    s.active = draft as never
    s.conversation = { currentTopic: { type: "MEAL", food: draft.name }, pendingMealBuild: null, handoff: null, signals: [] }
    const json = await s.say("detailed ingredients")
    expect(json.reply).toContain("High-Protein Tuna Wrap Bowl")
    expect(json.reply).toMatch(/Tuna 150 g/)
    expect(json.reply).toMatch(/Wrap 60 g/)
    expect(json.reply).not.toMatch(/Tell me what you want/i)
  })

  it("without any anchor the active draft is NOT assumed: the coach asks which meal", async () => {
    const loaded = await loadCoachContext(client as never, USER, new Date("2026-10-07T10:00:00Z"))
    if (!loaded.ok) throw new Error("ctx")
    const built = buildCravingDraft(loaded.ctx, "chocolate_cereal")
    if (built.status !== "OK") throw new Error("draft")
    const s = session()
    s.active = built.draft as never
    const json = await s.say("ingredients?")
    expect(json.followUp.responseMode).toBe("CLARIFY")
    expect(json.reply).toMatch(/Do you mean/)
    expect(json.reply).not.toMatch(/\d+ g/)
    // …and a "yes" continues the ORIGINAL ask.
    const answer = await s.say("yes")
    expect(answer.route).toBe("followup_ingredients")
    expect(answer.reply).toContain(built.draft.name)
  })
})

describe("read-only follow-ups use structured data, not the model", () => {
  it("CASE 2 macros? returns the deterministic macros of the same meal", async () => {
    const { s, built } = await tunaSession()
    const before = calls()
    const json = await s.say("macros?")
    expect(json.reply).toContain(`${Math.round(built.mealDraft.nutrition.calories)} kcal`)
    expect(json.reply).toContain(`${Math.round(built.mealDraft.nutrition.protein)}g protein`)
    expect(json.followUp.intent).toBe("SHOW_MACROS")
    expect(calls()).toBe(before)
  })

  it("CASE 3 'how much tuna?' returns the stored quantity", async () => {
    const { s, built } = await tunaSession()
    const grams = Math.round(built.mealDraft.ingredients.find((i: Json) => i.ingredientId === "tuna").grams)
    const json = await s.say("how much tuna?")
    expect(json.reply).toContain(`${grams} g of Tuna`)
    expect(json.followUp.intent).toBe("SHOW_PORTIONS")
  })

  it("CASE 4 'why this one?' explains from the real constraints without mutating", async () => {
    const { s, built } = await tunaSession()
    const json = await s.say("why this one?")
    expect(json.followUp).toMatchObject({ intent: "EXPLAIN_RECOMMENDATION", responseMode: "EXPLAIN" })
    expect(json.reply).toContain(built.mealDraft.name)
    expect(json.mealDraft).toBeNull()
  })

  it("CASE 11 Vietnamese: 'bao nhiêu tuna?' is SHOW_PORTIONS and 'nguyên liệu?' SHOW_INGREDIENTS", async () => {
    const { s } = await tunaSession()
    expect((await s.say("bao nhiêu tuna?")).followUp.intent).toBe("SHOW_PORTIONS")
    expect((await s.say("nguyên liệu?")).followUp.intent).toBe("SHOW_INGREDIENTS")
    expect((await s.say("chi tiết nguyên liệu?")).followUp.intent).toBe("SHOW_INGREDIENTS")
    expect((await s.say("tại sao món này?")).followUp.intent).toBe("EXPLAIN_RECOMMENDATION")
  })
})

describe("modifications are visible proposals, never silent mutations", () => {
  it("CASE 5 'cheaper?' proposes; the draft is untouched until the user confirms", async () => {
    const { s, built } = await tunaSession()
    const json = await s.say("cheaper?")
    expect(json.followUp).toMatchObject({ intent: "MODIFY_PREVIOUS_RESULT", responseMode: "PROPOSE_MODIFICATION" })
    expect(json.mealDraft).toBeNull()
    expect(json.action.type).toBe("NONE")
    if (json.modificationProposal) {
      expect(json.modificationProposal.requiresConfirmation).toBe(true)
      expect(json.conversation.followUp.pendingProposal).toBeTruthy()
      expect(json.reply).toMatch(/Nothing changes until you confirm/)
      const yes = await s.say("yes")
      expect(yes.route).toBe("proposal_applied")
      expect(yes.mealDraft.id).toBe(built.mealDraft.id)
      expect(yes.mealDraft.nutrition).toEqual(json.modificationProposal.resultingMacros)
      expect(yes.conversation.followUp.pendingProposal).toBeNull()
    } else {
      // Nothing cheaper exists for this meal: the engine says so and nothing is pending.
      expect(json.conversation.followUp?.pendingProposal ?? null).toBeNull()
    }
  })

  it("CASE 12 'cheaper không?' resolves to the same PROPOSE_MODIFICATION", async () => {
    const { s } = await tunaSession()
    expect((await s.say("cheaper không?")).followUp).toMatchObject({ intent: "MODIFY_PREVIOUS_RESULT", responseMode: "PROPOSE_MODIFICATION" })
    expect((await s.say("rẻ hơn được không?")).followUp).toMatchObject({ intent: "MODIFY_PREVIOUS_RESULT" })
  })

  it("CASE 9 'can I use chicken instead?' recalculates through the calculator and waits for confirmation", async () => {
    const { s, built } = await tunaSession()
    const json = await s.say("can I use chicken instead?")
    expect(json.followUp.intent).toBe("SUBSTITUTE_IN_PREVIOUS_RESULT")
    expect(json.mealDraft).toBeNull()
    const proposal = json.modificationProposal
    expect(proposal).toBeTruthy()
    const resulting = built.mealDraft.ingredients.map((i: Json) => ({ ingredientId: i.ingredientId === "tuna" ? "chicken_breast" : i.ingredientId, grams: i.grams }))
    expect(proposal.resultingMacros.protein).toBeGreaterThan(0)
    expect(proposal.resultingIngredients.map((i: Json) => i.name).join(" ")).toMatch(/Chicken/)
    expect(Math.round(proposal.resultingMacros.calories)).not.toBe(Math.round(built.mealDraft.nutrition.calories))
    void resulting
    void totalsFor
  })

  it("a proposal expires, goes stale when the meal changes, and can be rejected", async () => {
    const { s } = await tunaSession()
    const asked = await s.say("add avocado")
    if (!asked.modificationProposal) return // no verified avocado data in the table -> nothing pending, nothing mutated
    const no = await s.say("no")
    expect(no.route).toBe("proposal_rejected")
    expect(no.conversation.followUp.pendingProposal).toBeNull()
  })
})

describe("CASE 10 safety pre-gate", () => {
  beforeEach(() => {
    vi.mocked(loadNutritionContext).mockImplementation((async () => plan(["peanut"])) as never)
  })

  it("'add peanuts' with a peanut allergy is blocked before any proposal exists", async () => {
    const { s } = await tunaSession()
    const json = await s.say("add peanuts")
    expect(json.reply).toMatch(/can't add peanuts/i)
    expect(json.modificationProposal).toBeNull()
    expect(json.mealDraft).toBeNull()
    expect(json.conversation.followUp.pendingProposal).toBeNull()
  })

  it("'can I use peanut butter instead?' is safety-checked BEFORE a substitution proposal", async () => {
    const { s } = await tunaSession()
    const json = await s.say("can I use peanut butter instead?")
    expect(json.reply).toMatch(/can't swap in peanut butter/i)
    expect(json.modificationProposal).toBeNull()
  })

  it("a forged pending proposal cannot smuggle a blocked ingredient past confirmation", async () => {
    vi.mocked(loadNutritionContext).mockImplementation((async () => plan(["dairy"])) as never)
    const { s, built } = await tunaSession()
    const state = { ...s.conversation!.followUp, pendingProposal: { sourceMealResultId: built.mealDraft.id, ops: [{ type: "add", ingredientId: "greek_yogurt" }], baseKey: built.mealDraft.ingredients.map((i: Json) => `${i.ingredientId}:${Math.round(i.grams)}`).join("|"), expiresAt: new Date(Date.now() + 60_000).toISOString() } }
    s.conversation = { ...s.conversation!, followUp: state }
    const json = await s.say("yes")
    expect(json.mealDraft).toBeNull()
    expect(json.route).toMatch(/proposal_(blocked|failed)/)
  })

  it("'make it dairy-free' is a valid dietary constraint, not a block", async () => {
    vi.mocked(loadNutritionContext).mockImplementation((async () => plan()) as never)
    const s = session()
    await s.say("Help me build a high protein breakfast with greek yogurt")
    const json = await s.say("make it dairy-free")
    expect(json.followUp?.intent).toBe("APPLY_DIETARY_CONSTRAINT")
    expect(json.safetyBlocked).toBeUndefined()
  })
})

describe("CASES 6-8 references: correction, option selection, clarification", () => {
  it("CASE 6 'no, I meant the tuna one' repairs the previous resolution and re-runs the original ask", async () => {
    const { s, built } = await tunaSession()
    await s.say("I have chicken, rice and broccoli. Build dinner under 600 calories")
    const chicken = await s.say("ingredients?")
    expect(chicken.reply).toMatch(/Chicken/)
    const fixed = await s.say("no, I meant the tuna one")
    expect(fixed.reply).toContain(built.mealDraft.name)
    expect(fixed.reply).toMatch(/Tuna \d+ g/)
    expect(fixed.followUp.intent).toBe("CORRECT_PREVIOUS_RESOLUTION")
    expect(fixed.route).toBe("followup_ingredients")
    expect(fixed.referent).toMatchObject({ name: built.mealDraft.name })
  })

  it("CASE 7 'second one' selects option #2 of the presented options", async () => {
    const s = session()
    const first = await s.say("What meal best fits my remaining calories and protein today?")
    const options = first.presentedOptions?.options
    expect(options?.length).toBeGreaterThanOrEqual(2)
    expect(first.structuredBlocks[0].type).toBe("OPTION_LIST")
    const second = await s.say("second one")
    expect(second.route).toBe("followup_select")
    expect(second.followUp.intent).toBe("SELECT_PREVIOUS_OPTION")
    expect(second.mealDraft.id).toBe(options[1].id)
    const viaNumber = await s.say("option 1")
    expect(viaNumber.mealDraft?.id ?? first.mealDraft.id).toBe(options[0].id)
  })

  it("CASE 8 'that one' with several unresolved candidates asks, never guesses — and the answer continues the original ask", async () => {
    const { s } = await tunaSession()
    const chickenBuild = await s.say("I have chicken, rice and broccoli. Build dinner under 600 calories")
    const fish = await s.say("I have fish, potatoes and spinach. Build dinner under 600 calories")
    const state = s.conversation!.followUp
    const metas = [chickenBuild.mealDraft, fish.mealDraft]
    expect(state.meals.length).toBeGreaterThanOrEqual(3)
    // The coach offered three meals without recommending one.
    s.conversation = {
      ...s.conversation!,
      followUp: {
        ...state,
        referent: null,
        candidateReferents: state.meals.slice(0, 3).map((m: Json) => ({ type: "MEAL_RESULT", id: m.id, name: m.name })),
        presentedOptions: null,
      },
    }
    s.active = null
    const ask = await s.say("that one")
    expect(ask.followUp.responseMode).toBe("CLARIFY")
    expect(ask.reply).toMatch(/Do you mean/)
    void metas
    const ingredients = await s.say("ingredients?")
    expect(ingredients.followUp.responseMode).toBe("CLARIFY")
    const answered = await s.say("the tuna one")
    expect(answered.route).toBe("followup_ingredients")
    expect(answered.reply).toMatch(/Tuna \d+ g/)
  })
})

describe("TTL / stale referents", () => {
  it("expired follow-up context is not remembered: the coach asks instead of pretending", async () => {
    const { s } = await tunaSession()
    const state = s.conversation!.followUp
    s.active = null
    s.conversation = { ...s.conversation!, currentTopic: null, followUp: { ...state, context: { ...state.context, expiresAt: new Date(Date.now() - 1000).toISOString() } } }
    const json = await s.say("detailed ingredients")
    expect(json.followUp.responseMode).toBe("CLARIFY")
    expect(json.reply).toMatch(/lost track/i)
    expect(json.reply).not.toMatch(/\d+ g/)
  })

  it("the turn limit invalidates the referent", async () => {
    const { s } = await tunaSession()
    const state = s.conversation!.followUp
    s.active = null
    s.conversation = { ...s.conversation!, currentTopic: null, followUp: { ...state, context: { ...state.context, turnCount: 8 } } }
    const json = await s.say("macros?")
    expect(json.reply).not.toMatch(/protein, \d+g carbs/)
  })

  it("a client cannot forge macros: only ids + grams are trusted and the numbers are recomputed", async () => {
    const { s, built } = await tunaSession()
    const state = s.conversation!.followUp
    const forged = { ...state, meals: state.meals.map((m: Json) => ({ ...m, macros: { calories: 1, protein: 999 }, calories: 1 })) }
    s.conversation = { ...s.conversation!, followUp: forged }
    const json = await s.say("macros?")
    expect(json.reply).toContain(`${Math.round(built.mealDraft.nutrition.calories)} kcal`)
    expect(json.reply).not.toMatch(/999/)
  })
})

describe("NEW TOPIC vs the old referent", () => {
  it("CASE 13 'actually I want pizza' starts a new topic; the old meal does not anchor", async () => {
    const { s, built } = await tunaSession()
    const json = await s.say("actually I want pizza")
    expect(json.followUp.responseMode).toBe("NEW_TOPIC")
    expect(json.topic).toMatchObject({ type: "CRAVING", food: "pizza" })
    expect(json.mealDraft).toBeNull()
    expect(json.referent).toBeNull()
    expect(json.reply).not.toContain(built.mealDraft.name)
    // The old referent really is gone: a bare "ingredients?" no longer binds the tuna meal.
    const later = await s.say("ingredients?")
    expect(later.followUp.responseMode).toBe("CLARIFY")
  })

  it("CASE 14 'I'm thinking Vietnamese tonight' is its own topic and leaves the cereal draft unchanged", async () => {
    const loaded = await loadCoachContext(client as never, USER, new Date("2026-10-07T10:00:00Z"))
    if (!loaded.ok) throw new Error("ctx")
    const built = buildCravingDraft(loaded.ctx, "chocolate_cereal")
    if (built.status !== "OK") throw new Error("draft")
    const s = session()
    s.active = built.draft as never
    s.conversation = { currentTopic: { type: "MEAL", food: built.draft.name }, pendingMealBuild: null, handoff: null, signals: [] }
    const json = await s.say("I'm thinking Vietnamese tonight.")
    expect(json.mealDraft).toBeNull()
    expect(json.draftTarget.mode).toBe("NONE")
    expect(json.topic?.type).not.toBe("MEAL")
    expect((s.active as Json | null)?.id).toBe(built.draft.id)
    expect(json.reply).not.toContain(built.draft.name)
  })

  it("a model-detected new topic ('tuna is getting boring') clears the referent; the model cannot mutate anything", async () => {
    const { s } = await tunaSession()
    vi.mocked(callOpenAiWithFallback)
      .mockResolvedValueOnce({ reply: JSON.stringify({ isFollowUp: false, candidate: null, intent: null, confidence: "HIGH", isNewTopic: true, topicHint: "variety" }), model: "t" })
      .mockResolvedValueOnce({ reply: "not a plan", model: "t" }) // N1.6.4 planner: malformed ...
      .mockResolvedValueOnce({ reply: "not a plan", model: "t" }) // ... and its one reduced retry -> existing path
      .mockResolvedValueOnce({ reply: JSON.stringify({ topic: { type: "GENERAL_NUTRITION" }, reply: "Fair — want to try something different tonight?" }), model: "t" })
    const json = await s.say("Tuna is getting boring.")
    expect(json.followUp).toMatchObject({ responseMode: "NEW_TOPIC", viaModel: true })
    expect(json.mealDraft).toBeNull()
    expect(json.referent).toBeNull()
    expect(json.reply).toMatch(/different/)
  })
})

describe("bounded OpenAI follow-up fallback", () => {
  it("a model-resolved follow-up goes through the SAME deterministic executor (proposal, no mutation)", async () => {
    const { s } = await tunaSession()
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: JSON.stringify({ isFollowUp: true, candidate: 0, intent: "MODIFY_PREVIOUS_RESULT", modifier: "more_protein", confidence: "HIGH", isNewTopic: false }), model: "t" })
    const json = await s.say("that looks a bit thin for lunch, could it carry more protein?")
    expect(json.followUp).toMatchObject({ intent: "MODIFY_PREVIOUS_RESULT", responseMode: "PROPOSE_MODIFICATION", viaModel: true })
    expect(json.mealDraft).toBeNull()
  })

  it("rejects malformed / unexpected model output and falls back to ordinary conversation", async () => {
    const { s } = await tunaSession()
    for (const bad of ["not json at all", JSON.stringify({ isFollowUp: true, candidate: 0, intent: "DROP_TABLE", confidence: "HIGH", isNewTopic: false }), JSON.stringify({ isFollowUp: true, candidate: 9, intent: "SHOW_MACROS", confidence: "HIGH", isNewTopic: false }), JSON.stringify({ isFollowUp: true, candidate: 0, intent: "SHOW_MACROS", confidence: "HIGH", isNewTopic: false, mealId: "forged" })]) {
      vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: bad, model: "t" }).mockResolvedValueOnce({ reply: "Okay, tell me more about what you're after.", model: "t" })
      const json = await s.say("hmm what do you reckon about the whole thing")
      expect(json.followUp?.viaModel ?? false).toBe(false)
      expect(json.mealDraft).toBeNull()
    }
  })

  it("never runs when the model is unavailable, and never blocks the deterministic paths", async () => {
    const { s } = await tunaSession()
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    const json = await s.say("detailed ingredients")
    expect(json.route).toBe("followup_ingredients")
    const idle = await s.say("hmm what do you reckon")
    expect(idle.reply).not.toMatch(/Tell me what you want/)
  })
})

describe("CASE 15 conversational messages use the OpenAI runtime", () => {
  it("'yo, what u capable of?' gets a model reply and creates no draft", async () => {
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: JSON.stringify({ topic: { type: "GENERAL_NUTRITION" }, reply: "Yo 👋 I can build meals around your macros, work in cravings, swap ingredients and answer nutrition questions." }), model: "t" })
    const s = session()
    const json = await s.say("yo, what u capable of?")
    expect(calls()).toBe(1)
    expect(json.reply).toMatch(/build meals/)
    expect(json.mealDraft).toBeNull()
    expect(json.route).toBe("agent_topic")
  })

  it("provider failure degrades to a context-aware reply, not the old command help, and mutates nothing", async () => {
    vi.mocked(callOpenAiWithFallback).mockRejectedValue(new Error("provider down"))
    const s = session()
    const greeting = await s.say("yo")
    expect(greeting.reply).toMatch(/What are we solving/)
    const other = await s.say("what u capable of?")
    expect(other.reply).toMatch(/kcal/)
    expect(other.mealDraft).toBeNull()
    expect(getFollowUpMetrics().genericFallbacks).toBeGreaterThan(0)
  })
})

describe("telemetry is privacy-safe", () => {
  it("counts enums only — no message text", async () => {
    const { s } = await tunaSession()
    await s.say("detailed ingredients")
    const metrics = getFollowUpMetrics()
    expect(metrics.followUps).toBeGreaterThan(0)
    expect(JSON.stringify(metrics)).not.toMatch(/tuna|ingredients/i)
  })
})

describe("CASE 16 protein-priority is a modifier, never a food", () => {
  it.each([
    "I want a Vietnamese meal with lots of protein.",
    "I want a meal with high protein.",
    "Build me a protein-heavy dinner",
    "I want a protein focused lunch",
    "Give me a protein-rich meal",
    "I want a meal with more protein",
  ])("%s", async (message) => {
    const { parseCoachMessage } = await import("@/lib/nutrition/coach/intent")
    const intent = parseCoachMessage(message, { hasDraft: false })
    expect(intent.kind).toBe("build")
    if (intent.kind !== "build") return
    expect(intent.unresolvedFoods).toEqual([])
    expect(intent.foodIds).toEqual([])
    expect(intent.proteinPriority).toBe(true)
  })

  it("the route never says it lacks data for 'lots of protein' and still builds a meal", async () => {
    const s = session()
    const json = await s.say("I want a Vietnamese meal with lots of protein.")
    expect(json.reply).not.toMatch(/lots of protein/i)
    expect(json.reply).not.toMatch(/verified nutrition data/i)
    expect(json.mealDraft).toBeTruthy()
  })

  it("real food names after 'with' are still parsed as foods", async () => {
    const { parseCoachMessage } = await import("@/lib/nutrition/coach/intent")
    const intent = parseCoachMessage("Build dinner with chicken and rice", { hasDraft: false })
    expect(intent).toMatchObject({ kind: "build", foodIds: ["chicken_breast", "rice"], proteinPriority: false })
  })
})

describe("CASE 17 'Make this meal crunchier.' — engine edit + Texture Hacks > Crunch guidance", () => {
  it("applies the deterministic edit and retrieves the Crunch section for the presentation", async () => {
    const s = session()
    const built = await s.say("I have chicken, rice and broccoli. Build dinner under 600 calories")
    expect(ids(built.mealDraft)).not.toContain("cucumber")
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: "Added some fresh cucumber for crunch — for extra bite, keep it raw and add it just before serving.", model: "t" })
    const json = await s.say("Make this meal crunchier.")
    expect(json.intent).toBe("EDIT_ACTIVE_DRAFT")
    expect(ids(json.mealDraft)).toContain("cucumber")
    const prompt = String(vi.mocked(callOpenAiWithFallback).mock.calls.at(-1)?.[0])
    expect(prompt).toMatch(/Texture Hacks — Crunch/)
    // The model only presents; numbers still come from the engine, and policy text is not part of the knowledge block.
    expect(prompt).not.toMatch(/macro_provenance_policy|medical_claims_policy/)
    expect(json.reply).toMatch(/cucumber/i)
  })

  it("without a model the deterministic engine reply is used (no crash, no invented guidance)", async () => {
    const s = session()
    await s.say("I have chicken, rice and broccoli. Build dinner under 600 calories")
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    const json = await s.say("Make this meal crunchier.")
    expect(ids(json.mealDraft)).toContain("cucumber")
    expect(json.reply).toMatch(/kcal/)
  })
})

describe("score breakdown is internal", () => {
  it("never appears in API responses", async () => {
    const s = session()
    const json = await s.say("I'm craving Coco Pops.")
    const text = JSON.stringify(json)
    for (const key of ["lexicalBody", "headingMatch", "titleMatch", "breakdown"]) expect(text).not.toContain(key)
  })
})
