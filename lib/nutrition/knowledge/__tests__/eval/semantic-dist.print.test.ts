import { it } from "vitest"

import { scoreAllForEval } from "../../retrieve"
import { R3_CONFIG } from "../../score"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { f3 } from "./run-eval-v3"
import { evaluateV4, index } from "./run-eval-v4"
import { g4 } from "./semantic-lab"

/** R3-G: DEV score distributions used to pick the tie band (not chosen blindly). R3G=1 vitest run <this file>. */
it.skipIf(process.env.R3G !== "1")("R3-G score distributions", () => {
  const { results } = evaluateV4(CASES_V4_DEV, g4, R3_CONFIG)
  const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]
  const gaps1: number[] = [], adj: number[] = [], pool: number[] = [], targetGap: number[] = []
  const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
  for (const r of results) {
    if (!r.fired || !r.query) continue
    const s = scoreAllForEval(index, r.query, { ...R3_CONFIG })
    const best = s[0]?.score ?? 0
    const kept = s.filter((x) => x.score >= best * 0.5)
    pool.push(kept.length)
    if (kept.length > 1) gaps1.push(kept[0].score - kept[1].score)
    for (let i = 1; i < Math.min(8, kept.length); i++) adj.push(kept[i - 1].score - kept[i].score)
    const c = byId.get(r.id)!
    const hits = [...(c.expectedSectionIds ?? []), ...(c.acceptableSectionIds ?? [])]
    if (hits.length) {
      const idx = kept.findIndex((x) => hits.includes(x.item.chunk.id.replace("nutrition.", "")))
      if (idx > 0) targetGap.push(best - kept[idx].score)
    }
  }
  const line = (n: string, xs: number[]) => `${n.padEnd(22)} n=${xs.length} p10=${f3(q(xs, 0.1))} p25=${f3(q(xs, 0.25))} p50=${f3(q(xs, 0.5))} p75=${f3(q(xs, 0.75))} p90=${f3(q(xs, 0.9))} exactTies=${xs.filter((x) => x < 1e-9).length}`
  console.log(["", line("pool size (>=0.5 best)", pool), line("gap top1-top2", gaps1), line("adjacent gaps top8", adj), line("target below top1 by", targetGap)].join("\n"))
})
