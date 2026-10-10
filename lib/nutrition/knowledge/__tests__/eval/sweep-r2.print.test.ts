import { it } from "vitest"

import { ACTIVE_CONFIG, R1_CONFIG, type ScoreConfig } from "../../score"
import { CASES_V3_DEV } from "./cases-v3-dev"
import { CASES_V2 } from "./cases-v2"
import { DEV_RECORDING_PATH, evaluateV3, f3, hypothesisReports, HYPOTHESES, layeredGate, oracleGate, readRecording } from "./run-eval-v3"
import { evaluate, f, layeredGate as layeredGateV2 } from "./run-eval"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/** N1.6.3-R2 DEV-only experiment sweep. Prints, never asserts. NUTRITION_R2_PRINT=1 [NUTRITION_R2_ONLY=prefix]. */
const pen = (category: number, document: number) => ({ repeatPenalty: { category, document } })
const loc = (localMatch: number) => ({ weights: { ...R1_CONFIG.weights, localMatch } })
/**
 * Rejected experiments B (local-only lexical/sensory), C (OOV denominator, confidence scaling, single-term cap) and the
 * document-candidate floor were run against knobs that were removed after rejection; their numbers live in
 * docs/nutrition-knowledge-eval.md. What remains here reproduces the retained decisions and the A-series.
 */
export const VARIANTS: Record<string, ScoreConfig> = {
  R1: R1_CONFIG,
  A2_noCat: { ...R1_CONFIG, ...pen(0, 0.1) },
  A3_doc05: { ...R1_CONFIG, ...pen(0.08, 0.05) },
  A3_doc0: { ...R1_CONFIG, ...pen(0.08, 0) },
  A4_none: { ...R1_CONFIG, ...pen(0, 0) },
  A5_cap3: { ...R1_CONFIG, maxPerDocument: 3 },
  A5_cap3_none: { ...R1_CONFIG, maxPerDocument: 3, ...pen(0, 0) },
  B8_loc04: { ...R1_CONFIG, ...loc(0.04) },
  B7_loc10: { ...R1_CONFIG, ...loc(0.1) },
  F_final: ACTIVE_CONFIG,
  F_final_floor055: { ...ACTIVE_CONFIG, relativeFloor: 0.55 },
  F_final_floor06: { ...ACTIVE_CONFIG, relativeFloor: 0.6 },
}

const gate = layeredGate(readRecording(DEV_RECORDING_PATH))
const v2gate = layeredGateV2(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))

export function row(name: string, c: ScoreConfig, hyp = false) {
  const L = evaluateV3(CASES_V3_DEV, gate, c)
  const O = evaluateV3(CASES_V3_DEV, oracleGate, c)
  const v1 = evaluate(c, "all").report
  const v2 = evaluate(c, "dev", CASES_V2, v2gate).report
  const l = L.report, o = O.report
  const out = [
    `${name.padEnd(14)} L: R1 ${f3(l.doc.recallAt1)} R3 ${f3(l.doc.recallAt3)} wr ${f3(l.doc.wrongDocRate)} s1 ${f3(l.section.top1)} s3 ${f3(l.section.top3)} sib ${f3(l.section.siblingSurvival)} zero ${f3(l.ops.zeroResultRate)} gP ${f3(l.gate.precision)} gR ${f3(l.gate.recall)}` +
      ` | O: R1 ${f3(o.doc.recallAt1)} R3 ${f3(o.doc.recallAt3)} MRR ${f3(o.doc.mrr)} wr ${f3(o.doc.wrongDocRate)} s1 ${f3(o.section.top1)} s3 ${f3(o.section.top3)} sib ${f3(o.section.siblingSurvival)} zero ${f3(o.ops.zeroResultRate)} cand ${o.ops.avgCandidates.toFixed(1)} pool ${o.ops.avgPoolAfterFloor.toFixed(1)} ctx ${Math.round(o.ops.contextAvgChars)}` +
      ` | v1all: R3 ${f(v1.docRecallAt3)} wr ${f(v1.wrongDocumentRate)} s3 ${f(v1.section.top3)} | v2dev: R3 ${f(v2.docRecallAt3)} wr ${f(v2.wrongDocumentRate)} s3 ${f(v2.section.top3)}`,
  ]
  if (hyp) {
    const h = hypothesisReports(CASES_V3_DEV, O.results)
    for (const k of HYPOTHESES) out.push(`   O ${k.padEnd(22)} n=${h[k].cases} R3 ${f3(h[k].doc.recallAt3)} wr ${f3(h[k].doc.wrongDocRate)} s1 ${f3(h[k].section.top1)} s3 ${f3(h[k].section.top3)} sib ${f3(h[k].section.siblingSurvival)}`)
  }
  return out.join("\n")
}

it.skipIf(!process.env.NUTRITION_R2_PRINT)("r2 sweep (dev)", () => {
  const only = process.env.NUTRITION_R2_ONLY
  const lines = Object.entries(VARIANTS).filter(([k]) => !only || k.startsWith(only)).map(([k, c]) => row(k, c, !!process.env.NUTRITION_R2_HYP))
  console.log("\n" + lines.join("\n"))
})

/** Per-domain / language breakdown, layered + oracle. NUTRITION_R2_DOM=1 */
it.skipIf(!process.env.NUTRITION_R2_DOM)("r2 domains (dev)", () => {
  const groups: Record<string, (c: (typeof CASES_V3_DEV)[number]) => boolean> = {
    texture: (c) => c.domain === "texture",
    flavor: (c) => c.domain === "flavor",
    cuisine: (c) => c.domain.startsWith("cuisine"),
    craving: (c) => c.domain.startsWith("craving"),
    makeover: (c) => c.domain.startsWith("makeover"),
    goalStrategy: (c) => c.domain === "fat_loss" || c.domain === "muscle_gain",
    vietnamese: (c) => c.lang === "vi",
    mixed: (c) => c.lang === "mixed",
    negatives: (c) => !c.mustRetrieve,
  }
  const out: string[] = []
  for (const [name, cfg] of [["R1", R1_CONFIG], ["R2", ACTIVE_CONFIG]] as const) {
    for (const [g, pred] of Object.entries(groups)) {
      const sub = CASES_V3_DEV.filter(pred)
      const l = evaluateV3(sub, gate, cfg).report
      const o = evaluateV3(sub, oracleGate, cfg).report
      out.push(`${name} ${g.padEnd(12)} n=${sub.length} | L R3 ${f3(l.doc.recallAt3)} wr ${f3(l.doc.wrongDocRate)} s1 ${f3(l.section.top1)} s3 ${f3(l.section.top3)} gFP ${l.gate.fp} | O R3 ${f3(o.doc.recallAt3)} wr ${f3(o.doc.wrongDocRate)} s1 ${f3(o.section.top1)} s3 ${f3(o.section.top3)}`)
    }
  }
  console.log("\n" + out.join("\n"))
})
