import { describe, expect, it, vi } from "vitest"

import { resolveFoodEntity, type FoodCandidate, type ResolveRequest } from "@/lib/intelligence/food-resolution"
import { searchLocalCanonical, searchPreparedCopies } from "@/lib/intelligence/food-resolution/server"

import { makeCtx } from "../../__tests__/fixtures"
import { orchestrateTurn } from "../orchestrate"
import { foodLookupReply, replyViolations } from "../respond"
import { brandContext } from "../shared-query"
import type { RecentMessage } from "../types"

/**
 * The reported KFC conversation (live, 2026-10-24) through Gemma's real planning path. The planner is a stand-in that returns
 * what the live planner returned for each turn; everything after it (frame, brand context, resolver, tools, reply checks) is real.
 * USDA is down, as it often is from this machine: the answer may not depend on it.
 */

const T1 = "yo, how much calories are there for a standard order from KFC=)"
const T2 = "a bucket of fried chicken"
const T3 = "100gr of fried chicken"
const T4 = "but it's fried"

const usdaDown = async () => ({ configured: false, foods: [] as FoodCandidate[] })
const resolveFood = (req: ResolveRequest) => resolveFoodEntity(req, { searchLocal: searchLocalCanonical, searchPrepared: searchPreparedCopies, searchUsda: usdaDown })

