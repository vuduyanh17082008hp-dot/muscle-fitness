import { it } from "vitest"

import { R3_CONFIG, R3F_CONFIG } from "../../score"
import { hybrid, multiLine, R3G_CONFIG, skips, store, v4Block } from "./semantic-lab"

/** N1.6.3-R3-H experiments (DEV only). R3H=<stage> vitest run <this file>: base | h1 | h3 | h2 | h4 | four */
const stage = process.env.R3H ?? ""
const out = (lines: string[]) => console.log(["", ...lines, `store: ${store.size} vectors; skipped reranks: ${skips}`].join(String.fromCharCode(10)))

it.skipIf(stage !== "base")("R3-H baselines", { timeout: 900000 }, () => {
  out([v4Block("R3 (active)", R3_CONFIG), v4Block("R3-F F5", R3F_CONFIG), v4Block("R3-G G3 50/50", R3G_CONFIG)])
})
it.skipIf(stage !== "h1")("H1 F5 doc signal (share 0.5) over G3", { timeout: 900000 }, () => {
  out([v4Block("H1 prior=0.5", hybrid({ mode: "prior", docPrior: 0.5 }))])
})
it.skipIf(stage !== "h3")("H3 small doc prior + semantic-dominant sections", { timeout: 900000 }, () => {
  const rows: string[] = []
  for (const docPrior of [0.1, 0.2, 0.3]) for (const beta of [0.5, 0.6]) rows.push(v4Block(`H3 prior=${docPrior} sem=${beta}`, hybrid({ mode: "prior", docPrior }, { alpha: 1 - beta, beta })))
  out(rows)
})
it.skipIf(stage !== "h2")("H2 document tie-break over G3", { timeout: 900000 }, () => {
  const eps = (process.env.R3H_EPS ?? "0.01,0.02,0.04").split(",").map(Number)
  out(eps.map((tieEps) => v4Block(`H2 tieEps=${tieEps}`, hybrid({ mode: "tie", tieEps }))))
})
void multiLine
import { diagBlock } from "./r3h-diag"
it.skipIf(stage !== "diag")("diagnostics R3 / F5 / G3 / H1", { timeout: 900000 }, () => {
  out([diagBlock("R3", R3_CONFIG), diagBlock("F5", R3F_CONFIG), diagBlock("G3", R3G_CONFIG), diagBlock("H1", hybrid({ mode: "prior", docPrior: 0.5 }))])
})
import { relativeDocScores } from "../../hybrid"
import { rankHierarchical } from "../../hierarchical"
import { scoreAllForEval } from "../../retrieve"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { evaluateV4, index, unitsOf } from "./run-eval-v4"
import { g4 } from "./semantic-lab"
it.skipIf(stage !== "dist")("score distributions (H2 epsilon, H4 thresholds)", { timeout: 900000 }, () => {
  const H = hybrid({})
  const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
  const res = evaluateV4(CASES_V4_DEV, g4, H).results.filter((r) => r.fired && r.query && byId.get(r.id)!.expectedKnowledgeNeed)
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
  const gaps: number[] = []
  const rows: { multi: boolean; wanted2: boolean; docRatio: number; secRatio: number }[] = []
  for (const r of res) {
    const c = byId.get(r.id)!
    const g3 = scoreAllForEval(index, r.query!, { ...H, hybrid: undefined, semantic: H.hybrid!.semantic })
    if (!g3.length) continue
    const top = g3.slice(0, 12).map((s) => s.score)
    for (let i = 1; i < top.length; i++) gaps.push(top[i - 1] - top[i])
    const docs = rankHierarchical(index.items, index.stats, r.query!, { ...H, hybrid: undefined, hier: { ...H.hybrid!.doc, candidates: { n: Infinity, ratio: 0 } } }).docs
    const rel = relativeDocScores(docs)
    const lead = g3[0].item.chunk.documentId
    const best = new Map<string, number>()
    for (const s of g3) best.set(s.item.chunk.documentId, Math.max(best.get(s.item.chunk.documentId) ?? 0, s.score))
    const others = [...best].filter(([d]) => d !== lead).sort((a, b) => b[1] - a[1])
    const units = unitsOf(c)
    const needed = new Set(units.flat())
    // the strongest non-lead doc, and whether it is a needed (multi-doc) one
    const [d2, s2] = others[0] ?? ["", 0]
    rows.push({ multi: c.multiDocument, wanted2: needed.has(d2), docRatio: rel.get(d2) ?? 0, secRatio: s2 / g3[0].score })
  }
  const fmt = (xs: number[]) => [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => q(xs, p).toFixed(3)).join(" / ")
  console.log(["", `adjacent G3 pool score gaps (n=${gaps.length}, nonzero ${gaps.filter((g) => g > 1e-9).length}) p10/25/50/75/90: ${fmt(gaps)}; nonzero only: ${fmt(gaps.filter((g) => g > 1e-9))}`,
    `multi-doc cases (n=${rows.filter((r) => r.multi).length}) strongest non-lead doc: docRatio ${fmt(rows.filter((r) => r.multi).map((r) => r.docRatio))} | secRatio ${fmt(rows.filter((r) => r.multi).map((r) => r.secRatio))}`,
    `single-doc cases (n=${rows.filter((r) => !r.multi).length}) strongest non-lead doc: docRatio ${fmt(rows.filter((r) => !r.multi).map((r) => r.docRatio))} | secRatio ${fmt(rows.filter((r) => !r.multi).map((r) => r.secRatio))}`,
    `single-doc where strongest non-lead is wanted (acceptable alt) n=${rows.filter((r) => !r.multi && r.wanted2).length}`].join("\n"))
})
it.skipIf(stage !== "facets")("structured-intent facets: multi-doc vs single-doc", { timeout: 900000 }, () => {
  const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
  const res = evaluateV4(CASES_V4_DEV, g4, hybrid({})).results.filter((r) => r.fired && r.query && byId.get(r.id)!.expectedKnowledgeNeed)
  const feat = (qq: NonNullable<(typeof res)[number]["query"]>) => ({ kinds: [qq.sensoryTargets, qq.cuisines, qq.foodTypes, qq.conceptTerms].filter((x) => x?.length).length + (qq.goalStated ? 1 : 0), sens: qq.sensoryTargets?.length ?? 0, food: qq.foodTypes?.length ?? 0, cat: qq.categories?.length ?? 0 })
  const tab = (multi: boolean) => { const m = new Map<string, number>(); for (const r of res.filter((x) => byId.get(x.id)!.multiDocument === multi)) { const f = feat(r.query!); const k = `kinds=${f.kinds},sens=${f.sens},food=${f.food}`; m.set(k, (m.get(k) ?? 0) + 1) } return [...m].sort().map(([k, v]) => `${k}:${v}`).join("  ") }
  console.log(["", "MULTI  " + tab(true), "SINGLE " + tab(false), "MULTI messages:", ...CASES_V4_DEV.filter((c) => c.multiDocument).map((c) => `  ${c.id} ${c.message}  -> ${unitsOf(c).map((u) => u.join("|")).join(" + ")}`)].join("\n"))
})
it.skipIf(stage !== "four")("four-suite (v1, v2, v3.1 DEV, v4 DEV)", { timeout: 900000 }, () => {
  out([
    multiLine("R3 (active)", R3_CONFIG), multiLine("R3-F F5", R3F_CONFIG), multiLine("R3-G G3 50/50", R3G_CONFIG),
    multiLine("H1 prior=0.5", hybrid({ docPrior: 0.5 })),
    multiLine("H2 tie eps=0.02", hybrid({ mode: "tie", tieEps: 0.02 })),
    multiLine("H3 prior=0.2 sem=0.6", hybrid({ docPrior: 0.2 }, { alpha: 0.4, beta: 0.6 })),
    multiLine("H3 prior=0.3 sem=0.6", hybrid({ docPrior: 0.3 }, { alpha: 0.4, beta: 0.6 })),
  ])
})
const BASE = { docPrior: 0.3 }, SEM = { alpha: 0.4, beta: 0.6 }
const prot = (p: Partial<NonNullable<NonNullable<ReturnType<typeof hybrid>["hybrid"]>["protect"]>>) => hybrid({ ...BASE, protect: { minDocRatio: 0.8, minSectionRatio: 0.8, max: 1, ...p } }, SEM)
it.skipIf(stage !== "h4")("H4 multi-document protection over H3 prior=0.3 sem=0.6", { timeout: 900000 }, () => {
  out([
    v4Block("H3 base (no protection)", hybrid(BASE, SEM)),
    v4Block("H4a evidence 0.8/0.8 max1", prot({})),
    v4Block("H4a' evidence 0.9/0.9 max1", prot({ minDocRatio: 0.9, minSectionRatio: 0.9 })),
    v4Block("H4b goal-document structure", prot({ max: 0, goalDocument: true })),
    v4Block("H4c dominance relax (pen .02/.03)", prot({ dominantRepeat: { category: 0.02, document: 0.03 } })),
    v4Block("H4d b + c", prot({ max: 0, goalDocument: true, dominantRepeat: { category: 0.02, document: 0.03 } })),
  ])
})
it.skipIf(stage !== "four2")("four-suite for H4 variants", { timeout: 900000 }, () => {
  out([
    multiLine("H3 base", hybrid(BASE, SEM)),
    multiLine("H4a' evidence .9/.9", prot({ minDocRatio: 0.9, minSectionRatio: 0.9 })),
    multiLine("H4a evidence .8/.8", prot({})),
    multiLine("H4b goal-doc structure", prot({ max: 0, goalDocument: true })),
    multiLine("H4c dominance relax", prot({ dominantRepeat: { category: 0.02, document: 0.03 } })),
    multiLine("H4d b+c", prot({ max: 0, goalDocument: true, dominantRepeat: { category: 0.02, document: 0.03 } })),
  ])
})
import { R3H_CONFIG } from "./semantic-lab"
import { diagBlock as dg } from "./r3h-diag"
import { evaluate, layeredGate } from "./run-eval"
import { CASES } from "./cases"
import { CASES_V2 } from "./cases-v2"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { f3 } from "./run-eval-v3"
import { subsetReportsV4 } from "./run-eval-v4"

