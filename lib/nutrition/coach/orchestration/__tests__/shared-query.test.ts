import { describe, expect, it, vi } from "vitest"

import { resolveFoodEntity, type FoodCandidate, type ResolveRequest, type ResolverDeps } from "@/lib/intelligence/food-resolution"
import { searchLocalCanonical } from "@/lib/intelligence/food-resolution/server"

import { makeCtx } from "../../__tests__/fixtures"
import { buildContextBudget } from "../budget"
import { orchestrateTurn } from "../orchestrate"
import { composeReply, foodLookupReply } from "../respond"
import type { RecentMessage } from "../types"

const cand = (id: string, name: string, basis: FoodCandidate["basis"], calories: number, protein: number, carbs = 0, fat = 1): FoodCandidate => ({ id, name, basis, per100g: { calories, protein, carbs, fat, fiber: null }, confidence: "high" })

const USDA_FIXTURE = [
  cand("usda-175174", "Fish, cod, Atlantic, cooked, dry heat", "cooked", 105, 22.8),
  cand("usda-175175", "Fish, cod, Atlantic, raw", "raw", 82, 17.8),
  cand("usda-3", "Fish, salmon, Atlantic, farmed, raw", "raw", 208, 20.4, 0, 13.4),
  cand("usda-4", "Fish, salmon, Atlantic, farmed, cooked, dry heat", "cooked", 206, 22.1, 0, 12.3),
]

function resolver(opts: { configured?: boolean; calls?: ReturnType<typeof vi.fn> } = {}) {
  const deps: ResolverDeps = {
    searchLocal: searchLocalCanonical,
    searchUsda: async (q) => {
      opts.calls?.(q)
      const words = q.toLowerCase().split(/\s+/)
      if (opts.configured === false) return { configured: false, foods: [] } // same as the real wiring: no key → no call
      return { configured: true, foods: USDA_FIXTURE.filter((f) => words.some((w) => f.name.toLowerCase().includes(w))) }
    },
  }
  return (req: ResolveRequest) => resolveFoodEntity(req, deps)
}

