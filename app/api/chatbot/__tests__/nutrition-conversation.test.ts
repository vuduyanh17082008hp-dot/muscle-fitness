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
  callOpenAiWithFallback: vi.fn(async () => ({ reply: "Greek yogurt is a solid high-protein option when you are cutting.", model: "test" })),
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
import { QUICK_ACTIONS } from "@/lib/nutrition/coach/quick-actions"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { createClient } from "@/lib/supabase/server"

const USER_A = "00000000-0000-4000-8000-00000000000a"
const USER_B = "00000000-0000-4000-8000-00000000000b"

function client(userId: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isOpenAiConfigured).mockReturnValue(true)
  vi.mocked(loadNutritionContext).mockImplementation((async (_s: unknown, userId: string) => plan(userId)) as never)
  // user B has little left after eating, but dairy allergy is what matters here
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 1680, protein: 106, carbs: 0, fat: 0 } } as never)
  vi.mocked(createClient).mockResolvedValue(client(USER_A) as never)
})

const post = (body: unknown) => POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const chat = async (message: string, extra: Record<string, unknown> = {}) => (await post({ message, coachMode: "nutrition", ...extra })).json()
const optimizerCalled = (json: { toolCalls: Array<{ name: string }> }) => json.toolCalls.some((t) => t.name === "meal_optimizer")
const ids = (draft: { ingredients: Array<{ ingredientId: string }> }) => draft.ingredients.map((i) => i.ingredientId)

const COCO = "I'm craving some Coco Pops, what should I eat to stay on track and still feed my sweet tooth?"
const COCO_REPLY = "Coco Pops is a fair thing to want. You don't have to replace it: we could keep a measured portion of the real cereal and build protein around it."

async function chocolateCrunchDraft() {
  const loaded = await loadCoachContext(client(USER_A) as never, USER_A, new Date("2026-10-07T10:00:00Z"))
  if (!loaded.ok) throw new Error("context")
  const built = buildCravingDraft(loaded.ctx, "chocolate_cereal")
  if (built.status !== "OK") throw new Error("draft")
  return built.draft
}

describe("Coco Pops regression — a new craving is not an edit of the Active Meal Draft", () => {
  it.each([true, false])("keeps the old draft untouched and creates no draft (model configured: %s)", async (configured) => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(configured)
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: COCO_REPLY, model: "t" })
    const draft = await chocolateCrunchDraft()
    expect(draft.name).toBe("Chocolate Crunch Protein Bowl")

    const json = await chat(COCO, { activeDraft: draft })

    expect(json.intent).toBe("NEW_CRAVING_REQUEST")
    expect(json.topic).toMatchObject({ type: "CRAVING", food: "Coco Pops" })
    expect(json.topic.sensoryTargets).toEqual(expect.arrayContaining(["chocolate", "sweet", "crunchy"]))
    expect(json.action.type).toBe("ASK_BEFORE_BUILD")
    expect(json.draftTarget.mode).toBe("NONE")
    expect(json.mealDraft).toBeNull()
    expect(json.draft).toBeNull()
    expect(json.reply).toMatch(/Coco Pops/)
    expect(json.reply).not.toMatch(/Chocolate Crunch Protein Bowl/)
    expect(json.reply).toMatch(/real/i)
    expect(optimizerCalled(json)).toBe(false)
    expect(json.conversation.deactivateDraft).toBe(false)
    expect(json.conversation.pendingMealBuild).toEqual({ topic: "Coco Pops" })
  })

  it("rejects a model reply that states macro numbers it was not given", async () => {
    vi.mocked(callOpenAiWithFallback).mockResolvedValueOnce({ reply: "Coco Pops bowls are about 290 calories and 9g protein.", model: "t" })
    const json = await chat(COCO)
    expect(json.reply).not.toMatch(/290/)
    expect(json.reply).toMatch(/Coco Pops/)
  })

  it("'Fit the real Coco Pops into my remaining macros' builds a NEW draft and leaves the old one alone", async () => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    const old = await chocolateCrunchDraft()
    const ask = await chat(COCO, { activeDraft: old })
    const json = await chat("Fit the real Coco Pops into my remaining macros.", { activeDraft: old, conversation: ask.conversation })
    expect(json.action.type).toBe("CREATE_MEAL_DRAFT")
    expect(json.draftTarget.mode).toBe("NEW")
    expect(json.mealDraft.id).not.toBe(old.id)
    expect(json.mealDraft.name).toBe("Real Coco Pops Protein Bowl")
    expect(json.mealDraft.source).toBe("conversation")
    expect(ids(json.mealDraft)).toContain("coco_pops")
    expect(json.mealDraft.nutrition.calories).toBeLessThanOrEqual(520)
    expect(json.draftTarget.draftId).toBe(json.mealDraft.id)
    expect(json.conversation.deactivateDraft).toBe(false)
  })

  it("a bare 'yes' after the craving question builds the real-food draft", async () => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    const ask = await chat(COCO)
    const json = await chat("Yes", { conversation: ask.conversation })
    expect(json.action.type).toBe("CREATE_MEAL_DRAFT")
    expect(ids(json.mealDraft)).toContain("coco_pops")
  })

  it("respects allergies when building around the real food", async () => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    vi.mocked(createClient).mockResolvedValue(client(USER_B) as never)
    const json = await chat("Fit the real Coco Pops into my remaining macros.", { conversation: { pendingMealBuild: { topic: "Coco Pops" } } })
    expect(json.mealDraft).toBeNull()
    expect(json.reply).toMatch(/allerg/i)
  })
})

