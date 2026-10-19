import { describe, expect, it } from "vitest"

import { gateFill, retrieveKnowledge } from "../retrieve"
import { R3_CONFIG, type ScoredChunk, type ScoreSignals } from "../score"
import type { NutritionKnowledgeQuery } from "../types"
import { getKnowledgeIndex } from "../retrieve"

const sig = (o: Partial<ScoreSignals> = {}): ScoreSignals => ({ lexicalBody: 0, localMatch: 0, headingMatch: 0, titleMatch: 0, category: 0, foodType: 0, sensory: 0, concept: 0, cuisine: 0, goal: 0, locale: 0, authority: 0, ...o })
const chunk = (doc: string, n: number, o: Partial<ScoreSignals> = {}, category = "craving"): ScoredChunk =>
  ({ item: { chunk: { id: `${doc}::s${n}`, documentId: doc, metadata: { category } } }, score: 1 - n / 10, signals: sig(o), breakdown: {} }) as unknown as ScoredChunk
const q = (o: Partial<NutritionKnowledgeQuery> = {}): NutritionKnowledgeQuery => ({ query: "x", ...o })
const ids = (xs: ScoredChunk[]) => xs.map((x) => x.item.chunk.id)

describe("R3-I-S relevance-gated fill (opt-in)", () => {
  const strong = { localMatch: 0.5 }
  it("A: a dominant single-document query returns fewer than the maximum when the rest is filler", () => {
    const picked = [chunk("a", 1, strong), chunk("a", 2, strong), chunk("b", 3), chunk("c", 4)]
    for (const m of ["S1", "S2", "S3"] as const) expect(ids(gateFill(picked, q(), m))).toEqual(["a::s1", "a::s2"])
  })
  it("B: several strong sections of the same document survive", () => {
    const picked = [chunk("a", 1, strong), chunk("a", 2, strong), chunk("a", 3, strong), chunk("b", 4)]
    expect(gateFill(picked, q(), "S1")).toHaveLength(3)
  })
  it("C: a second document with its own evidence or an explicit facet is preserved", () => {
    expect(ids(gateFill([chunk("a", 1, strong), chunk("b", 2, strong)], q(), "S2"))).toEqual(["a::s1", "b::s2"])
    const goalDoc = chunk("g", 2, { goal: 1 }, "goal")
    expect(gateFill([chunk("a", 1, strong), goalDoc], q({ goalStated: true }), "S3")).toHaveLength(2)
    expect(gateFill([chunk("a", 1, strong), goalDoc], q({ goalStated: true }), "S2")).toHaveLength(1)
    expect(gateFill([chunk("a", 1, strong), chunk("v", 2, { cuisine: 1 })], q(), "S3")).toHaveLength(2)
  })
  it("D: slot #4 is not forced and the walk stops at the first filler", () => {
    const picked = [chunk("a", 1, strong), chunk("b", 2), chunk("c", 3, strong), chunk("d", 4, strong)]
    expect(ids(gateFill(picked, q(), "S1"))).toEqual(["a::s1"])
  })
  it("E: a useful fourth chunk is retained when it carries evidence", () => {
    const picked = [chunk("a", 1, strong), chunk("a", 2, strong), chunk("b", 3, { concept: 0.4 }), chunk("c", 4, { headingMatch: 0.2 })]
    expect(gateFill(picked, q(), "S1")).toHaveLength(4)
  })
  it("F: R3 stays byte-for-byte without a fill mode, and a fill mode only ever removes a suffix", () => {
    const index = getKnowledgeIndex()
    const query: NutritionKnowledgeQuery = { query: "crunchy cereal craving", categories: ["craving", "food_makeover"], sensoryTargets: ["crunchy"], locale: "global", topK: 4 }
    const need = { needed: true, reason: "CRAVING" as const, confidence: "HIGH" as const, rationale: "t" }
    const base = (retrieveKnowledge(index, query, need, R3_CONFIG).context?.chunks ?? []).filter((c) => c.sourceType === "primary").map((c) => c.id)
    const gated = (retrieveKnowledge(index, query, need, { ...R3_CONFIG, fill: "S3" }).context?.chunks ?? []).filter((c) => c.sourceType === "primary").map((c) => c.id)
    expect(R3_CONFIG.fill).toBeUndefined()
    expect(base.slice(0, gated.length)).toEqual(gated)
    expect(gated.length).toBeLessThanOrEqual(base.length)
  })
})