function planner(foods: Array<{ text: string; grams: number | null }>, mode: "ANSWER" | "CONTINUE" = "ANSWER") {
  return vi.fn(async () => JSON.stringify({
    understanding: { userGoal: null, explicitRequests: ["food macros"], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: mode === "CONTINUE", referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "food macros", secondaryNeeds: [], needExactCalculation: true, needFoodLookup: true, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
    strategy: { mode, primaryObjective: "state food macros", supportingObjectives: [], requiresConfirmation: false, responseDepth: "SHORT" },
    clarification: null,
    foods,
  }))
}
const failing = vi.fn(async () => null)

async function turn(message: string, recent: RecentMessage[], call: ReturnType<typeof planner> | typeof failing) {
  const out = await orchestrateTurn({ message, recent: [...recent, { role: "user", text: message }], ctx: makeCtx(), call, resolveFood })
  if (out.kind !== "plan") throw new Error(`fallback: ${JSON.stringify(out.diagnostics)}`)
  return out
}

const say = (recent: RecentMessage[], user: string, coach: string): RecentMessage[] => [...recent, { role: "user", text: user }, { role: "coach", text: coach }]

describe("the reported KFC conversation", () => {
  it("1. 'a standard order from KFC' → asks which item/meal and which country, states no numbers", async () => {
    const out = await turn(T1, [], planner([{ text: "standard order from KFC", grams: null }]))
    expect(["CLARIFY", "ASK_ONE_QUESTION"]).toContain(out.plan.strategy.mode)
    expect(out.plan.clarification?.question).toMatch(/Which KFC item or meal/)
    expect(out.plan.clarification?.question).toMatch(/which country/)
    expect(out.results.numbers).toEqual([])
  })

  it("2. 'a bucket of fried chicken' → asks pieces, recipe and sides; never plain chicken breast numbers", async () => {
    const recent = say([], T1, "Which KFC item or meal do you mean — for example a 2-piece chicken meal, a burger or a bucket — and which country are you in?")
    const out = await turn(T2, recent, planner([{ text: "bucket of fried chicken", grams: null }], "CONTINUE"))
    expect(["CLARIFY", "ASK_ONE_QUESTION"]).toContain(out.plan.strategy.mode)
    expect(out.plan.clarification?.question).toMatch(/How many pieces are in the KFC bucket/)
    expect(out.results.numbers).not.toContain(165)
  })

  it("3. '100gr of fried chicken' after KFC → the battered fried record, labelled a generic estimate, never 165/31", async () => {
    const recent = say(say([], T1, "Which KFC item or meal do you mean?"), T2, "How many pieces are in the KFC bucket (for example 6, 8 or 12)?")
    const out = await turn(T3, recent, planner([{ text: "fried chicken", grams: 100 }], "CONTINUE"))
    const food = out.results.foods![0]
    expect(food).toMatchObject({ matched: "Fried Chicken — meat and skin, battered", grams: 100, genericFor: "kfc", source: "USDA_FDC" })
    expect(food.macros).toMatchObject({ calories: 289, protein: 22.5, carbs: 9.4, fat: 17.4 })
    expect(out.results.numbers).not.toContain(165)
    expect(foodLookupReply(out.results, "en")).toMatch(/generic estimate, not KFC's official nutrition/)
    // A composer reply that drops the estimate label is sent back for one repair.
    expect(replyViolations("100 g of KFC fried chicken has 289 kcal and 22.5 g protein.", out.plan, out.context, T3, out.results).join(" ")).toMatch(/not KFC's official nutrition/)
    expect(replyViolations("A generic estimate for 100 g fried chicken (battered, with skin): 289 kcal, 22.5 g protein.", out.plan, out.context, T3, out.results)).toEqual([])
    // Live: "approximately 289 calories ... based on USDA" is a rounding, not the label.
    expect(replyViolations("For 100 g of fried chicken (meat and skin, battered), there are approximately 289 calories and 22.5 g of protein.", out.plan, out.context, T3, out.results)).not.toEqual([])
  })

  it("4. 'but it's fried' → recomputed from the fried record even when the planner offers no foods", async () => {
    const recent = say(say(say([], T1, "Which KFC item or meal do you mean?"), T2, "How many pieces are in the KFC bucket?"), T3, "For 100 g of cooked chicken breast: 165 calories, 31 g protein, 0 carbs, 3.6 g fat.")
    for (const call of [planner([], "CONTINUE"), planner([{ text: "fried chicken", grams: 100 }], "CONTINUE"), failing]) {
      const out = await turn(T4, recent, call)
      const food = out.results.foods![0]
      expect(food.matched).toBe("Fried Chicken — meat and skin, battered")
      expect(food.macros).toMatchObject({ calories: 289, protein: 22.5 })
      expect(food.genericFor).toBe("kfc")
    }
  })
})

describe("preparation corrections without a brand", () => {
  const GRILLED = "macros for 100 g grilled skinless chicken breast"
  it("grilled skinless chicken breast → the plain curated record (165 kcal)", async () => {
    const out = await turn(GRILLED, [], planner([{ text: "grilled skinless chicken breast", grams: 100 }]))
    expect(out.results.foods![0]).toMatchObject({ matched: "Chicken Breast", macros: { calories: 165, protein: 31 } })
    expect(out.results.foods![0].genericFor).toBeUndefined()
  })

  it("'what if it was fried instead?' → fried skinless breast (187 kcal), even when the planner fails", async () => {
    const recent = say([], GRILLED, "For 100 g of grilled skinless chicken breast: 165 kcal, 31 g protein, 0 g carbs, 3.6 g fat.")
    // Live: the planner may name only "fried chicken"; the conversation's skinless breast still decides the record.
    for (const call of [failing, planner([], "CONTINUE"), planner([{ text: "fried chicken", grams: 100 }])]) {
      const out = await turn("what if it was fried instead?", recent, call)
      expect(out.results.foods![0]).toMatchObject({ matched: "Fried Chicken Breast — meat only, no skin or batter", grams: 100, macros: { calories: 187, protein: 33.4 } })
    }
  })

  it("'but it's fried' with no coating known → one coating question, no numbers", async () => {
    const recent = say([], "100 g chicken macros", "For 100 g of cooked chicken breast: 165 kcal, 31 g protein.")
    const out = await turn(T4, recent, planner([], "CONTINUE"))
    expect(out.results.foods![0].clarification).toEqual({ field: "coating", options: ["breaded, with skin", "skinless, no breading"] })
    expect(out.results.foods![0].macros).toBeNull()
    expect(out.results.exactUnavailable).toBeFalsy()
    expect(foodLookupReply(out.results, "en")).toMatch(/breaded with the skin on, or skinless with no breading/)
  })

  it("an ambiguous bucket with no brand still asks its size, whatever mode the planner chose", async () => {
    const out = await turn("calories in a bucket of fried chicken?", [], planner([{ text: "bucket of fried chicken", grams: null }]))
    expect(out.plan.clarification?.question).toMatch(/How many pieces are in the bucket/)
    const proposing = await turn("calories in a bucket of fried chicken?", [], planner([{ text: "bucket of fried chicken", grams: null }], "PROPOSE" as "ANSWER"))
    expect(proposing.plan.clarification?.question).toMatch(/How many pieces are in the bucket/)
  })
})

describe("brand context holds for the foods discussed with it, and lapses on a new food", () => {
  const recent: RecentMessage[] = [{ role: "user", text: T1 }, { role: "coach", text: "Which KFC item or meal do you mean?" }, { role: "user", text: T2 }, { role: "coach", text: "How many pieces are in the KFC bucket?" }]
  it.each([
    ["100gr of fried chicken", "chicken", "kfc"],
    ["100 g grilled salmon", "salmon", null],
    ["kfc fries", undefined, "kfc"],
  ])("%s → %s", (message, base, want) => expect(brandContext(message, [...recent, { role: "user", text: message }], base)).toBe(want))
  it("a hawker centre is a place, not a brand", () => expect(brandContext("chicken rice at the hawker centre", [])).toBeNull())
})