describe("inverse: explicit draft edits still hit the Active Meal Draft deterministically", () => {
  it("'Make this bowl under 400 calories.' -> EDIT_ACTIVE_DRAFT / UPDATE_MEAL_DRAFT / ACTIVE", async () => {
    const draft = await chocolateCrunchDraft()
    const json = await chat("Make this bowl under 400 calories.", { activeDraft: draft })
    expect(json.intent).toBe("EDIT_ACTIVE_DRAFT")
    expect(json.action.type).toBe("UPDATE_MEAL_DRAFT")
    expect(json.draftTarget).toEqual({ mode: "ACTIVE", draftId: draft.id })
    expect(json.mealDraft.id).toBe(draft.id)
    expect(json.mealDraft.nutrition.calories).toBeLessThanOrEqual(400)
    expect(json.toolCalls).toEqual([{ name: "draft_editor", ok: true }])
  })

  it("'Swap the chicken in this meal for fish.' edits the draft", async () => {
    const built = await chat("I have chicken, rice and broccoli. Build dinner under 600 calories")
    const json = await chat("Swap the chicken in this meal for fish.", { activeDraft: built.mealDraft })
    expect(json.intent).toBe("EDIT_ACTIVE_DRAFT")
    expect(ids(json.proposal ?? json.mealDraft)).toContain("white_fish")
  })

  it("'Reduce the rice.' scales one ingredient and recalculates", async () => {
    const built = await chat("I have chicken, rice and broccoli. Build dinner under 600 calories")
    const rice = built.mealDraft.ingredients.find((i: { ingredientId: string }) => i.ingredientId.includes("rice"))
    const json = await chat("Reduce the rice.", { activeDraft: built.mealDraft })
    const after = json.mealDraft.ingredients.find((i: { ingredientId: string }) => i.ingredientId === rice.ingredientId)
    expect(json.intent).toBe("EDIT_ACTIVE_DRAFT")
    expect(after.grams).toBeLessThan(rice.grams)
    expect(json.mealDraft.nutrition.calories).toBeLessThan(built.mealDraft.nutrition.calories)
  })
})