/** A planner stand-in: returns the structured JSON the real planner would for this turn. */
function planner(foods: Array<{ text: string; grams: number | null }>) {
  return vi.fn(async () => JSON.stringify({
    understanding: { userGoal: null, explicitRequests: ["food macros"], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "food macros", secondaryNeeds: [], needExactCalculation: true, needFoodLookup: true, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
    strategy: { mode: "ANSWER", primaryObjective: "state food macros", supportingObjectives: [], requiresConfirmation: false, responseDepth: "SHORT" },
    clarification: null,
    foods,
  }))
}

async function turn(message: string, recent: RecentMessage[], foods: Array<{ text: string; grams: number | null }>, resolveFood = resolver()) {
  const out = await orchestrateTurn({ message, recent, ctx: makeCtx(), call: planner(foods), resolveFood })
  if (out.kind !== "plan") throw new Error(`fallback: ${JSON.stringify(out.diagnostics)}`)
  return out
}

const T1: RecentMessage[] = [{ role: "user", text: "do u think cod fish is a good source of protien" }, { role: "coach", text: "Yes, cod is a lean, high-protein fish." }]

describe("Gemma cod conversation through the shared resolver", () => {
  it("'give me the macro' → cod per 100 g from the local canonical table, provenance attached", async () => {
    const calls = vi.fn()
    const out = await turn("give me the macro", T1, [{ text: "cod fish", grams: null }], resolver({ calls }))
    const food = out.results.foods![0]
    expect(food).toMatchObject({ matched: "White Fish (cod)", grams: null, source: "LOCAL_CANONICAL" })
    expect(food.per100g).toMatchObject({ calories: 105, protein: 23, status: "VERIFIED" })
    expect(out.results.exactUnavailable).toBeFalsy()
    expect(calls).not.toHaveBeenCalled() // generic cod needs no external source
  })

  it("'what about 200g?' → deterministic scaling of the same verified values", async () => {
    const recent: RecentMessage[] = [...T1, { role: "user", text: "give me the macro" }, { role: "coach", text: "Cod: 105 kcal, 23 g protein per 100 g." }]
    const out = await turn("what about 200g?", recent, [{ text: "cod fish", grams: 200 }])
    expect(out.results.foods![0].macros).toEqual({ calories: 210, protein: 46, carbs: 0, fat: 1.8 })
    expect(out.results.numbers).toEqual(expect.arrayContaining([200, 210, 46]))
    expect(out.results.binding).toMatchObject({ source: "DETERMINISTIC_SERVICE", mayInvent: false, mayRecalculate: false })
  })

  it("'same but Atlantic cod?' → USDA-specific record AND the 200 g the planner dropped", async () => {
    const recent: RecentMessage[] = [...T1, { role: "user", text: "give me the macro" }, { role: "coach", text: "..." }, { role: "user", text: "what about 200g?" }, { role: "coach", text: "200 g cod: 210 kcal, 46 g protein." }]
    const out = await turn("same but Atlantic cod?", recent, [{ text: "Atlantic cod", grams: null }])
    const food = out.results.foods![0]
    expect(food.source).toBe("USDA_FDC")
    expect(food.matched).toMatch(/Atlantic/)
    expect(food.grams).toBe(200)
    expect(food.macros).toMatchObject({ calories: 210, protein: 45.6 }) // 105 x 2, 22.8 x 2 = 45.6 (grams keep one decimal)
  })

  it("'same but raw?' picks the USDA raw record instead of presenting cooked numbers as raw", async () => {
    const recent: RecentMessage[] = [{ role: "user", text: "200g cod" }, { role: "coach", text: "210 kcal" }]
    const out = await turn("same but raw?", recent, [{ text: "cod", grams: 200 }])
    expect(out.results.foods![0]).toMatchObject({ source: "USDA_FDC", grams: 200 })
    expect(out.results.foods![0].macros?.calories).toBe(164) // 82 x 2
  })

  it("raw requested while USDA is unavailable → local numbers flagged ESTIMATED, never silently exact", async () => {
    const recent: RecentMessage[] = [{ role: "user", text: "200g cod" }, { role: "coach", text: "210 kcal" }]
    const out = await turn("same but raw?", recent, [{ text: "cod", grams: null }], resolver({ configured: false }))
    expect(out.results.foods![0].grams).toBe(200)
    expect(out.results.foods![0].source).toBe("LOCAL_CANONICAL")
  })

  it("a food that is NOT in the local table is verified through USDA instead of 'exact unavailable'", async () => {
    const out = await turn("macros for salmon", [], [{ text: "salmon", grams: null }])
    const food = out.results.foods![0]
    expect(food).toMatchObject({ source: "USDA_FDC", grams: null })
    expect(food.per100g).toMatchObject({ calories: 208, protein: 20.4, fat: 13.4, status: "VERIFIED" })
    expect(out.results.exactUnavailable).toBeFalsy()
  })

  it("no USDA key and not local → honest 'matched: null', no invented number", async () => {
    const out = await turn("macros for salmon", [], [{ text: "salmon", grams: null }], resolver({ configured: false }))
    expect(out.results.foods![0]).toMatchObject({ matched: null, macros: null })
    expect(out.results.numbers).not.toContain(100) // no per-100 g figure was produced
    expect(out.results.exactUnavailable).toBe(true)
  })

  it("raw vs cooked ambiguity with a quantity → ONE clarification, not 'calculation unavailable'", async () => {
    const tuna = [cand("t1", "Fish, tuna, bluefin, raw", "raw", 144, 23.3), cand("t2", "Fish, tuna, bluefin, cooked, dry heat", "cooked", 184, 29.9)]
    const deps: ResolverDeps = { searchLocal: () => null, searchUsda: async () => ({ configured: true, foods: tuna }) }
    const out = await turn("200g bluefin tuna macros", [], [{ text: "bluefin tuna", grams: 200 }], (req) => resolveFoodEntity(req, deps))
    expect(out.results.foods![0].clarification).toEqual({ field: "preparation", options: ["raw", "cooked"] })
    expect(out.results.foods![0].macros).toBeNull()
    expect(out.results.exactUnavailable).toBeFalsy()
  })

  it("resolver crash degrades to the legacy local lookup", async () => {
    const out = await turn("macros for cod", [], [{ text: "cod", grams: null }], async () => { throw new Error("boom") })
    expect(out.results.foods![0].per100g).toMatchObject({ calories: 105 })
  })
})

/**
 * B1 — deterministic macro authority. Live defect: "100 g cooked Atlantic cod = 23 g protein", then "150 g = about 23 g".
 * The scaled value is owned by the tool (one scaling step, from the unrounded source profile); a model reply that
 * restates an earlier amount's figure for a new amount never reaches the user.
 */
describe("B1: quantity follow-ups are scaled by the tool, never restated by the model", () => {
  const ctx = makeCtx()
  /** A planner that reads the follow-up as pure continuity: no foods, no exact calculation (the live failure shape). */
  const continuity = () => vi.fn(async () => JSON.stringify({
    understanding: { userGoal: null, explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: true, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "continue", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "MEDIUM" },
    strategy: { mode: "CONTINUE", primaryObjective: "continue", supportingObjectives: [], requiresConfirmation: false, responseDepth: "SHORT" },
    clarification: null,
    foods: [],
  }))
  const STALE = "150 g of cod has about 23 g protein and 105 kcal."
  const COD_100: RecentMessage[] = [{ role: "user", text: "macros for 100 g cod" }, { role: "coach", text: "100 g White Fish (cod) (cooked): 105 kcal, 23 g protein, 0 g carbs, 0.9 g fat (source: the app's curated table)." }]

  async function ask(message: string, recent: RecentMessage[], modelReply: string | null = STALE) {
    const out = await orchestrateTurn({ message, recent, ctx, call: continuity(), resolveFood: resolver() })
    if (out.kind !== "plan") throw new Error("expected plan")
    const budget = buildContextBudget(out.plan, out.context, ctx, out.results, [], null)
    const composed = await composeReply({ message, plan: out.plan, context: out.context, ctx, results: out.results, budget, knowledgeText: null, call: async () => modelReply })
    return { food: out.results.foods?.[0], results: out.results, composed }
  }

  it("100 g -> 150 g: 34.5 g protein, and the model's stale '23 g' is replaced by the tool result", async () => {
    const { food, results, composed } = await ask("what about 150 g?", COD_100)
    expect(food).toMatchObject({ grams: 150, basis: "COOKED", source: "LOCAL_CANONICAL", macros: { calories: 158, protein: 34.5, carbs: 0, fat: 1.4 } })
    expect(results.binding).toMatchObject({ source: "DETERMINISTIC_SERVICE", mayRecalculate: false, mayInvent: false })
    expect(composed?.source).toBe("lookup")
    expect(composed?.reply).toMatch(/150 g White Fish \(cod\) \(cooked\): 158 kcal, 34\.5 g protein/)
    expect(composed?.reply).not.toMatch(/\b23 g protein/)
  })

  it("100 g -> 200 g: 46 g protein", async () => {
    const { food, composed } = await ask("what about 200 g?", COD_100, "200 g cod is still about 23 g protein.")
    expect(food?.macros).toEqual({ calories: 210, protein: 46, carbs: 0, fat: 1.8 })
    expect(composed?.reply).toMatch(/210 kcal, 46 g protein/)
  })

  it("a correct model reply that uses the tool's number is kept as written", async () => {
    const { composed } = await ask("what about 150 g?", COD_100, "150 g of cooked cod gives you 34.5 g protein for 158 kcal.")
    expect(composed).toEqual({ reply: "150 g of cooked cod gives you 34.5 g protein for 158 kcal.", source: "model" })
  })

  it.each([
    "how much protein is in 150 g of that?",
    "ok and for 150 grams how much protein would that be",
    "and 150 g?",
    "make it 150 g",
  ])("follow-up quantity phrasing '%s' still runs the tool (34.5 g)", async (message) => {
    const { food, composed } = await ask(message, COD_100)
    expect(food?.macros?.protein).toBe(34.5)
    expect(composed?.reply).not.toMatch(/\b23 g protein/)
  })

  it("150 g -> 'same protein, fewer calories': the 150 g figure stays 34.5 g and a restated 23 g is rejected", async () => {
    const recent: RecentMessage[] = [...COD_100, { role: "user", text: "what about 150 g?" }, { role: "coach", text: "150 g White Fish (cod) (cooked): 158 kcal, 34.5 g protein." }]
    const { food, composed } = await ask("what has the same protein as 150 g cod but fewer calories?", recent, "Cod at 150 g has 23 g protein; egg whites match that for fewer calories.")
    expect(food).toMatchObject({ grams: 150, macros: { calories: 158, protein: 34.5 } })
    expect(composed?.reply ?? "").not.toMatch(/\b23 g protein/)
  })

  it("a new amount the frame cannot resolve to a lookup still never inherits an earlier amount's number", async () => {
    const { food, composed } = await ask("so is 150 g a sensible dinner portion for me then, do you think?", COD_100)
    expect(food).toBeUndefined() // no tool ran for this phrasing
    expect(composed).toBeNull() // so the stale reply is rejected, not shown (the caller's grounded fallback answers)
  })

  it("generic cod -> Atlantic cod keeps the amount and switches to the USDA record; 150 g = 22.8 x 1.5 = 34.2", async () => {
    const same = await ask("same but Atlantic cod?", COD_100, null)
    expect(same.food).toMatchObject({ source: "USDA_FDC", grams: 100, basis: "COOKED", macros: { calories: 105, protein: 22.8 } })
    const recent: RecentMessage[] = [...COD_100, { role: "user", text: "same but Atlantic cod?" }, { role: "coach", text: "100 g Fish, cod, Atlantic, cooked, dry heat (cooked): 105 kcal, 22.8 g protein (source: USDA FoodData Central)." }]
    const next = await ask("what about 150 g?", recent)
    expect(next.food).toMatchObject({ source: "USDA_FDC", grams: 150, matched: "Fish, cod, Atlantic, cooked, dry heat", macros: { calories: 158, protein: 34.2 } })
    expect(next.composed?.reply).toMatch(/34\.2 g protein.*USDA FoodData Central/)
  })

  it("raw vs cooked: a raw lookup stays raw across the quantity follow-up (17.8 x 1.5 = 26.7), never the cooked profile", async () => {
    const recent: RecentMessage[] = [{ role: "user", text: "macros for 100 g raw cod" }, { role: "coach", text: "100 g Fish, cod, Atlantic, raw (raw): 82 kcal, 17.8 g protein (source: USDA FoodData Central)." }]
    const raw = await ask("what about 150 g?", recent)
    expect(raw.food).toMatchObject({ grams: 150, basis: "RAW", source: "USDA_FDC", macros: { calories: 123, protein: 26.7 } })
    const cooked = await ask("same but cooked?", [...recent, { role: "user", text: "what about 150 g?" }, { role: "coach", text: "150 g raw: 123 kcal, 26.7 g protein." }], null)
    expect(cooked.food).toMatchObject({ grams: 150, basis: "COOKED", macros: { protein: 34.5 } })
  })

  it("exact numeric consistency: every amount is per-100 g x grams / 100, from the unrounded source profile", async () => {
    for (const grams of [100, 150, 200, 250, 333]) {
      const { food } = await ask(`what about ${grams} g?`, [{ role: "user", text: "Atlantic cod macros" }, { role: "coach", text: "..." }], null)
      expect(food?.macros?.protein).toBe(Math.round(22.8 * (grams / 100) * 10) / 10)
      expect(food?.macros?.calories).toBe(Math.round(105 * (grams / 100)))
    }
  })
})

/**
 * C2 — structured food follow-up continuity. Live gap: "Atlantic cod" (USDA, 22.8 g / 100 g) then "How much protein is in
 * 150 g of that?" returned no number. The referent comes from the previous turn's structured state and is re-resolved by the
 * tool; the model's memory and arithmetic are never used.
 */
describe("C2: a quantity follow-up reuses the structured food reference", () => {
  const ctx = makeCtx()
  const USDA_COOKED = "Fish, cod, Atlantic, cooked, dry heat (cooked), per 100 g: 105 kcal, 22.8 g protein, 0 g carbs, 1 g fat (source: USDA FoodData Central). Tell me your portion and I'll calculate it."
  const said = (...texts: string[]): RecentMessage[] => texts.map((text, i) => ({ role: i % 2 === 0 ? "user" : "coach", text }))
  /** The planner is down and the composer restates the per-100 g figure: the worst case for continuity. */
  async function follow(message: string, recent: RecentMessage[], extras: Parameters<typeof orchestrateTurn>[0]["extras"] = {}, resolveFood = resolver()) {
    const out = await orchestrateTurn({ message, recent, ctx, call: async () => null, resolveFood, extras })
    if (out.kind !== "plan") throw new Error(`fallback: ${JSON.stringify(out.diagnostics)}`)
    const budget = buildContextBudget(out.plan, out.context, ctx, out.results, [], null)
    const composed = await composeReply({ message, plan: out.plan, context: out.context, ctx, results: out.results, budget, knowledgeText: null, call: async () => "That has about 22.8 g protein." })
    return { out, food: out.results.foods?.[0], composed }
  }

  it("the resolving turn emits a bounded reference: name, provider, source id, basis", async () => {
    const out = await turn("Atlantic cod", [], [{ text: "Atlantic cod", grams: null }])
    expect(out.foodReference).toEqual({ canonicalName: "Fish, cod, Atlantic, cooked, dry heat", provider: "USDA_FDC", sourceId: "usda-175174", basis: "cooked", base: "cod" })
    expect(out.results.foods![0].per100g).toMatchObject({ protein: 22.8, basis: "COOKED" })
  })

  it.each([
    "how much protein is in 150 g of that?",
    "what if I eat 150 g instead?",
    "what about 150g?",
    "còn 150g?",
  ])("Atlantic cod -> '%s' = 22.8 x 1.5 = 34.2 g, same USDA record, scaled by the tool", async (message) => {
    const { food, out, composed } = await follow(message, said("Atlantic cod", USDA_COOKED))
    expect(food).toMatchObject({ matched: "Fish, cod, Atlantic, cooked, dry heat", source: "USDA_FDC", grams: 150, basis: "COOKED", macros: { calories: 158, protein: 34.2 } })
    expect(out.results.binding).toMatchObject({ source: "DETERMINISTIC_SERVICE", mayRecalculate: false, mayInvent: false })
    expect(out.foodReference?.sourceId).toBe("usda-175174")
    expect(composed?.reply).toMatch(/34\.2 g protein/)
    expect(composed?.reply).not.toMatch(/22\.8/)
  })

  it("'macro cod fish' -> '200g?' scales the curated entry (210 kcal, 46 g)", async () => {
    const { food } = await follow("200g?", said("macro cod fish", "White Fish (cod) (cooked), per 100 g: 105 kcal, 23 g protein."))
    expect(food).toMatchObject({ source: "LOCAL_CANONICAL", grams: 200, macros: { calories: 210, protein: 46 } })
  })

  it("'raw Atlantic cod' -> '150g thì sao?' stays RAW (17.8 x 1.5 = 26.7), never the cooked profile", async () => {
    const { food, composed } = await follow("150g thì sao?", said("raw Atlantic cod", "Fish, cod, Atlantic, raw (raw), per 100 g: 82 kcal, 17.8 g protein."))
    expect(food).toMatchObject({ matched: "Fish, cod, Atlantic, raw", basis: "RAW", grams: 150, macros: { calories: 123, protein: 26.7 } })
    expect(composed?.reply).toMatch(/\(raw\): 123 kcal, 26\.7 g protein/)
  })

  it("the reference pins the basis when the words alone would have to re-ask raw vs cooked", async () => {
    const tuna = [cand("t1", "Fish, tuna, bluefin, raw", "raw", 144, 23.3), cand("t2", "Fish, tuna, bluefin, cooked, dry heat", "cooked", 184, 29.9)]
    const deps: ResolverDeps = { searchLocal: () => null, searchUsda: async () => ({ configured: true, foods: tuna }) }
    const resolveTuna = (req: ResolveRequest) => resolveFoodEntity(req, deps)
    const recent = said("tuna", "Fish, tuna, bluefin, raw (raw), per 100 g: 144 kcal, 23.3 g protein.")
    const without = await follow("200g?", recent, {}, resolveTuna)
    expect(without.food?.clarification).toEqual({ field: "preparation", options: ["raw", "cooked"] })
    const pinned = await follow("200g?", recent, { foodReference: { canonicalName: "Fish, tuna, bluefin, raw", provider: "USDA_FDC", sourceId: "t1", basis: "raw", base: "tuna" } }, resolveTuna)
    expect(pinned.food).toMatchObject({ matched: "Fish, tuna, bluefin, raw", basis: "RAW", macros: { calories: 288, protein: 46.6 } })
    // A reference for a different food is ignored, and a preparation the user states this turn always wins.
    const other = await follow("200g?", recent, { foodReference: { canonicalName: "x", provider: "USDA_FDC", sourceId: "x", basis: "cooked", base: "cod" } }, resolveTuna)
    expect(other.food?.clarification).toBeDefined()
    const cooked = await follow("200g cooked?", recent, { foodReference: { canonicalName: "Fish, tuna, bluefin, raw", provider: "USDA_FDC", sourceId: "t1", basis: "raw", base: "tuna" } }, resolveTuna)
    expect(cooked.food).toMatchObject({ basis: "COOKED", macros: { calories: 368 } })
  })

  it.each([
    ["150g of that", said("Atlantic cod", USDA_COOKED, "salmon", "Fish, salmon, Atlantic, farmed, raw (raw), per 100 g: 208 kcal."), /^Which food do you mean for 150g: Atlantic cod or salmon\?$/i],
    ["how much protein is in 150 g of that?", said("compare cod and salmon", "Both are high in protein."), /^Which food do you mean for 150 g: cod or salmon\?$/],
    ["150g thì sao?", said("cá tuyết", "...", "cá hồi", "..."), /^Bạn muốn tính 150g cho món nào: cá tuyết hay cá hồi\?$/],
  ])("two plausible foods -> '%s' asks which one, never picks", async (message, recent, question) => {
    const { out, composed } = await follow(message, recent)
    expect(["CLARIFY", "ASK_ONE_QUESTION"]).toContain(out.plan.strategy.mode)
    expect(out.results.foods).toBeUndefined()
    expect(out.results.numbers).toEqual([])
    expect(composed).toMatchObject({ source: "question" })
    expect(composed?.reply).toMatch(question)
  })

  it("no referent at all -> asks which food, states no number", async () => {
    const { out, composed } = await follow("150g of that", [])
    expect(["CLARIFY", "ASK_ONE_QUESTION"]).toContain(out.plan.strategy.mode)
    expect(composed?.reply).toBe("Which food do you mean for 150g?")
  })

  it("a planner that guessed ANSWER on an ambiguous reference is overridden by the clarification", async () => {
    const out = await orchestrateTurn({ message: "150g of that", recent: said("Atlantic cod", USDA_COOKED, "salmon", "..."), ctx, call: planner([{ text: "salmon", grams: 150 }]), resolveFood: resolver() })
    if (out.kind !== "plan") throw new Error("expected plan")
    expect(["CLARIFY", "ASK_ONE_QUESTION"]).toContain(out.plan.strategy.mode)
    expect(out.results.foods).toBeUndefined()
  })

  it("an older food does not make the latest one ambiguous once the conversation moved on", async () => {
    const { food } = await follow("150g?", said("Atlantic cod", USDA_COOKED, "thanks", "Any time.", "salmon", "Fish, salmon, Atlantic, farmed, raw (raw), per 100 g: 208 kcal."))
    expect(food).toMatchObject({ matched: "Fish, salmon, Atlantic, farmed, raw", grams: 150 })
  })
})

describe("planner/composer outage does not degrade a plain food lookup", () => {
  const ctx = makeCtx()
  const recent: RecentMessage[] = [{ role: "user", text: "cá tuyết macro sao" }, { role: "coach", text: "..." }]

  it("planner returns nothing → the frame supplies the food + 200 g, tools still produce exact numbers", async () => {
    const out = await orchestrateTurn({ message: "200g thì sao", recent, ctx, call: async () => null, resolveFood: resolver() })
    expect(out.kind).toBe("plan")
    if (out.kind !== "plan") return
    expect(out.fallbackStage).toBe(2)
    expect(out.results.foods![0]).toMatchObject({ grams: 200, macros: { calories: 210, protein: 46 } })
  })

  it("planner and composer both down → deterministic Vietnamese lookup reply built only from verified numbers", async () => {
    const out = await orchestrateTurn({ message: "200g thì sao", recent, ctx, call: async () => null, resolveFood: resolver() })
    if (out.kind !== "plan") throw new Error("expected plan")
    const budget = buildContextBudget(out.plan, out.context, ctx, out.results, [], null)
    const composed = await composeReply({ message: "200g thì sao", plan: out.plan, context: out.context, ctx, results: out.results, budget, knowledgeText: null, call: async () => null })
    expect(composed?.source).toBe("lookup")
    expect(composed?.reply).toMatch(/210 kcal, 46 g protein/)
    expect(composed?.reply).toMatch(/bảng dữ liệu của app/)
  })

  it("composer invents a macro → rejected, replaced by the verified lookup (never the invented number)", async () => {
    const out = await orchestrateTurn({ message: "macros for cod", recent: [], ctx, call: planner([{ text: "cod", grams: null }]), resolveFood: resolver() })
    if (out.kind !== "plan") throw new Error("expected plan")
    const budget = buildContextBudget(out.plan, out.context, ctx, out.results, [], null)
    const composed = await composeReply({ message: "macros for cod", plan: out.plan, context: out.context, ctx, results: out.results, budget, knowledgeText: null, call: async () => "Cod has 480 calories and 61 g protein per 100 g." })
    expect(composed?.source).toBe("lookup")
    expect(composed?.reply).not.toMatch(/480|61 g/)
    expect(composed?.reply).toMatch(/105 kcal, 23 g protein/)
  })

  it("planner recognises a lookup but lists NO foods (live Vietnamese failure) → the frame supplies the food, numbers are verified", async () => {
    const lazy = vi.fn(async () => JSON.stringify({
      understanding: { userGoal: null, explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
      need: { primaryNeed: "food macros", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: true, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "MEDIUM" },
      strategy: { mode: "ANSWER", primaryObjective: "answer", supportingObjectives: [], requiresConfirmation: false, responseDepth: "SHORT" },
      clarification: null,
      foods: [],
    }))
    const out = await orchestrateTurn({ message: "macro cá tuyết sao", recent: [], ctx, call: lazy, resolveFood: resolver() })
    if (out.kind !== "plan") throw new Error("expected plan")
    expect(out.results.foods![0]).toMatchObject({ matched: "White Fish (cod)", source: "LOCAL_CANONICAL" })
    expect(out.results.foods![0].per100g).toMatchObject({ calories: 105, protein: 23 })
  })

  it("planner treats 'same but Atlantic cod?' as pure continuity (no tools) → the frame still forces the verified 200 g lookup", async () => {
    const recent: RecentMessage[] = [{ role: "user", text: "200g cod" }, { role: "coach", text: "210 kcal, 46 g protein" }]
    const cont = vi.fn(async () => JSON.stringify({
      understanding: { userGoal: null, explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: true, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
      need: { primaryNeed: "continue", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "MEDIUM" },
      strategy: { mode: "CONTINUE", primaryObjective: "continue", supportingObjectives: [], requiresConfirmation: false, responseDepth: "SHORT" },
      clarification: null,
      foods: [],
    }))
    const out = await orchestrateTurn({ message: "same but Atlantic cod?", recent, ctx, call: cont, resolveFood: resolver() })
    if (out.kind !== "plan") throw new Error("expected plan")
    expect(out.results.foods![0]).toMatchObject({ source: "USDA_FDC", grams: 200 })
    expect(out.results.foods![0].macros).toMatchObject({ calories: 210, protein: 45.6 })
  })

  it("an active meal draft keeps the planner's decision (\"what about 200g?\" may mean the draft)", async () => {
    const recent: RecentMessage[] = [{ role: "user", text: "cod macros" }, { role: "coach", text: "105 kcal" }]
    const cont = planner([])
    const out = await orchestrateTurn({ message: "what about 200g?", recent, ctx, call: cont, resolveFood: resolver(), extras: { hasActiveDraft: true } })
    if (out.kind !== "plan") throw new Error("expected plan")
    expect(out.results.foods).toBeUndefined()
  })

  it("a planner that chose to ASK a question is never overridden by the frame", async () => {
    const asks = vi.fn(async () => JSON.stringify({
      understanding: { userGoal: null, explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: ["portion"], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
      need: { primaryNeed: "x", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: true, needActionConfirmation: false, confidence: "MEDIUM" },
      strategy: { mode: "ASK_ONE_QUESTION", primaryObjective: "ask", supportingObjectives: [], requiresConfirmation: false, responseDepth: "SHORT" },
      clarification: { question: "Which cod?", affects: "calculation" },
      foods: [],
    }))
    const out = await orchestrateTurn({ message: "macros for cod", recent: [], ctx, call: asks, resolveFood: resolver() })
    if (out.kind !== "plan") throw new Error("expected plan")
    expect(out.plan.strategy.mode).toBe("ASK_ONE_QUESTION")
    expect(out.results.foods).toBeUndefined()
  })

  it("lookup reply: USDA provenance, estimate flag and the single raw/cooked question", () => {
    const base = { numbers: [], executed: [], blocked: [] }
    const usda = foodLookupReply({ ...base, foods: [{ asked: "salmon", matched: "Fish, salmon, Atlantic, farmed, raw", grams: null, macros: null, source: "USDA_FDC", per100g: { calories: 208, protein: 20, carbs: 0, fat: 13, basis: "RAW", status: "VERIFIED" } }] }, "en")
    expect(usda).toContain("USDA FoodData Central")
    expect(usda).toContain("(raw), per 100 g: 208 kcal")
    const asked = foodLookupReply({ ...base, foods: [{ asked: "tuna", matched: null, grams: 200, macros: null, clarification: { field: "preparation", options: ["raw", "cooked"] } }] }, "en")
    expect(asked).toMatch(/raw or cooked/)
    expect(foodLookupReply({ ...base, foods: [{ asked: "x", matched: null, grams: null, macros: null }] }, "en")).toBeNull()
  })

  it("a stateful question is never answered by the lookup fallback", async () => {
    const out = await orchestrateTurn({ message: "can I fit 200g cod into what I have left?", recent: [], ctx, call: planner([{ text: "cod", grams: 200 }]), resolveFood: resolver() })
    if (out.kind !== "plan") throw new Error("expected plan")
    const budget = buildContextBudget(out.plan, out.context, ctx, out.results, [], null)
    const composed = await composeReply({ message: "can I fit 200g cod into what I have left?", plan: out.plan, context: out.context, ctx, results: out.results, budget, knowledgeText: null, call: async () => null })
    expect(composed?.source).not.toBe("lookup")
  })
})
