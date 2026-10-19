import { it } from "vitest"

import { CASES_V4_DEV } from "./cases-v4-dev"
import { f3 } from "./run-eval-v3"
import { evaluateV4, subsetReportsV4 } from "./run-eval-v4"
import { g4, multiLine, R3H_CONFIG, v4Block } from "./semantic-lab"
import type { ScoreConfig } from "../../score"

/** R3-I-S experiments (DEV only). R3IS=run vitest run <this file> */
const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
const doc = (id: string) => id.replace("nutrition.", "").split("::")[0]
const sec = (id: string) => id.replace("nutrition.", "")
const okSet = (id: string) => { const c = byId.get(id)!; return new Set([...(c.expectedDocumentIds ?? []), ...(c.anyOfDocumentIds ?? []), ...(c.acceptableDocumentIds ?? [])]) }
const req = (id: string) => { const c = byId.get(id)!; return new Set([...(c.expectedDocumentIds ?? []), ...(c.anyOfDocumentIds ?? [])]) }
const sectionHit = (id: string) => new Set([...(byId.get(id)!.expectedSectionIds ?? []), ...(byId.get(id)!.acceptableSectionIds ?? [])])
const cfgs: Array<[string, ScoreConfig]> = [["R3-H", R3H_CONFIG], ["S1", { ...R3H_CONFIG, fill: "S1" }], ["S2", { ...R3H_CONFIG, fill: "S2" }], ["S3", { ...R3H_CONFIG, fill: "S3" }]]

it.skipIf(process.env.R3IS !== "run")("R3-I-S", { timeout: 900000 }, () => {
  const base = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG).results.filter((r) => r.fired && byId.get(r.id)!.expectedKnowledgeNeed)
  const out: string[] = []
  for (const [name, cfg] of cfgs) {
    const { results } = evaluateV4(CASES_V4_DEV, g4, cfg)
    const fired = results.filter((r) => r.fired && byId.get(r.id)!.expectedKnowledgeNeed)
    const dist = [0, 0, 0, 0, 0]
    fired.forEach((r) => dist[r.primary.length]++)
    const avg = fired.reduce((a, r) => a + r.primary.length, 0) / fired.length
    const pos = [0, 0, 0, 0], tot = [0, 0, 0, 0]
    for (const r of fired) r.primary.slice(0, 4).forEach((id, i) => { tot[i]++; if (!okSet(r.id).has(doc(id))) pos[i]++ })
    // suppression vs the ungated R3-H list for the same case
    let fill = 0, useful = 0, usefulConsidered = 0
    fired.forEach((r, i) => {
      const b = base[i]
      for (const id of b.primary) {
        const isUseful = okSet(r.id).has(doc(id))
        if (isUseful) usefulConsidered++
        if (!r.primary.includes(id)) { if (isUseful) useful++; else fill++ }
      }
    })
    // required-doc / hit-section chunks lost
    let reqLost = 0, secLost = 0
    fired.forEach((r, i) => { for (const id of base[i].primary) if (!r.primary.includes(id)) { if (req(r.id).has(doc(id))) reqLost++; if (sectionHit(r.id).has(sec(id))) secLost++ } })
    const s = subsetReportsV4(CASES_V4_DEV, results)
    const sl = (x: (typeof s.language)["vi"]) => `R3=${f3(x.doc.recallAt3)} wr=${f3(x.doc.wrongDocRate)} T3=${f3(x.section.top3)}`
    out.push(v4Block(name, cfg), `   avgPrimary=${avg.toFixed(2)} dist(0..4)=${dist.join("/")} slotWrong=${pos.map((p, i) => `#${i + 1} ${f3(p / tot[i])}(${p}/${tot[i]})`).join(" ")}`,
      `   suppressed: filler=${fill} useful=${useful} (required-doc chunks ${reqLost}, hit-section chunks ${secLost}) | fillerPrecision=${f3(fill / Math.max(1, fill + useful))} usefulSuppressionRate=${f3(useful / Math.max(1, usefulConsidered))}`,
      `   vi ${sl(s.language.vi)} | mixed ${sl(s.language.mixed)} | goal ${sl(s.failureClass.GOAL_STRATEGY)} | cuisine ${sl(s.failureClass.CUISINE_CONTEXT)} | oov ${sl(s.failureClass.LOW_OVERLAP)} | craving ${sl(s.failureClass.CRAVING_SENSORY)} | multi ${sl(s.failureClass.MULTI_DOCUMENT)} cov4=${f3(s.failureClass.MULTI_DOCUMENT.doc.coverageAt4)} full=${f3(s.failureClass.MULTI_DOCUMENT.doc.fullCoverageAt4)}`,
      "   " + multiLine(name, cfg))
  }
  console.log("\n" + out.join("\n"))
})

import { scoreAllForEval } from "../../retrieve"
import { index } from "./run-eval-v4"
it.skipIf(process.env.R3IS !== "sep")("R3-I-S separability of filler vs useful by score ratio (diagnostic only, no threshold chosen)", () => {
  const res = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG).results.filter((r) => r.fired && r.query && r.primary.length > 0 && byId.get(r.id)!.expectedKnowledgeNeed)
  const rows: Array<{ slot: number; ratio: number; useful: boolean }> = []
  for (const r of res) {
    const all = scoreAllForEval(index, r.query!, R3H_CONFIG)
    const sc = new Map(all.map((s) => [sec(s.item.chunk.id), s.score]))
    const lead = sc.get(sec(r.primary[0])) ?? 1
    r.primary.slice(1).forEach((id, i) => rows.push({ slot: i + 2, ratio: (sc.get(sec(id)) ?? 0) / lead, useful: okSet(r.id).has(doc(id)) }))
  }
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]?.toFixed(2) }
  for (const u of [true, false]) { const x = rows.filter((r) => r.useful === u).map((r) => r.ratio); console.log(u ? "useful" : "filler", "n", x.length, "p10/25/50/75/90", [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => q(x, p)).join(" / ")) }
  let wins = 0, n = 0
  for (const a of rows.filter((r) => r.useful)) for (const b of rows.filter((r) => !r.useful)) { n++; wins += a.ratio > b.ratio ? 1 : a.ratio === b.ratio ? 0.5 : 0 }
  console.log("AUC (useful ranked above filler by score ratio):", (wins / n).toFixed(3))
})
