import { readFileSync } from "node:fs"
import { join } from "node:path"
import { it } from "vitest"
import { R3_CONFIG, R3F_CONFIG, type ScoreConfig } from "../../score"
import { CASES } from "./cases"
import { CASES_V2 } from "./cases-v2"
import { CASES_V3_DEV } from "./cases-v3-dev"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { measure, oracleLine, withHier } from "./hier-lab"
import { evaluate, layeredGate } from "./run-eval"
import { DEV_RECORDING_PATH, evaluateV3, f3, layeredGate as layeredV3, readRecording } from "./run-eval-v3"
import { DEV_RECORDING_PATH_V4, evaluateV4, layeredGateV4, readRecordingV4 } from "./run-eval-v4"

const l2 = layeredGate(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))
const g3 = layeredV3(readRecording(DEV_RECORDING_PATH))
const g4 = layeredGateV4(readRecordingV4(DEV_RECORDING_PATH_V4))

function multi(name: string, cfg: ScoreConfig) {
  const v1 = evaluate(cfg, "all", CASES as never, l2).report
  const v2 = evaluate(cfg, "all", CASES_V2 as never, l2).report
  const v3 = evaluateV3(CASES_V3_DEV, g3, cfg).report
  const v4 = evaluateV4(CASES_V4_DEV, g4, cfg).report
  const avgR3 = (v1.docRecallAt3 + v2.docRecallAt3 + v3.doc.recallAt3 + v4.doc.recallAt3) / 4
  const avgW = (v1.wrongDocumentRate + v2.wrongDocumentRate + v3.doc.wrongDocRate + v4.doc.wrongDocRate) / 4
  const avgS = (v1.section.top3 + v2.section.top3 + v3.section.top3 + v4.section.top3) / 4
  return `${name.padEnd(28)} R@3 v1=${f3(v1.docRecallAt3)} v2=${f3(v2.docRecallAt3)} v31=${f3(v3.doc.recallAt3)} v4=${f3(v4.doc.recallAt3)} | wrong v1=${f3(v1.wrongDocumentRate)} v2=${f3(v2.wrongDocumentRate)} v31=${f3(v3.doc.wrongDocRate)} v4=${f3(v4.doc.wrongDocRate)} | secT3 v1=${f3(v1.section.top3)} v2=${f3(v2.section.top3)} v31=${f3(v3.section.top3)} v4=${f3(v4.section.top3)} | AVG R3=${f3(avgR3)} wrong=${f3(avgW)} secT3=${f3(avgS)}`
}
/**
 * N1.6.3-R3-F experiments (DEV only; the sealed v4 split is never loaded). HIER=1 vitest run <this file> prints every experiment on v4 DEV,
 * then the four-suite comparison used to pick the candidate (v1, v2, v3.1 DEV, v4 DEV; one recorded Layer-2 reply set each).
 */
const ALLOC = { reserveRatio: 0.85, reserveMax: 2, sibRatio: 0.3, secondaryDocRatio: 0.85, maxPerDoc: 3 }
it.skipIf(process.env.HIER !== "1")("R3-F experiments", { timeout: 900000 }, () => {
  const f1 = withHier(R3_CONFIG, { sectionMode: "legacy", docShare: 0, candidates: { n: 3, ratio: 0 } })
  const f2 = withHier(R3_CONFIG, { docShare: 0.5 })
  const f3c = withHier(R3_CONFIG, { docShare: 0.5, candidates: { n: 4, ratio: 0.5 } })
  const f4 = withHier(R3_CONFIG, { docShare: 0.7, allocation: ALLOC })
  const named: Array<[string, ScoreConfig]> = [["R3 (flat baseline)", R3_CONFIG], ["F1 doc rank, top3 docs", f1], ["F2 local sections", f2], ["F3 adaptive cand. set", f3c], ["F4 dominance allocation", f4], ["F5 = R3F candidate", R3F_CONFIG]]
  const out: string[] = []
  for (const [n, c] of named) out.push(measure(n, c), oracleLine(n, c))
  out.push("", "four-suite comparison")
  for (const [n, c] of named) out.push(multi(n, c))
  console.log(["", ...out].join(String.fromCharCode(10)))
})
