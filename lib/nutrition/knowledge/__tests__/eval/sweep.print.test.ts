import { it } from "vitest"
import { ACTIVE_CONFIG, BASELINE_CONFIG } from "../../score"
import { evaluate, f } from "./run-eval"

// DEV split only. Prints the MIN_SCORE sweep for the baseline and frozen weights.
it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("min-score sweep (dev)", () => {
  for (const [name, config] of [["baseline-weights", BASELINE_CONFIG], ["frozen-weights", ACTIVE_CONFIG]] as const) {
    for (const minScore of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45]) {
      const { report: r } = evaluate({ ...config, minScore }, "dev")
      console.log(`SWEEP ${name} ${minScore.toFixed(2)} | recall@3 ${f(r.docRecallAt3, 3)} | precision ${f(1 - r.wrongDocumentRate, 3)} | wrong ${f(r.wrongDocumentRate, 3)} | zero ${f(r.zeroResultRate, 2)} | avgPrimary ${f(r.avgPrimaryChunks, 2)} | sec1 ${f(r.section.top1, 2)} | sec3 ${f(r.section.top3, 2)}`)
    }
  }
})
