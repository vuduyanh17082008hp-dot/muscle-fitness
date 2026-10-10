import { rankDocumentsForEval, type HierConfig } from "../../hierarchical"
import { scoreAllForEval } from "../../retrieve"
import { ACTIVE_CONFIG, R3_CONFIG, type ScoreConfig } from "../../score"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { docOf, f3 } from "./run-eval-v3"
import { DEV_RECORDING_PATH_V4, evaluateV4, layeredGateV4, oracleGateV4, readRecordingV4, subsetReportsV4, unitsOf, index } from "./run-eval-v4"

/** N1.6.3-R3-F experiment lab (test-only). Every experiment is measured on the same frozen DEV split, same recorded Layer-2 replies. */
const gate = layeredGateV4(readRecordingV4(DEV_RECORDING_PATH_V4))
const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))

export const H_BASE: HierConfig = {
  docWeights: { category: 0.16, foodType: 0.14, cuisine: 0.08, sensory: 0.1, goal: 0.06, title: 0.08, locale: 0.04, authority: 0.04, evidence: 0.38, concept: 0.25, coverage: 0, evidence2: 0 },
  sectionMode: "local",
  sectionWeights: { heading: 0.35, lexical: 0.35, concept: 0.2, sensory: 0.1 },
  docShare: 0.5,
  candidates: { n: Infinity, ratio: 0 },
  minSection: 0,
}
export const withHier = (base: ScoreConfig, h: Partial<HierConfig>, over: Partial<ScoreConfig> = {}): ScoreConfig => ({ ...base, ...over, hier: { ...H_BASE, ...h } })

/** Document ranking quality alone: ranking = documents by documentScore (hier) or by best flat chunk score (flat). */
export function docRankMetrics(config: ScoreConfig) {
  const { results } = evaluateV4(CASES_V4_DEV, gate, config)
  let n = 0, r1 = 0, r3 = 0, mrr = 0
  for (const r of results) {
    const c = byId.get(r.id)!
    if (!c.expectedKnowledgeNeed || !r.fired || !r.query) continue
    const ranked = config.hier
      ? rankDocumentsForEval(index.items, index.stats, r.query, config).map((d) => docOf(d.documentId))
      : [...new Set(scoreAllForEval(index, r.query, { ...config, relativeFloor: undefined }).map((s) => docOf(s.item.chunk.id)))]
    const us = unitsOf(c)
    const hit = (k: number) => us.filter((u) => u.some((d) => ranked.slice(0, k).includes(d))).length
    const first = ranked.findIndex((d) => us.some((u) => u.includes(d)))
    n++
    r1 += hit(1) / us.length
    r3 += hit(3) / us.length
    mrr += first < 0 ? 0 : 1 / (first + 1)
  }
  return { docR1: r1 / n, docR3: r3 / n, docMrr: mrr / n }
}

export function measure(name: string, config: ScoreConfig) {
  const { report: r, results } = evaluateV4(CASES_V4_DEV, gate, config)
  const sub = subsetReportsV4(CASES_V4_DEV, results)
  const d = docRankMetrics(config)
  const s = (x: { doc: { recallAt3: number }; section: { top3: number } }) => `${f3(x.doc.recallAt3)}/${f3(x.section.top3)}`
  return [
    `${name.padEnd(26)} P=${f3(r.gate.precision)} R=${f3(r.gate.recall)} | R@1=${f3(r.doc.recallAt1)} R@3=${f3(r.doc.recallAt3)} R@4=${f3(r.doc.recallAt4)} e2e=${f3(r.doc.endToEndRecallAt3)} MRR=${f3(r.doc.mrr)} wrongDoc=${f3(r.doc.wrongDocRate)}`,
    `${"".padEnd(26)} secT1=${f3(r.section.top1)} secT3=${f3(r.section.top3)} wrongSec=${f3(r.section.wrongSectionRate)} sibSurv=${f3(r.section.siblingSurvival)} sibT3=${f3(r.section.siblingSensitiveTop3)} cov@4=${f3(r.doc.coverageAt4)} full@4=${f3(r.doc.fullCoverageAt4)}`,
    `${"".padEnd(26)} DOCRANK R1=${f3(d.docR1)} R3=${f3(d.docR3)} MRR=${f3(d.docMrr)} | slices R3/secT3: vi ${s(sub.language.vi)} mixed ${s(sub.language.mixed)} goal ${s(sub.failureClass.GOAL_STRATEGY)} poly ${s(sub.failureClass.POLYSEMY)} oov ${s(sub.failureClass.LOW_OVERLAP)}`,
    `${"".padEnd(26)} avgPrimary=${r.ops.avgPrimaryChunks.toFixed(2)} ctx=${Math.round(r.ops.contextAvgChars)}/${r.ops.contextMaxChars} lat=${r.ops.latencyAvgMs.toFixed(2)}/${r.ops.latencyP95Ms.toFixed(2)}ms zero=${f3(r.ops.zeroResultRate)}`,
  ].join("\n")
}

export const oracleLine = (name: string, config: ScoreConfig) => {
  const o = evaluateV4(CASES_V4_DEV, oracleGateV4, config).report
  return `${name.padEnd(26)} ORACLE R@3=${f3(o.doc.recallAt3)} wrongDoc=${f3(o.doc.wrongDocRate)} secT3=${f3(o.section.top3)}`
}
export { ACTIVE_CONFIG, R3_CONFIG }

/** One compact row for grid sweeps. */
export function row(name: string, config: ScoreConfig) {
  const { report: r, results } = evaluateV4(CASES_V4_DEV, gate, config)
  const o = evaluateV4(CASES_V4_DEV, oracleGateV4, config).report
  void results
  return `${name.padEnd(34)} R@1=${f3(r.doc.recallAt1)} R@3=${f3(r.doc.recallAt3)} e2e=${f3(r.doc.endToEndRecallAt3)} wrong=${f3(r.doc.wrongDocRate)} | T1=${f3(r.section.top1)} T3=${f3(r.section.top3)} wSec=${f3(r.section.wrongSectionRate)} sib=${f3(r.section.siblingSurvival)} cov=${f3(r.doc.coverageAt4)} | prim=${r.ops.avgPrimaryChunks.toFixed(2)} | oracle R3=${f3(o.doc.recallAt3)} wr=${f3(o.doc.wrongDocRate)} T3=${f3(o.section.top3)}`
}
