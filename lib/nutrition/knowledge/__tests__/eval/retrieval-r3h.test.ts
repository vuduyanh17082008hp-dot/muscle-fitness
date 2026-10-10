import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { protectedDocuments } from "../../hybrid"
import { decideNutritionKnowledgeNeed } from "../../need"
import { getOptionalNutritionKnowledgeContext, scoreAllForEval } from "../../retrieve"
import { ACTIVE_CONFIG, R3_CONFIG } from "../../score"
import { CASES } from "./cases"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { evaluate, layeredGate } from "./run-eval"
import { evaluateV4, index } from "./run-eval-v4"
import { g4, hybrid, R3G_CONFIG, R3H_CONFIG, semantic } from "./semantic-lab"

/**
 * N1.6.3-R3-H: document signal (R3-F) x semantic section rerank (R3-G) with query-structure multi-document protection (DEV candidate, opt-in).
 * Activated at runtime by R3-H2 (runtime-semantic.ts); ACTIVE_CONFIG stays R3 as the deterministic fallback. Replays recorded embeddings (offline). Experiments: r3h-experiments.print.test.ts, docs "R3-H".
 */
const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
const run = (ids: string[], cfg = R3H_CONFIG) => Object.fromEntries(evaluateV4(ids.map((id) => byId.get(id)!), g4, cfg).results.map((r) => [r.id, r]))
const docOf = (id: string) => id.replace("nutrition.", "").split("::")[0]
const okDocs = (id: string) => { const c = byId.get(id)!; return new Set([...(c.expectedDocumentIds ?? []), ...(c.anyOfDocumentIds ?? []), ...(c.acceptableDocumentIds ?? [])]) }
const wrong3 = (r: { id: string; primary: string[] }) => r.primary.slice(0, 3).filter((p) => !okDocs(r.id).has(docOf(p))).length

