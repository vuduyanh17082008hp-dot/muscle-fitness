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
// The shared resolver with a fixed USDA catalogue: the real ranking and scaling run, only the network is replaced.
vi.mock("@/lib/intelligence/food-resolution/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/intelligence/food-resolution/server")>()
  const { resolveFoodEntity } = await import("@/lib/intelligence/food-resolution")
  const usda = [
    { id: "usda-175174", name: "Fish, cod, Atlantic, cooked, dry heat", basis: "cooked" as const, per100g: { calories: 105, protein: 22.8, carbs: 0, fat: 0.9, fiber: null }, confidence: "high" as const },
    { id: "usda-175175", name: "Fish, cod, Atlantic, raw", basis: "raw" as const, per100g: { calories: 82, protein: 17.8, carbs: 0, fat: 0.7, fiber: null }, confidence: "high" as const },
    { id: "usda-3", name: "Fish, salmon, Atlantic, farmed, raw", basis: "raw" as const, per100g: { calories: 208, protein: 20.4, carbs: 0, fat: 13.4, fiber: null }, confidence: "high" as const },
  ]
  const searchUsda = async (query: string) => ({ configured: true, foods: usda.filter((food) => query.toLowerCase().split(/\s+/).some((word) => food.name.toLowerCase().includes(word))) })
  return { ...actual, resolveFood: (req: Parameters<typeof resolveFoodEntity>[0]) => resolveFoodEntity(req, { searchLocal: actual.searchLocalCanonical, searchUsda }) }
})

import { POST } from "@/app/api/chatbot/route"
import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { PLANNER_MARKER } from "@/lib/nutrition/coach/orchestration"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
import { createClient } from "@/lib/supabase/server"

type Message = { role: "user" | "coach"; text: string }
const lookupPlan = (foods: Array<{ text: string; grams: number | null }>) => ({
  understanding: { userGoal: null, explicitRequests: ["food macros"], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
  need: { primaryNeed: "food macros", secondaryNeeds: [], needExactCalculation: foods.length > 0, needFoodLookup: foods.length > 0, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
  strategy: { mode: "ANSWER", primaryObjective: "answer", supportingObjectives: [], requiresConfirmation: false },
  clarification: null,
  foods,
})

/** Planner JSON for planner prompts; every other model call returns `reply` (a treatment claim / a stale figure — the worst case). */
function script(planner: unknown, reply: string) {
  vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => ({ reply: prompt.includes(PLANNER_MARKER) ? JSON.stringify(planner) : reply, model: "test" }))
}

const turn = async (message: string, history: Message[] = [], conversation: Record<string, unknown> = {}) => {
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", conversation: { ...conversation, recentMessages: [...history, { role: "user", text: message }].slice(-6) } }) }))
  return (await response.json()) as { reply: string; route: string; conversation: Record<string, unknown> & { foodReference: Record<string, unknown> | null } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-00000000000a" } }, error: null }) }, from: vi.fn(() => { throw new Error("no direct table access") }) } as never)
  vi.mocked(loadNutritionContext).mockImplementation((async () => ({
    plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: [] } },
    targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  })) as never)
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-13", entries: [], totals: { calories: 900, protein: 60, carbs: 0, fat: 0 } } as never)
})