describe("routing with an Active Meal Draft present", () => {
  it("A: 'What should I eat for dinner?' is a NEW meal request, not an edit", async () => {
    const draft = await chocolateCrunchDraft()
    const json = await chat("What should I eat for dinner?", { activeDraft: draft })
    expect(json.intent).toBe("NEW_MEAL_REQUEST")
    expect(json.draftTarget.mode).toBe("NEW")
    expect(json.mealDraft.id).not.toBe(draft.id)
  })

  it("B: 'I want something salty.' starts a new craving topic and leaves the draft alone", async () => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    const draft = await chocolateCrunchDraft()
    const json = await chat("I want something salty.", { activeDraft: draft })
    expect(json.intent).toBe("NEW_CRAVING_REQUEST")
    expect(json.topic.sensoryTargets).toContain("salty")
    expect(json.mealDraft).toBeNull()
  })

  it("does not treat a bare 'this' as a draft reference", async () => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    const draft = await chocolateCrunchDraft()
    for (const message of ["This sounds good, but I'm craving pizza.", "This isn't what I want. Give me something sweet."]) {
      const json = await chat(message, { activeDraft: draft })
      expect(json.intent).not.toBe("EDIT_ACTIVE_DRAFT")
      expect(json.mealDraft?.id).not.toBe(draft.id)
    }
  })

  it("does not mutate the draft for an ingredient opinion without an edit request", async () => {
    const draft = await chocolateCrunchDraft()
    const json = await chat("The whey is boring today.", { activeDraft: draft })
    expect(json.intent).not.toBe("EDIT_ACTIVE_DRAFT")
    expect(json.mealDraft).toBeNull()
  })

  it("D: one-turn handoff — 'Want me to make this meal cheaper?' then 'Yes.' edits the active draft", async () => {
    const draft = await chocolateCrunchDraft()
    const json = await chat("Yes.", { activeDraft: draft, conversation: { handoff: { offer: "cheaper" } } })
    expect(json.intent).toBe("EDIT_ACTIVE_DRAFT")
    expect(json.draftTarget.mode).toBe("ACTIVE")
    expect(json.mealDraft.id).toBe(draft.id)
  })

  it("E: the handoff expires — 'Maybe later.' then 'I'm craving pizza.' is a new topic", async () => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    const draft = await chocolateCrunchDraft()
    const later = await chat("Maybe later.", { activeDraft: draft, conversation: { handoff: { offer: "cheaper" } } })
    expect(later.intent).toBe("GENERAL_NUTRITION_QUESTION")
    expect(later.conversation.handoff).toBeNull()
    const pizza = await chat("I'm craving pizza.", { activeDraft: draft, conversation: later.conversation })
    expect(pizza.intent).toBe("NEW_CRAVING_REQUEST")
    expect(pizza.topic.food).toBe("pizza")
    expect(pizza.mealDraft).toBeNull()
  })

  it("a bare 'yes' without a live handoff never edits the draft", async () => {
    const draft = await chocolateCrunchDraft()
    const json = await chat("Yes.", { activeDraft: draft })
    expect(json.intent).not.toBe("EDIT_ACTIVE_DRAFT")
    expect(json.mealDraft).toBeNull()
  })

  it("G: 'Actually, forget that meal.' resets without touching the food log", async () => {
    const draft = await chocolateCrunchDraft()
    const json = await chat("Actually, forget that meal.", { activeDraft: draft })
    expect(json.intent).toBe("RESET_CONTEXT")
    expect(json.conversation.deactivateDraft).toBe(true)
    expect(json.conversation.currentTopic).toBeNull()
    expect(json.reply).toMatch(/Nothing was logged/)
  })

  it("'Log this meal' only proposes — the confirm flow owns persistence", async () => {
    const draft = await chocolateCrunchDraft()
    const json = await chat("Log this meal.", { activeDraft: draft })
    expect(json.intent).toBe("LOG_MEAL")
    expect(json.action.type).toBe("PROPOSE_LOG")
    expect(json.reply).toMatch(/nothing is saved until you confirm/i)
  })
})

describe("general questions, preferences, macro provenance", () => {
  it("'Is Greek yogurt good for cutting?' answers without a draft or optimizer", async () => {
    const json = await chat("Is Greek yogurt good for cutting?")
    expect(json.intent).toBe("GENERAL_NUTRITION_QUESTION")
    expect(json.action.type).toBe("NONE")
    expect(json.draftTarget.mode).toBe("NONE")
    expect(json.mealDraft).toBeNull()
    expect(json.toolCalls).toEqual([])
  })

  it.each(["Why does protein help with satiety?", "Is cereal bad when dieting?"])(
    "answers %s conversationally without creating a draft",
    async (message) => {
      const json = await chat(message)
      expect(json.intent).toBe("GENERAL_NUTRITION_QUESTION")
      expect(json.mealDraft).toBeNull()
      expect(optimizerCalled(json)).toBe(false)
    },
  )

  it("F: 'I hate Greek yogurt.' is a PREFERENCE_UPDATE kept as an explicit session signal, with no draft", async () => {
    const json = await chat("I hate Greek yogurt.")
    expect(json.intent).toBe("PREFERENCE_UPDATE")
    expect(json.preferenceSignals).toEqual([{ kind: "DISLIKE", value: "Greek yogurt", strength: "EXPLICIT", scope: "SESSION" }])
    expect(json.mealDraft).toBeNull()
    expect(json.toolCalls).toEqual([])
  })

  it("applies an explicit session dislike to later meal generation without persisting it", async () => {
    const preference = await chat("I hate Greek yogurt.")
    const json = await chat("Build me a meal with Greek yogurt and oats.", { conversation: preference.conversation })
    expect(json.mealDraft?.ingredients.map((item: { ingredientId: string }) => item.ingredientId) ?? []).not.toContain("greek_yogurt")
  })

  it("rejecting the draft ('I don't like this') is not stored as a food dislike", async () => {
    const draft = await chocolateCrunchDraft()
    const json = await chat("I don't like this.", { activeDraft: draft })
    expect(json.intent).not.toBe("PREFERENCE_UPDATE")
  })

  it("'How much protein is in 150g chicken breast?' uses the deterministic calculator, not the model", async () => {
    const json = await chat("How much protein is in 150g chicken breast?")
    expect(json.intent).toBe("MACRO_CALCULATION")
    expect(json.toolCalls).toEqual([{ name: "macro_calculator", ok: true }])
    expect(json.reply).toMatch(/150 g/)
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })

  it("'Give me 45g protein under 450 kcal.' goes through the optimizer", async () => {
    const json = await chat("Give me 45g protein under 450 kcal.")
    expect(json.intent).toBe("NEW_MEAL_REQUEST")
    expect(optimizerCalled(json)).toBe(true)
  })
})

