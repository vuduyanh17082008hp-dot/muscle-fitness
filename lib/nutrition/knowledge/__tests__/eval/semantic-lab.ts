import { readFileSync } from "node:fs"
import { join } from "node:path"

import { chunkEmbedText, type SemanticConfig } from "../../semantic-rerank"
import type { HybridConfig } from "../../hybrid"
import { R3_CONFIG, R3F_CONFIG, type ScoreConfig } from "../../score"
import { CASES } from "./cases"
import { CASES_V2 } from "./cases-v2"
import { CASES_V3_DEV } from "./cases-v3-dev"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { openStore } from "./embed-store"
import { evaluate, layeredGate } from "./run-eval"
import { DEV_RECORDING_PATH, evaluateV3, f3, layeredGate as layeredV3, readRecording } from "./run-eval-v3"
import { DEV_RECORDING_PATH_V4, evaluateV4, index, layeredGateV4, oracleGateV4, readRecordingV4, subsetReportsV4 } from "./run-eval-v4"

/** N1.6.3-R3-G experiment lab (test-only; DEV splits only, the sealed v4 split is never loaded). */
export const store = openStore()
export let skips = 0

export const semantic = (over: Partial<SemanticConfig>): ScoreConfig => ({
  ...R3_CONFIG,
  semantic: { mode: "section", k: 12, query: "raw", corpus: "body", embed: store.lookup, onSkip: () => void skips++, ...over },
})

const l2 = layeredGate(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))
const g3 = layeredV3(readRecording(DEV_RECORDING_PATH))
export const g4 = layeredGateV4(readRecordingV4(DEV_RECORDING_PATH_V4))

/** Every suite (v1, v2, v3.1 DEV, v4 DEV) under one config. */
export function fourSuites(cfg: ScoreConfig) {
  return {
    v1: evaluate(cfg, "all", CASES as never, l2).report,
    v2: evaluate(cfg, "all", CASES_V2 as never, l2).report,
    v3: evaluateV3(CASES_V3_DEV, g3, cfg).report,
    v4: evaluateV4(CASES_V4_DEV, g4, cfg).report,
  }
}

export function multiLine(name: string, cfg: ScoreConfig) {
  const { v1, v2, v3, v4 } = fourSuites(cfg)
  const avg = (a: number, b: number, c: number, d: number) => (a + b + c + d) / 4
  return `${name.padEnd(30)} R@3 v1=${f3(v1.docRecallAt3)} v2=${f3(v2.docRecallAt3)} v31=${f3(v3.doc.recallAt3)} v4=${f3(v4.doc.recallAt3)} | wrong v1=${f3(v1.wrongDocumentRate)} v2=${f3(v2.wrongDocumentRate)} v31=${f3(v3.doc.wrongDocRate)} v4=${f3(v4.doc.wrongDocRate)} | secT3 v1=${f3(v1.section.top3)} v2=${f3(v2.section.top3)} v31=${f3(v3.section.top3)} v4=${f3(v4.section.top3)} | AVG R3=${f3(avg(v1.docRecallAt3, v2.docRecallAt3, v3.doc.recallAt3, v4.doc.recallAt3))} wrong=${f3(avg(v1.wrongDocumentRate, v2.wrongDocumentRate, v3.doc.wrongDocRate, v4.doc.wrongDocRate))} secT3=${f3(avg(v1.section.top3, v2.section.top3, v3.section.top3, v4.section.top3))}`
}

