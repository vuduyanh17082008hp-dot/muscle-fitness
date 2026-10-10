import { it } from "vitest"

import { chunkEmbedText, queryEmbedText } from "../../semantic-rerank"
import { R3_CONFIG } from "../../score"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { f3, docOf } from "./run-eval-v3"
import { evaluateV4, index, unitsOf } from "./run-eval-v4"
import { g4, store } from "./semantic-lab"

/**
 * R3-G diagnostics (DEV only, NOT a runtime path). How much headroom can a bounded rerank have?
 *  - pool recall: required document / target section present anywhere in the lexical candidate pool (what a rerank may reorder)
 *  - global semantic: ranking ALL documents / sections by embedding similarity alone (shows whether the representation, not the pool, is the gap)
 * R3G=diag vitest run <this file>
 */
it.skipIf(process.env.R3G !== "diag")("R3-G diagnostics", () => {
  const { results } = evaluateV4(CASES_V4_DEV, g4, R3_CONFIG)
  const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
  const secOf = (id: string) => id.replace("nutrition.", "")
  const ok = index.items.filter((i) => !/::(?:do-not-claim|coach-decision-rules|common-failure-modes|suggested-tool-calls)$/.test(i.chunk.id))
  let units = 0, unitsInPool = 0, secN = 0, secInPool = 0, secLexTop3 = 0, gUnits = 0, gDocR3 = 0, gSecN = 0, gSecT3 = 0, gDocR1 = 0
  const kind = "raw", corpus = "titled"
  for (const r of results) {
    const c = byId.get(r.id)!
    if (!r.fired || !r.query || !c.expectedKnowledgeNeed) continue
    const us = unitsOf(c)
    const poolDocs = new Set(r.pool.map((p) => docOf(p.id)))
    units += us.length
    unitsInPool += us.filter((u) => u.some((d) => poolDocs.has(d))).length
    const q = store.lookup(queryEmbedText(r.query, kind))
    if (!q) continue
    const sims = ok.map((i) => {
      const v = store.lookup(chunkEmbedText(i.chunk, corpus))
      let s = 0
      for (let n = 0; n < q.length; n++) s += q[n] * v![n]
      return { id: i.chunk.id, doc: docOf(i.chunk.id), s }
    }).sort((a, b) => b.s - a.s)
    const docRank = [...new Set(sims.map((x) => x.doc))]
    gUnits += us.length
    gDocR3 += us.filter((u) => u.some((d) => docRank.slice(0, 3).includes(d))).length
    gDocR1 += us.filter((u) => u.some((d) => docRank.slice(0, 1).includes(d))).length
    const hits = [...(c.expectedSectionIds ?? []), ...(c.acceptableSectionIds ?? [])]
    if (c.sectionEvaluation && hits.length) {
      gSecN++
      if (sims.slice(0, 3).some((x) => hits.includes(secOf(x.id)))) gSecT3++
      secN++
      const inPool = r.pool.some((p) => hits.includes(secOf(p.id)))
      if (inPool) secInPool++
      if (r.primary.slice(0, 3).some((id) => hits.includes(secOf(id)))) secLexTop3++
    }
  }
  console.log([
    "",
    `pool (lexical candidates >= 0.5 best): required-doc unit recall ${f3(unitsInPool / units)} (n=${units}); target section in pool ${f3(secInPool / secN)} (n=${secN}); lexical section Top-3 among those ${f3(secLexTop3 / secN)}`,
    `GLOBAL semantic only (diagnostic): doc R@1 ${f3(gDocR1 / gUnits)} R@3 ${f3(gDocR3 / gUnits)} (units ${gUnits}); section Top-3 ${f3(gSecT3 / gSecN)} (n=${gSecN})`,
  ].join("\n"))
})