describe("ambiguous natural language topic fallback", () => {
  it("classifies fresh topics without giving the model permission to edit the draft", async () => {
    vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => {
      if (!prompt.includes("Handle one ambiguous Nutrition Coach turn")) {
        return { reply: "That is a fresh topic. We can explore it without changing your active meal.", model: "test" }
      }
      const response = (topic: object) => ({ reply: JSON.stringify({ topic, reply: "That is a fresh topic. We can explore it without changing your active meal." }), model: "test" })
      if (/cereal right now/i.test(prompt)) return response({ type: "CRAVING", food: "cereal", sensoryTargets: ["sweet", "crunchy"] })
      if (/chocolatey/i.test(prompt)) return response({ type: "CRAVING", food: null, sensoryTargets: ["chocolate", "sweet"] })
      if (/cold and sweet/i.test(prompt)) return response({ type: "CRAVING", food: null, sensoryTargets: ["cold", "sweet"] })
      if (/thinking pizza/i.test(prompt)) return response({ type: "FOOD", food: "pizza", sensoryTargets: ["salty", "savory"] })
      if (/Vietnamese/i.test(prompt)) return response({ type: "FOOD", food: "Vietnamese food", sensoryTargets: [] })
      if (/over chicken/i.test(prompt)) return response({ type: "FOOD", food: "chicken", sensoryTargets: [] })
      if (/crunchy but still high protein/i.test(prompt)) return response({ type: "CRAVING", food: null, sensoryTargets: ["crunchy"] })
      return response({ type: "FOOD", food: "Greek yogurt", sensoryTargets: [] })
    })
    const draft = await chocolateCrunchDraft()
    const messages = [
      "Man I could destroy a bowl of cereal right now",
      "I'm feeling something chocolatey",
      "Maybe something cold and sweet?",
      "That bowl was fine but now I'm thinking pizza",
      "Could we do something more Vietnamese tonight?",
      "I'm over chicken today",
      "Got anything crunchy but still high protein?",
      "Actually I just want to know whether Greek yogurt is useful here",
    ]

    for (const message of messages) {
      const json = await chat(message, { activeDraft: draft })
      expect(json.route).toBe("agent_topic")
      expect(json.intent).not.toBe("EDIT_ACTIVE_DRAFT")
      expect(json.draftTarget.mode).toBe("NONE")
      expect(json.mealDraft).toBeNull()
      expect(json.topic.type).not.toBe("MEAL")
      expect(json.topic.sensoryTargets ?? []).not.toContain("savory")
      expect(json.reply).not.toMatch(/Chocolate Crunch Protein Bowl/)
    }
  })
})

describe("quick actions use the same pipeline as typed messages", () => {
  const quick = (label: string) => QUICK_ACTIONS.find((a) => a.label === label)!.message

  it("every quick action is plain natural language with no action id", () => {
    for (const action of QUICK_ACTIONS) {
      expect(Object.keys(action).sort()).toEqual(["label", "message"])
      expect(action.message.length).toBeGreaterThan(20)
    }
  })

  it("craving quick actions start a conversation, not a canned recipe", async () => {
    vi.mocked(isOpenAiConfigured).mockReturnValue(false)
    for (const label of ["Craving chocolate cereal", "Build protein ice cream"]) {
      const json = await chat(quick(label))
      expect(json.intent).toBe("NEW_CRAVING_REQUEST")
      expect(json.mealDraft).toBeNull()
    }
  })

  it("draft quick actions edit the active draft", async () => {
    const draft = await chocolateCrunchDraft()
    for (const label of ["Make this meal tastier", "Make this cheaper", "Make this more filling"]) {
      const json = await chat(quick(label), { activeDraft: draft })
      expect(json.intent).toBe("EDIT_ACTIVE_DRAFT")
      expect(json.mealDraft.id).toBe(draft.id)
    }
  })

  it("meal quick actions build a meal", async () => {
    for (const label of ["Build a high-protein meal", "Use my remaining macros", "Meal under 500 calories", "Help me hit my protein target"]) {
      const json = await chat(quick(label))
      expect(json.intent).toBe("NEW_MEAL_REQUEST")
      expect(json.mealDraft).not.toBeNull()
    }
  })

  it("a draft quick action with no draft asks instead of inventing one", async () => {
    const json = await chat(quick("Make this meal tastier"))
    expect(json.mealDraft).toBeNull()
    expect(json.reply).toMatch(/no active meal draft/i)
  })
})