/** One v4 DEV block: gate-layered metrics plus oracle-gate retrieval isolation and the slices that matter for R3-G. */
export function v4Block(name: string, cfg: ScoreConfig) {
  const { report: r, results } = evaluateV4(CASES_V4_DEV, g4, cfg)
  const o = evaluateV4(CASES_V4_DEV, oracleGateV4, cfg).report
  const sub = subsetReportsV4(CASES_V4_DEV, results)
  const sl = (x: { doc: { recallAt3: number }; section: { top3: number } }) => `${f3(x.doc.recallAt3)}/${f3(x.section.top3)}`
  return [
    `${name.padEnd(30)} P=${f3(r.gate.precision)} R=${f3(r.gate.recall)} | R@1=${f3(r.doc.recallAt1)} R@3=${f3(r.doc.recallAt3)} R@4=${f3(r.doc.recallAt4)} e2e=${f3(r.doc.endToEndRecallAt3)} MRR=${f3(r.doc.mrr)} wrongDoc=${f3(r.doc.wrongDocRate)}`,
    `${"".padEnd(30)} secT1=${f3(r.section.top1)} secT3=${f3(r.section.top3)} wrongSec=${f3(r.section.wrongSectionRate)} | sibSens T1=${f3(r.section.siblingSensitiveTop1)} T3=${f3(r.section.siblingSensitiveTop3)} (n=${r.section.siblingSensitiveCases}) surv=${f3(r.section.siblingSurvival)} suppr=${f3(r.section.siblingSuppressedBySelection)} (n=${r.section.alsoUsefulCases})`,
    `${"".padEnd(30)} cov@4=${f3(r.doc.coverageAt4)} full@4=${f3(r.doc.fullCoverageAt4)} (n=${r.doc.multiDocCases}) | R3/secT3: vi ${sl(sub.language.vi)} mixed ${sl(sub.language.mixed)} goal ${sl(sub.failureClass.GOAL_STRATEGY)} poly ${sl(sub.failureClass.POLYSEMY)} oov ${sl(sub.failureClass.LOW_OVERLAP)} sibcls ${sl(sub.failureClass.SIBLING_SECTION)}`,
    `${"".padEnd(30)} ORACLE R@3=${f3(o.doc.recallAt3)} wrongDoc=${f3(o.doc.wrongDocRate)} secT3=${f3(o.section.top3)} | prim=${r.ops.avgPrimaryChunks.toFixed(2)} ctx=${Math.round(r.ops.contextAvgChars)}/${r.ops.contextMaxChars} lat=${r.ops.latencyAvgMs.toFixed(2)}/${r.ops.latencyP95Ms.toFixed(2)}ms zero=${f3(r.ops.zeroResultRate)} pool=${r.ops.avgPoolAfterFloor.toFixed(1)}`,
  ].join("\n")
}

/** Every chunk text in both corpus representations, for the recorder. */
export const allChunkTexts = () => index.items.flatMap((i) => [chunkEmbedText(i.chunk, "body"), chunkEmbedText(i.chunk, "titled")])

/** The R3-G DEV candidate (NOT active): G3 blend 50/50 over the top-12 lexical candidates, raw query vs title-labelled chunk. */
export const R3G_CONFIG = semantic({ mode: "blend", query: "raw", corpus: "titled", alpha: 0.5, beta: 0.5, k: 12 })

/** R3-H lab: the F5 document signal over the G3 section rerank (EXPERIMENT, not active). `sem` overrides the G3 semantic settings. */
export const hybrid = (over: Partial<HybridConfig>, sem: Partial<SemanticConfig> = {}): ScoreConfig => ({
  ...R3_CONFIG,
  hybrid: { doc: R3F_CONFIG.hier!, semantic: { ...R3G_CONFIG.semantic!, ...sem }, mode: "prior", docPrior: 0.5, ...over },
})

/**
 * The R3-H DEV candidate (NOT active): G3 section rerank (raw query vs titled chunks, k=12, 40/60 lexical/semantic) + the F5 document signal as a
 * 0.3 prior + multi-document protection driven by query structure (a stated goal with a non-goal leader needs the compatible goal document).
 */
export const R3H_CONFIG = hybrid({ docPrior: 0.3, protect: { minDocRatio: 1, minSectionRatio: 1, max: 0, goalDocument: true } }, { alpha: 0.4, beta: 0.6 })