describe("R3-H: hybrid document + semantic section retrieval (DEV candidate, opt-in)", { timeout: 120000 }, () => {
  it("is not active; the gate decisions are identical to R3 and embeddings cannot bypass the gate or add candidates", async () => {
    expect(ACTIVE_CONFIG).toBe(R3_CONFIG)
    expect(ACTIVE_CONFIG.hybrid).toBeUndefined()
    expect(evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG).report.gate).toEqual(evaluateV4(CASES_V4_DEV, g4, R3_CONFIG).report.gate)
    const notNeeded = decideNutritionKnowledgeNeed({ message: "log 150g grilled chicken breast for lunch" })
    expect(await getOptionalNutritionKnowledgeContext({ message: "log 150g grilled chicken breast for lunch", need: notNeeded }, { index })).toBeNull()
    for (const r of evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG).results.filter((x) => x.fired && x.query)) {
      const lexical = new Set(scoreAllForEval(index, r.query!, R3_CONFIG).map((s) => s.item.chunk.id))
      for (const id of r.primary) expect(lexical.has(id)).toBe(true)
    }
  })

  it("document-level ambiguity: the document signal removes distractor documents that the section rerank alone left in the top 3", () => {
    const ids = ["d4-tx03", "d4-tx07", "d4-tx26", "d4-fl06", "d4-pr04"]
    const g3 = run(ids, R3G_CONFIG), h = run(ids)
    for (const id of ids) expect(wrong3(h[id])).toBeLessThanOrEqual(wrong3(g3[id]))
    expect(ids.reduce((s, id) => s + wrong3(h[id]), 0)).toBeLessThan(ids.reduce((s, id) => s + wrong3(g3[id]), 0))
  })

  it("semantic sibling disambiguation survives the document prior: the right sibling is Top-1 where lexical R3 had it second or missing", () => {
    const ids = ["d4-tx04", "d4-tx07"]
    const before = run(ids, R3_CONFIG), after = run(ids)
    expect(before["d4-tx04"].sectionRank).toBe(2)
    expect(before["d4-tx07"].sectionRank).toBeNull()
    for (const id of ids) expect(after[id].sectionRank).toBe(1)
  })

  it("OOV / low-overlap: sections that lexical R3 cannot find are retrieved (English, Vietnamese, makeover)", () => {
    const ids = ["d4-tx13", "d4-tx16", "d4-mk01", "d4-mk02"]
    const before = run(ids, R3_CONFIG), after = run(ids)
    for (const id of ids) {
      expect(before[id].sectionRank).toBeNull()
      expect(after[id].sectionRank).not.toBeNull()
      expect(after[id].sectionRank!).toBeLessThanOrEqual(3)
    }
  })

  it("Vietnamese / mixed semantic queries still work with no translation table", () => {
    const ids = ["d4-tx16", "d4-vi03", "d4-mk17", "d4-fl13", "d4-cr15"]
    for (const id of ids) expect(run([id])[id].sectionRank).not.toBeNull()
  })

  it("multi-document breadth is preserved: v4 Coverage@4 and every historical v1 multi-document case are at least R3's", () => {
    const cov = (cfg: typeof R3_CONFIG) => evaluateV4(CASES_V4_DEV, g4, cfg).report.doc
    expect(cov(R3H_CONFIG).coverageAt4).toBeGreaterThanOrEqual(cov(R3_CONFIG).coverageAt4)
    expect(cov(R3H_CONFIG).fullCoverageAt4).toBeGreaterThanOrEqual(cov(R3_CONFIG).fullCoverageAt4)
    const l2 = layeredGate(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))
    const found = (cfg: typeof R3_CONFIG) => new Map(evaluate(cfg, "all", CASES as never, l2).results.filter((r) => r.mandatoryTotal > 1).map((r) => [r.id, r.mandatoryFound]))
    const before = found(R3_CONFIG), after = found(R3H_CONFIG)
    expect(before.size).toBeGreaterThan(0)
    for (const [id, n] of before) expect(after.get(id)!).toBeGreaterThanOrEqual(n) // F5 lost required documents here
  })

  it("protection is structural and conditional: it fires only for a stated goal with a non-goal leader, never forces a second document otherwise", () => {
    const cfg = R3H_CONFIG.hybrid!.protect!
    expect(cfg.max).toBe(0) // no score-ratio slot reservation
    const withGoal = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG).results.filter((r) => r.fired && r.query)
    const protectedRuns = withGoal.filter((r) => {
      const scored = scoreAllForEval(index, r.query!, R3G_CONFIG)
      return protectedDocuments(scored, [], cfg, r.query!).length > 0
    })
    expect(protectedRuns.length).toBeGreaterThan(0)
    expect(protectedRuns.length).toBeLessThan(withGoal.length / 2)
    for (const r of withGoal.filter((x) => !x.query!.goalStated)) expect(protectedDocuments(scoreAllForEval(index, r.query!, R3G_CONFIG), [], cfg, r.query!)).toEqual([])
  })

  it("fallback: with no vectors (embedding unavailable) the result is exactly R3, whole pipeline, and chat-side retrieval stays valid", () => {
    const skipped: string[][] = []
    const blind = hybrid({ docPrior: 0.3, protect: R3H_CONFIG.hybrid!.protect }, { embed: () => undefined, onSkip: (m) => void skipped.push(m) })
    const ids = ["d4-tx03", "d4-mk12", "d4-gs01", "d4-md01", "d4-cu07"]
    const r3 = run(ids, R3_CONFIG), fb = run(ids, blind)
    for (const id of ids) expect(fb[id].primary).toEqual(r3[id].primary)
    expect(skipped.length).toBeGreaterThan(0)
    expect(semantic({ mode: "blend" }).hybrid).toBeUndefined()
  })

  it("DEV non-regression vs R3 and R3-G: wrong-document and Section Top-3 improve, Recall@3 / breadth / context hold", () => {
    const r3 = evaluateV4(CASES_V4_DEV, g4, R3_CONFIG).report, g3 = evaluateV4(CASES_V4_DEV, g4, R3G_CONFIG).report, h = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG).report
    expect(h.doc.wrongDocRate).toBeLessThanOrEqual(r3.doc.wrongDocRate - 0.05)
    expect(h.doc.wrongDocRate).toBeLessThan(g3.doc.wrongDocRate)
    expect(h.section.top3).toBeGreaterThanOrEqual(g3.section.top3)
    expect(h.doc.recallAt3).toBeGreaterThanOrEqual(g3.doc.recallAt3)
    expect(h.doc.coverageAt4).toBeGreaterThanOrEqual(g3.doc.coverageAt4)
    expect(h.ops.contextMaxChars).toBeLessThanOrEqual(3200)
    expect(h.ops.zeroResultRate).toBeLessThanOrEqual(0.02)
  })
})