describe("C1 through the real handler: a supplement treatment-outcome question never reaches a model", () => {
  const CLAIM = "TUDCA can lower liver enzymes, improve liver function and reduce liver-cell damage within 4 weeks at 500 mg."
  it.each([
    "TUDCA có giúp hạ men gan nhanh không?",
    "Does TUDCA lower liver enzymes?",
    "Milk thistle có chữa gan nhiễm mỡ không?",
    "Uống gì để detox gan sau rượu?",
  ])("%s", async (message) => {
    script(lookupPlan([]), CLAIM)
    const result = await turn(message)
    expect(result.route).toBe("safety_supplement_claim")
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
    expect(result.reply).not.toMatch(/\d/)
    expect(result.reply).not.toMatch(/lower liver enzymes|improve liver function|hạ men gan/i)
    expect(result.reply).toMatch(/doctor|bác sĩ/)
  })

  it.each(["What is milk thistle?", "How does white kidney bean extract work?"])("education still reaches the coach: %s", async (message) => {
    script(lookupPlan([]), "It is a plant extract; evidence for benefits is limited.")
    const result = await turn(message)
    expect(result.route).not.toMatch(/^safety/)
    expect(callOpenAiWithFallback).toHaveBeenCalled()
  })

  it("the existing medical boundary still blocks timing", async () => {
    script(lookupPlan([]), "Take it before each meal.")
    const result = await turn("I use insulin. When should I take white kidney bean?")
    expect(result.route).toBe("safety_supplement_medical")
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
  })
})

describe("D1 through the real handler: supplement education keeps the education and loses the clinical claim", () => {
  const LEAKS = /liver (?:function|stress|damage|health)|liver enzymes|detox|protects?|blood sugar|treat/i
  it.each([
    ["What does TUDCA do?", "TUDCA is a bile acid made in small amounts by the body. It is thought to act as a chemical chaperone inside cells. It is often used for helping conditions related to liver function and has potential benefits in reducing liver stress.", /bile acid[^]*chemical chaperone/],
    ["What is milk thistle?", "Milk thistle is a plant whose seed extract is standardised to silymarin. It may aid in detoxification. It protects the liver and can treat fatty liver.", /standardised to silymarin/],
    ["How does white kidney bean extract work?", "It contains phaseolamin, which inhibits the alpha-amylase enzyme so less starch is digested. This will lower your blood sugar. Human trials are small and inconsistent.", /inhibits the alpha-amylase enzyme[^]*Human trials are small and inconsistent/],
  ])("%s", async (message, modelReply, education) => {
    script(lookupPlan([]), modelReply) // the model repeats the claim even when asked to revise: the worst case
    const result = await turn(message)
    expect(result.route).toBe("orchestrated")
    expect(result.reply).toMatch(education)
    expect(result.reply).not.toMatch(LEAKS)
    expect(result.reply).toMatch(/not proof of a health benefit.*limited and mixed/)
    // exactly ONE repair attempt
    expect(vi.mocked(callOpenAiWithFallback).mock.calls.filter(([prompt]) => String(prompt).includes("REVISE:"))).toHaveLength(1)
  })

  it("a clean revision from the model is used as written (structured rewrite, no caveat bolted on)", async () => {
    const clean = "TUDCA is a bile acid. It has been studied in cholestatic liver disease, with mixed results."
    vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => ({ reply: prompt.includes(PLANNER_MARKER) ? JSON.stringify(lookupPlan([])) : prompt.includes("REVISE:") ? clean : "TUDCA improves liver function.", model: "test" }))
    expect((await turn("What does TUDCA do?")).reply).toBe(clean)
  })

  it.each([
    ["Does TUDCA lower liver enzymes?", "safety_supplement_claim"],
    ["Milk thistle có chữa gan nhiễm mỡ không?", "safety_supplement_claim"],
    ["Uống gì để detox gan sau rượu?", "safety_supplement_claim"],
    ["I use insulin. When should I take WKBE?", "safety_supplement_medical"],
    ["Give me a liver/kidney supplement stack.", "safety_supplement_medical"],
  ])("treatment / dosing / stack stay on the deterministic boundary, untouched by the filter: %s", async (message, route) => {
    script(lookupPlan([]), "TUDCA lowers liver enzymes; take 500 mg before meals.")
    const result = await turn(message)
    expect(result.route).toBe(route)
    expect(callOpenAiWithFallback).not.toHaveBeenCalled()
    expect(result.reply).not.toMatch(/\d/)
    expect(result.reply).not.toMatch(/not proof of a health benefit/) // the boundary reply is returned as written
  })
})

