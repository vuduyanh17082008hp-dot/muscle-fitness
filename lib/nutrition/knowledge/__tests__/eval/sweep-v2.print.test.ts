import { readFileSync } from "node:fs"
import { join } from "node:path"

import { it } from "vitest"

import { ACTIVE_CONFIG } from "../../score"
import { CASES_V2 } from "./cases-v2"
import { evaluate, f, layeredGate } from "./run-eval"

// DEV split only (NUTRITION_EVAL_SPLIT=dev). Grid over the two existing knobs; prints, never asserts.
it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("v2 sweep (dev, layered)", () => {
  const split = (process.env.NUTRITION_EVAL_SPLIT ?? "dev") as "dev" | "heldout" | "all"
  const gate = layeredGate(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))
  for (const relativeFloor of [0, 0.5, 0.6, 0.7, 0.8]) {
    for (const minScore of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45]) {
      const { report: r } = evaluate({ ...ACTIVE_CONFIG, minScore, relativeFloor: relativeFloor || undefined }, split, CASES_V2, gate)
      console.log(`SWEEP2 floor=${relativeFloor} min=${minScore.toFixed(2)} | R@1 ${f(r.docRecallAt1, 3)} R@3 ${f(r.docRecallAt3, 3)} R@4 ${f(r.docRecallAt4, 3)} | wrong ${f(r.wrongDocumentRate, 3)} | sec1 ${f(r.section.top1, 2)} sec3 ${f(r.section.top3, 2)} | zero ${f(r.zeroResultRate, 2)} | prim ${f(r.avgPrimaryChunks, 2)}`)
    }
  }
})

it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("v2 repeat-penalty sweep (dev, layered)", () => {
  const split = (process.env.NUTRITION_EVAL_SPLIT ?? "dev") as "dev" | "heldout" | "all"
  const gate = layeredGate(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))
  for (const document of [0, 0.03, 0.05, 0.1]) {
    for (const category of [0, 0.04, 0.08]) {
      const { report: r } = evaluate({ ...ACTIVE_CONFIG, repeatPenalty: { category, document } }, split, CASES_V2, gate)
      const v1 = evaluate({ ...ACTIVE_CONFIG, repeatPenalty: { category, document } }, "all").report
      console.log(`SWEEP3 doc=${document} cat=${category} | R@3 ${f(r.docRecallAt3, 3)} MRR ${f(r.mrr, 3)} wrong ${f(r.wrongDocumentRate, 3)} sec1 ${f(r.section.top1, 2)} sec3 ${f(r.section.top3, 2)} prim ${f(r.avgPrimaryChunks, 2)} | v1(all) R@3 ${f(v1.docRecallAt3, 3)} wrong ${f(v1.wrongDocumentRate, 3)} sec3 ${f(v1.section.top3, 2)}`)
    }
  }
})

it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("floor sweep v1+v2 (dev)", () => {
  const gate = layeredGate(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))
  for (const relativeFloor of [0, 0.4, 0.5, 0.55, 0.6, 0.7]) {
    const c = { ...ACTIVE_CONFIG, relativeFloor: relativeFloor || undefined }
    const a = evaluate(c, "dev").report
    const b = evaluate(c, "dev", CASES_V2, gate).report
    console.log(`SWEEP4 floor=${relativeFloor} | v1dev R@3 ${f(a.docRecallAt3, 3)} wrong ${f(a.wrongDocumentRate, 3)} sec1 ${f(a.section.top1, 2)} sec3 ${f(a.section.top3, 2)} | v2dev R@3 ${f(b.docRecallAt3, 3)} wrong ${f(b.wrongDocumentRate, 3)} sec1 ${f(b.section.top1, 2)} sec3 ${f(b.section.top3, 2)}`)
  }
})
