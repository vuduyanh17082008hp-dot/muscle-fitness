import { describe, expect, it } from "vitest"

import { decideNutritionKnowledgeNeed } from "../../need"
import { getOptionalNutritionKnowledgeContext, scoreAllForEval } from "../../retrieve"
import { ACTIVE_CONFIG, R3_CONFIG } from "../../score"
import { chunkEmbedText } from "../../semantic-rerank"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { embedKey } from "./embed-store"
import { evaluateV4, index } from "./run-eval-v4"
import { g4, R3G_CONFIG, semantic, store } from "./semantic-lab"

/**
 * N1.6.3-R3-G: bounded semantic reranker (DEV candidate, opt-in). Not active: the runtime stays on R3. Replays recorded embeddings,
 * so these run offline. Experiments and numbers: semantic-experiments.print.test.ts, docs/nutrition-knowledge-eval-v4.md "R3-G".
 */
const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
const run = (ids: string[], cfg = R3G_CONFIG) => {
  const out = evaluateV4(ids.map((id) => byId.get(id)!), g4, cfg).results
  return Object.fromEntries(out.map((r) => [r.id, r]))
}
const r3Cases = (ids: string[]) => run(ids, R3_CONFIG)

describe("R3-G: semantic reranker (DEV candidate, opt-in)", { timeout: 120000 }, () => {
  it("is not active and the corpus vectors are current (a corpus edit invalidates them instead of serving stale ones)", () => {
    expect(ACTIVE_CONFIG).toBe(R3_CONFIG)
    expect(ACTIVE_CONFIG.semantic).toBeUndefined()
    const stale = index.items.filter((i) => (["body", "titled"] as const).some((c) => !store.lookup(chunkEmbedText(i.chunk, c))))
    expect(stale.map((i) => i.chunk.id)).toEqual([])
    expect(embedKey("a")).not.toBe(embedKey("a "))
  })

  it("semantic sibling distinction: the right sibling section moves to Top-1 where lexical R3 had it second or missing", () => {
    const ids = ["d4-tx04", "d4-tx07", "d4-cr17"]
    const before = r3Cases(ids), after = run(ids)
    expect(before["d4-tx04"].sectionRank).toBe(2)
    expect(before["d4-tx07"].sectionRank).toBeNull()
    for (const id of ids) expect(after[id].sectionRank).toBe(1)
  })

  it("low-overlap (OOV) query where lexical ties fail: 'shatter on the outside of baked wings' finds crispness only with embeddings", () => {
    const before = r3Cases(["d4-tx13", "d4-cu15"]), after = run(["d4-tx13", "d4-cu15"]) // R3-I: d4-tx06 is now found lexically (volume section vocabulary), so d4-cu15 replaces it as the second OOV example
    for (const id of ["d4-tx13", "d4-cu15"]) {
      expect(before[id].sectionRank).toBeNull()
      expect(after[id].sectionRank).not.toBeNull()
      expect(after[id].sectionRank!).toBeLessThanOrEqual(3)
    }
  })

  it("Vietnamese / mixed queries: no translation table, the recorded multilingual vectors still rescue a section", () => {
    const ids = ["d4-vi03", "d4-mk17"]
    const before = r3Cases(ids), after = run(ids)
    for (const id of ids) {
      expect(before[id].sectionRank).toBeNull()
      expect(after[id].sectionRank).not.toBeNull()
    }
  })

  it("multi-document queries keep their breadth (Coverage@4 does not fall) and a semantically dominant document does not take every primary slot", () => {
    const multi = CASES_V4_DEV.filter((c) => c.multiDocument).map((c) => c.id)
    const cov = (cfg: typeof R3_CONFIG) => evaluateV4(CASES_V4_DEV, g4, cfg).report.doc
    expect(cov(R3G_CONFIG).coverageAt4).toBeGreaterThanOrEqual(cov(R3_CONFIG).coverageAt4)
    expect(cov(R3G_CONFIG).fullCoverageAt4).toBeGreaterThanOrEqual(cov(R3_CONFIG).fullCoverageAt4)
    for (const r of Object.values(run(multi)).filter((x) => x.fired)) expect(Math.max(...Object.values(r.primary.reduce<Record<string, number>>((m, id) => ((m[id.split("::")[0]] = (m[id.split("::")[0]] ?? 0) + 1), m), {})))).toBeLessThanOrEqual(3)
  })

  it("embeddings never bypass the gate and never add candidates: gate decisions are identical, nothing outside the lexical pool is returned", async () => {
    expect(evaluateV4(CASES_V4_DEV, g4, R3G_CONFIG).report.gate).toEqual(evaluateV4(CASES_V4_DEV, g4, R3_CONFIG).report.gate)
    const notNeeded = decideNutritionKnowledgeNeed({ message: "log 150g grilled chicken breast for lunch" })
    expect(notNeeded.needed).toBe(false)
    expect(await getOptionalNutritionKnowledgeContext({ message: "log 150g grilled chicken breast for lunch", need: notNeeded }, { index })).toBeNull()
    for (const r of evaluateV4(CASES_V4_DEV, g4, R3G_CONFIG).results.filter((x) => x.fired && x.query)) {
      const lexical = new Set(scoreAllForEval(index, r.query!, R3_CONFIG).map((s) => s.item.chunk.id))
      for (const id of r.primary) expect(lexical.has(id)).toBe(true)
    }
  })

  it("R3 and R3-G differ on a known semantic ambiguity; a missing vector falls back to the exact R3 order (fail open)", () => {
    const id = "d4-mk12" // "do I need protein powder in my cereal or is that overkill": R3 ranks the target 2nd
    expect(r3Cases([id])[id].sectionRank).toBe(2)
    expect(run([id])[id].sectionRank).toBe(1)
    const skipped: string[][] = []
    const blind = semantic({ mode: "blend", embed: () => undefined, onSkip: (m) => void skipped.push(m) })
    expect(run([id], blind)[id].primary).toEqual(r3Cases([id])[id].primary)
    expect(skipped.length).toBeGreaterThan(0)
  })

  it("bounds hold: G1 keeps every document's score multiset, G2 moves a score by at most epsilon, blend stays inside the pool's score range", () => {
    const queries = evaluateV4(CASES_V4_DEV, g4, R3_CONFIG).results.filter((r) => r.fired && r.query).map((r) => r.query!)
    const perDoc = (xs: ReturnType<typeof scoreAllForEval>) => {
      const m = new Map<string, number[]>()
      for (const x of xs) m.set(x.item.chunk.documentId, [...(m.get(x.item.chunk.documentId) ?? []), x.score])
      return new Map([...m].map(([d, v]) => [d, v.sort((a, b) => b - a)]))
    }
    for (const q of queries) {
      const lex = scoreAllForEval(index, q, R3_CONFIG)
      const g1 = scoreAllForEval(index, q, semantic({ mode: "section", corpus: "titled" }))
      expect(perDoc(g1)).toEqual(perDoc(lex))
      const lexScore = new Map(lex.map((x) => [x.item.chunk.id, x.score]))
      for (const x of scoreAllForEval(index, q, semantic({ mode: "tie", corpus: "titled", epsilon: 0.06 }))) expect(Math.abs(x.score - lexScore.get(x.item.chunk.id)!)).toBeLessThanOrEqual(0.06 + 1e-9)
      const top = lex.slice(0, 12).map((x) => x.score)
      for (const x of scoreAllForEval(index, q, R3G_CONFIG).slice(0, 12)) {
        expect(x.score).toBeLessThanOrEqual(Math.max(...top) + 1e-9)
        expect(x.score).toBeGreaterThanOrEqual(Math.min(...top) - 1e-9)
      }
    }
  })

  it("DEV non-regression: Section Top-3 and sibling-sensitive Top-3 improve materially, Recall@3 and wrong-document do not regress", () => {
    const r3 = evaluateV4(CASES_V4_DEV, g4, R3_CONFIG).report
    const g = evaluateV4(CASES_V4_DEV, g4, R3G_CONFIG).report
    expect(g.section.top3).toBeGreaterThanOrEqual(r3.section.top3 + 0.07)
    expect(g.section.siblingSensitiveTop3).toBeGreaterThanOrEqual(r3.section.siblingSensitiveTop3 + 0.05)
    expect(g.doc.recallAt3).toBeGreaterThanOrEqual(r3.doc.recallAt3)
    expect(g.doc.wrongDocRate).toBeLessThanOrEqual(r3.doc.wrongDocRate)
    expect(g.ops.contextMaxChars).toBeLessThanOrEqual(3200)
    expect(g.ops.zeroResultRate).toBeLessThanOrEqual(0.02)
  })
})