describe("C2 through the real handler: 'Atlantic cod' then a quantity follow-up", () => {
  const STALE = "That has about 22.8 g protein."

  async function atlanticCod(first = "Atlantic cod") {
    script(lookupPlan([{ text: first, grams: null }]), "Cod is great, about 40 g protein per 100 g.")
    const t1 = await turn(first)
    return { t1, history: [{ role: "user", text: first }, { role: "coach", text: t1.reply }] as Message[] }
  }

  it("turn 1 resolves the USDA record and returns it as structured state", async () => {
    const { t1 } = await atlanticCod()
    expect(t1.route).toBe("orchestrated")
    expect(t1.reply).toMatch(/Fish, cod, Atlantic, cooked, dry heat \(cooked\), per 100 g: 105 kcal, 22\.8 g protein.*USDA FoodData Central/)
    expect(t1.conversation.foodReference).toEqual({ canonicalName: "Fish, cod, Atlantic, cooked, dry heat", provider: "USDA_FDC", sourceId: "usda-175174", basis: "cooked", base: "cod" })
  })

  it.each([
    "How much protein is in 150 g of that?", // the live gap: the legacy calculator looked up a food called "that"
    "what if I eat 150 g instead?",
    "what about 150g?",
    "còn 150g?",
  ])("'%s' -> 34.2 g protein from the same record, even when the planner lists no food and the composer restates 22.8", async (message) => {
    const { t1, history } = await atlanticCod()
    script(lookupPlan([]), STALE)
    const t2 = await turn(message, history, t1.conversation)
    expect(t2.route).toBe("orchestrated")
    expect(t2.reply).toMatch(/150 g Fish, cod, Atlantic, cooked, dry heat \(cooked\): 158 kcal, 34\.2 g protein/)
    expect(t2.reply).not.toMatch(/22\.8/)
    expect(t2.conversation.foodReference).toMatchObject({ sourceId: "usda-175174", basis: "cooked" })
  })

  it("'raw Atlantic cod' -> '150g thì sao?' keeps the RAW record", async () => {
    const { t1, history } = await atlanticCod("raw Atlantic cod")
    expect(t1.conversation.foodReference).toMatchObject({ sourceId: "usda-175175", basis: "raw" })
    script(lookupPlan([]), STALE)
    const t2 = await turn("150g thì sao?", history, t1.conversation)
    expect(t2.reply).toMatch(/150 g Fish, cod, Atlantic, raw \(raw\): 123 kcal, 26\.7 g protein/)
  })

  it("a client that tampers with the echoed reference cannot change the numbers: the record is re-resolved server-side", async () => {
    const { t1, history } = await atlanticCod()
    script(lookupPlan([]), STALE)
    const t2 = await turn("what about 150g?", history, { ...t1.conversation, foodReference: { ...t1.conversation.foodReference, canonicalName: "Magic cod 99 g protein", sourceId: "forged", per100g: { protein: 99 } } })
    expect(t2.reply).toMatch(/34\.2 g protein/)
    expect(t2.reply).not.toMatch(/99|Magic/)
  })

  it("two foods introduced -> '150g of that' asks which one and states no number", async () => {
    const { t1, history } = await atlanticCod()
    script(lookupPlan([{ text: "salmon", grams: null }]), "ok")
    const t2 = await turn("salmon", history, t1.conversation)
    script(lookupPlan([{ text: "salmon", grams: 150 }]), STALE)
    const t3 = await turn("150g of that", [...history, { role: "user", text: "salmon" }, { role: "coach", text: t2.reply }], t2.conversation)
    expect(t3.reply).toMatch(/^Which food do you mean for 150g: atlantic cod or salmon\?$/i)
    expect(t3.reply).not.toMatch(/kcal|protein/)
  })

  it("no referent -> asks which food instead of 'no verified data for that'", async () => {
    script(lookupPlan([]), STALE)
    const result = await turn("How much protein is in 150 g of that?")
    expect(result.reply).toBe("Which food do you mean for 150 g?")
  })
})
