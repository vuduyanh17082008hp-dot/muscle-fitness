import { it } from "vitest"

import { ACTIVE_CONFIG } from "../../score"
import { CASES_V2, EVAL_VERSION } from "./cases-v2"
import { bucketWrongDocuments, evaluate, f } from "./run-eval"

// Dev/eval printout (NUTRITION_EVAL_PRINT=1). Never asserts; never fails the suite.
it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("v2 report", () => {
  console.log("EVAL", EVAL_VERSION, "total", CASES_V2.length, "dev", CASES_V2.filter((c) => c.split === "dev").length, "heldout", CASES_V2.filter((c) => c.split === "heldout").length)
  for (const split of ["dev", "heldout", "all"] as const) {
    const { report: r } = evaluate(ACTIVE_CONFIG, split, CASES_V2)
    console.log(`V2 ${split} cases=${r.cases} gateP=${f(r.gate.precision, 3)} gateR=${f(r.gate.recall, 3)} fp=${r.gate.fp} fn=${r.gate.fn} R@1=${f(r.docRecallAt1)} R@3=${f(r.docRecallAt3)} R@4=${f(r.docRecallAt4)} MRR=${f(r.mrr)} wrongDoc=${f(r.wrongDocumentRate)} sec1=${f(r.section.top1)} sec3=${f(r.section.top3)} secN=${r.section.cases} wrongSec=${f(r.wrongSectionRate)} zero=${f(r.zeroResultRate)} avgPrim=${f(r.avgPrimaryChunks, 2)} ctx=${f(r.context.avgChars, 0)}/${r.context.maxChars} lat=${f(r.latencyMs.avg, 2)}/${f(r.latencyMs.p95, 2)}`)
    if ((split as string) !== "all") {
      console.log("  gateMisses", r.gateMisses.join(" "))
      for (const x of r.failures) console.log("  FAIL", x.id, x.why.slice(0, 160))
    }
  }
  const buckets = bucketWrongDocuments(ACTIVE_CONFIG, CASES_V2)
  const counts: Record<string, number> = {}
  for (const b of buckets) counts[b.cls] = (counts[b.cls] ?? 0) + 1
  console.log("BUCKETS", JSON.stringify(counts), "n=", buckets.length)
  for (const b of buckets) console.log("  WRONG", b.id, b.cls, b.wrong)
})

import { decideNutritionKnowledgeNeed } from "../../need"
// Uncertain-band routing: how many missed positives a model could rescue, and how many negatives would cost a call.
it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("v2 uncertain band", () => {
  const split = process.env.NUTRITION_EVAL_SPLIT ?? "dev"
  const rows = CASES_V2.filter((c) => split === "all" || c.split === split).map((c) => ({ c, d: decideNutritionKnowledgeNeed({ message: c.message, intent: c.intent }) }))
  const missed = rows.filter((r) => r.c.gate && !r.d.needed)
  const negs = rows.filter((r) => !r.c.gate)
  console.log(`BAND ${split} missed=${missed.length} covered=${missed.filter((r) => r.d.uncertain).length} | negatives=${negs.length} routedToModel=${negs.filter((r) => r.d.uncertain).length} fp=${negs.filter((r) => r.d.needed).length}`)
  for (const r of missed.filter((x) => !x.d.uncertain)) console.log("  UNCOVERED", r.c.id, r.c.message)
  for (const r of negs.filter((x) => x.d.uncertain)) console.log("  NEG→MODEL", r.c.id, r.c.message)
})

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { layeredGate } from "./run-eval"
it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("v2 layered (recorded semantic gate)", () => {
  const file = join(__dirname, "semantic-gate-v2.recorded.json")
  if (!existsSync(file)) return
  const gate = layeredGate(JSON.parse(readFileSync(file, "utf8")))
  const want = process.env.NUTRITION_EVAL_SPLIT ?? "dev"
  const splits: Array<"dev" | "heldout" | "all"> = want === "all" ? ["dev", "heldout", "all"] : [want as "dev" | "heldout"]
  for (const split of splits) {
    const { report: r, results } = evaluate(ACTIVE_CONFIG, split, CASES_V2, gate)
    console.log(`LAYERED ${split} cases=${r.cases} gateP=${f(r.gate.precision, 3)} gateR=${f(r.gate.recall, 3)} fp=${r.gate.fp} fn=${r.gate.fn} retrievalN=${results.filter((x) => x.fired && x.mandatoryTotal > 0).length} R@1=${f(r.docRecallAt1)} R@3=${f(r.docRecallAt3)} R@4=${f(r.docRecallAt4)} MRR=${f(r.mrr)} wrongDoc=${f(r.wrongDocumentRate)} sec1=${f(r.section.top1)} sec3=${f(r.section.top3)} secN=${r.section.cases} wrongSec=${f(r.wrongSectionRate)} zero=${f(r.zeroResultRate)} avgPrim=${f(r.avgPrimaryChunks, 2)} ctx=${f(r.context.avgChars, 0)}/${r.context.maxChars}`)
    console.log("  gateMisses", r.gateMisses.join(" "))
    const byId = new Map(CASES_V2.map((c) => [c.id, c]))
    for (const res of results) if (res.fired && !byId.get(res.id)!.gate) console.log("  FALSE-POSITIVE", res.id, byId.get(res.id)!.message)
    for (const x of r.failures) console.log("  FAIL", x.id, x.why.slice(0, 160))
    if ((split as string) !== "all") {
      const buckets = bucketWrongDocuments(ACTIVE_CONFIG, CASES_V2.filter((c) => split === "all" || c.split === split), gate)
      const counts: Record<string, number> = {}
      for (const b of buckets) counts[b.cls] = (counts[b.cls] ?? 0) + 1
      console.log("  BUCKETS", JSON.stringify(counts), "n=", buckets.length)
      for (const b of buckets) console.log("   WRONG", b.id, b.cls, b.signal ?? "", b.wrong)
    }
  }
})

import { CASES } from "./cases"
it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("v1 layered (recorded semantic gate)", () => {
  const gate = layeredGate(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))
  for (const split of ["dev", "heldout", "all"] as const) {
    const { report: r } = evaluate(ACTIVE_CONFIG, split, CASES, gate)
    console.log(`V1LAYERED ${split} cases=${r.cases} gateP=${f(r.gate.precision, 3)} gateR=${f(r.gate.recall, 3)} fp=${r.gate.fp} fn=${r.gate.fn} R@3=${f(r.docRecallAt3)} wrongDoc=${f(r.wrongDocumentRate)} sec1=${f(r.section.top1)} sec3=${f(r.section.top3)} misses=${r.gateMisses.join(",")}`)
  }
})