it.skipIf(stage !== "final")("R3-H final candidate: full block, diagnostics, slices, v1/v2 multi-document", { timeout: 900000 }, () => {
  const G3H = hybrid({ docPrior: 0.3 }, { alpha: 0.4, beta: 0.6 })
  const l2 = layeredGate(JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8")))
  const named: [string, typeof R3_CONFIG][] = [["R3", R3_CONFIG], ["F5", R3F_CONFIG], ["G3", R3G_CONFIG], ["R3-H", R3H_CONFIG]]
  const rows: string[] = [v4Block("R3-H (final)", R3H_CONFIG), v4Block("R3-H 2nd run (latency)", R3H_CONFIG), dg("R3-H", R3H_CONFIG), dg("H3 (no protect)", G3H)]
  const sl = (cfg: typeof R3_CONFIG) => {
    const { results } = evaluateV4(CASES_V4_DEV, g4, cfg)
    const s = subsetReportsV4(CASES_V4_DEV, results)
    const f = (x: (typeof s.failureClass)["POLYSEMY"]) => `R@3=${f3(x.doc.recallAt3)} wrong=${f3(x.doc.wrongDocRate)} secT3=${f3(x.section.top3)}`
    return [`  CUISINE_CONTEXT ${f(s.failureClass.CUISINE_CONTEXT)}`, `  CRAVING_SENSORY ${f(s.failureClass.CRAVING_SENSORY)}`, `  MULTI_DOCUMENT  ${f(s.failureClass.MULTI_DOCUMENT)} cov@4=${f3(s.failureClass.MULTI_DOCUMENT.doc.coverageAt4)} full=${f3(s.failureClass.MULTI_DOCUMENT.doc.fullCoverageAt4)}`, `  domain cuisine ${f(s.domain.cuisine)} | craving ${f(s.domain.craving)} | goal_strategy ${f(s.domain.goal_strategy)}`]
  }
  for (const [n, cfg] of named) rows.push(`SLICES ${n}`, ...sl(cfg))
  for (const [suite, cases] of [["v1", CASES], ["v2", CASES_V2]] as const) {
    for (const [n, cfg] of named) {
      const { results } = evaluate(cfg, "all", cases as never, l2)
      const multi = results.filter((r) => r.mandatoryTotal > 1)
      rows.push(`${suite} multi-document (mandatory>1, n=${multi.length}) ${n.padEnd(5)} found ${multi.reduce((a, r) => a + r.mandatoryFound, 0)}/${multi.reduce((a, r) => a + r.mandatoryTotal, 0)} fully-covered ${multi.filter((r) => r.mandatoryFound === r.mandatoryTotal).length}/${multi.length}${n === "R3-H" ? "" : ""}`)
    }
  }
  out(rows)
})
it.skipIf(stage !== "diff")("case-level differences G3 vs R3-H", { timeout: 900000 }, () => {
  const ok = (id: string) => { const c = CASES_V4_DEV.find((x) => x.id === id)!; return new Set([...(c.expectedDocumentIds ?? []), ...(c.anyOfDocumentIds ?? []), ...(c.acceptableDocumentIds ?? [])]) }
  const a = evaluateV4(CASES_V4_DEV, g4, R3G_CONFIG).results, b = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG).results, r = evaluateV4(CASES_V4_DEV, g4, R3_CONFIG).results
  const lines: string[] = []
  a.forEach((x, i) => {
    const y = b[i], z = r[i]
    const w = (q: typeof x) => q.primary.slice(0, 3).filter((id) => !ok(q.id).has(id.replace("nutrition.", "").split("::")[0])).length
    if (w(x) !== w(y) || x.sectionRank !== y.sectionRank) lines.push(`${x.id} wrong3 R3=${w(z)} G3=${w(x)} H=${w(y)} | secRank R3=${z.sectionRank} G3=${x.sectionRank} H=${y.sectionRank} | ${CASES_V4_DEV.find((c) => c.id === x.id)!.message.slice(0, 70)}`)
  })
  console.log(["", ...lines].join("\n"))
})
