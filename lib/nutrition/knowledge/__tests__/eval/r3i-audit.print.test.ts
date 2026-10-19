import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { it } from "vitest"

import { scoreAllForEval } from "../../retrieve"
import { R3_CONFIG } from "../../score"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { GENERIC_DOCS } from "./cases-v4-types"
import { evaluateV4, index, unitsOf, type V4Result } from "./run-eval-v4"
import { f3 } from "./run-eval-v3"
import { g4, R3H_CONFIG } from "./semantic-lab"

/**
 * R3-I audit (test-only, DEV only; the sealed split is never loaded). R3I=audit vitest run <this file>.
 * Reads the frozen R3-H config; changes nothing. R3I_OUT=<path> also dumps the per-case rows as JSON.
 */
const run = process.env.R3I ?? ""
const sec = (id: string) => id.replace("nutrition.", "")
const doc = (id: string) => sec(id).split("::")[0]
const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
const required = (id: string) => [...(byId.get(id)!.expectedDocumentIds ?? []), ...(byId.get(id)!.anyOfDocumentIds ?? [])]
const okSet = (id: string) => new Set([...required(id), ...(byId.get(id)!.acceptableDocumentIds ?? [])])
const hits = (id: string) => [...(byId.get(id)!.expectedSectionIds ?? []), ...(byId.get(id)!.acceptableSectionIds ?? [])]
const POOL_K = 12

type Row = { id: string; msg: string; lang: string; classes: string[]; domain: string; multi: boolean; sib: boolean }
const bucket = (rank: number | null) => ({ t3: rank !== null && rank <= 3, t6: rank !== null && rank <= 6, t12: rank !== null && rank <= 12, any: rank !== null })

function sections() {
  const { results } = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG)
  return results.filter((r): r is V4Result & { query: NonNullable<V4Result["query"]> } => r.fired && !!r.query && byId.get(r.id)!.expectedKnowledgeNeed)
}

const SLICES: Array<[string, (id: string) => boolean]> = [
  ["ALL", () => true],
  ["English", (id) => byId.get(id)!.language === "en"],
  ["Vietnamese", (id) => byId.get(id)!.language === "vi"],
  ["Mixed", (id) => byId.get(id)!.language === "mixed"],
  ["Goal strategy", (id) => byId.get(id)!.failureClass.includes("GOAL_STRATEGY")],
  ["Cuisine", (id) => byId.get(id)!.failureClass.includes("CUISINE_CONTEXT")],
  ["OOV (low overlap)", (id) => byId.get(id)!.failureClass.includes("LOW_OVERLAP")],
  ["Craving/sensory", (id) => byId.get(id)!.failureClass.includes("CRAVING_SENSORY")],
  ["Multi-document", (id) => byId.get(id)!.multiDocument],
  ["Sibling-sensitive", (id) => byId.get(id)!.siblingSensitive],
]

/** Lexical (pre-rerank) pool exactly as the engine builds it: R3 score, relative floor, top-12. */
function lexicalPool(query: V4Result["query"]) {
  const lex = scoreAllForEval(index, query!, R3_CONFIG)
  const floor = (lex[0]?.score ?? 0) * (R3_CONFIG.relativeFloor ?? 0)
  return { lex, floor, pool: lex.filter((s) => s.score >= floor).slice(0, POOL_K) }
}

it.skipIf(run !== "pool")("R3-I pool coverage (sections and documents)", { timeout: 900000 }, () => {
  const fired = sections()
  const out: string[] = [""]
  for (const [name, pred] of SLICES) {
    const secCases = fired.filter((r) => byId.get(r.id)!.sectionEvaluation && pred(r.id))
    const lexRank = (r: (typeof fired)[number]) => { const i = lexicalPool(r.query).lex.findIndex((s) => hits(r.id).includes(sec(s.item.chunk.id))); return i < 0 ? null : i + 1 }
    const postRank = (r: (typeof fired)[number]) => { const i = scoreAllForEval(index, r.query, R3H_CONFIG).findIndex((s) => hits(r.id).includes(sec(s.item.chunk.id))); return i < 0 ? null : i + 1 }
    const agg = (rank: (r: (typeof fired)[number]) => number | null, label: string) => {
      const b = secCases.map((r) => bucket(rank(r)))
      const n = Math.max(1, b.length)
      return `${label} top3=${f3(b.filter((x) => x.t3).length / n)} top6=${f3(b.filter((x) => x.t6).length / n)} top12=${f3(b.filter((x) => x.t12).length / n)} any=${f3(b.filter((x) => x.any).length / n)}`
    }
    // pool = lexical top-12 AFTER the relative floor (what the semantic stage can see)
    const inPool = secCases.filter((r) => lexicalPool(r.query).pool.some((s) => hits(r.id).includes(sec(s.item.chunk.id)))).length
    const docCases = fired.filter((r) => pred(r.id))
    const unitRank = (r: (typeof fired)[number], u: string[]) => { const i = lexicalPool(r.query).lex.findIndex((s) => u.includes(doc(s.item.chunk.id))); return i < 0 ? null : i + 1 }
    const unitB = docCases.flatMap((r) => unitsOf(byId.get(r.id)!).map((u) => bucket(unitRank(r, u))))
    const nu = Math.max(1, unitB.length)
    out.push(
      `${name.padEnd(18)} secCases=${String(secCases.length).padStart(3)} | LEXICAL ${agg(lexRank, "sec")} inFloorPool=${f3(inPool / Math.max(1, secCases.length))} | POST-R3H ${agg(postRank, "sec")}`,
      `${"".padEnd(18)} docUnits=${String(unitB.length).padStart(3)}  doc-in-lexical top3=${f3(unitB.filter((x) => x.t3).length / nu)} top6=${f3(unitB.filter((x) => x.t6).length / nu)} top12=${f3(unitB.filter((x) => x.t12).length / nu)} any=${f3(unitB.filter((x) => x.any).length / nu)}`,
    )
  }
  console.log(out.join("\n"))
})

/** Candidate-miss taxonomy for section cases whose target is not in the floor-limited lexical top-12 pool. */
it.skipIf(run !== "miss")("R3-I candidate miss taxonomy", { timeout: 900000 }, () => {
  const fired = sections().filter((r) => byId.get(r.id)!.sectionEvaluation)
  const counts = new Map<string, string[]>()
  const detail: string[] = []
  for (const r of fired) {
    const { lex, floor, pool } = lexicalPool(r.query)
    if (pool.some((s) => hits(r.id).includes(sec(s.item.chunk.id)))) continue
    const c = byId.get(r.id)!
    const targetItems = index.items.filter((i) => hits(r.id).includes(sec(i.chunk.id)))
    const found = lex.findIndex((s) => hits(r.id).includes(sec(s.item.chunk.id)))
    let cls = ""
    let why = ""
    if (found >= 0) {
      const t = lex[found]
      if (t.score < floor) { cls = "I"; why = `below relative floor (${t.score.toFixed(3)} < ${floor.toFixed(3)}), lex rank ${found + 1}` }
      else {
        const above = lex.slice(0, found)
        const sameDoc = above.filter((s) => doc(s.item.chunk.id) === doc(t.item.chunk.id)).length
        const sameFood = above.filter((s) => doc(s.item.chunk.id) !== doc(t.item.chunk.id) && (s.item.chunk.metadata.foodTypes ?? []).some((f) => (t.item.chunk.metadata.foodTypes ?? []).includes(f))).length
        cls = c.language !== "en" && !(r.query.conceptTerms?.length) ? "D" : sameFood >= 3 ? "G" : sameDoc >= 3 ? "F" : "E"
        why = `lex rank ${found + 1} (cap ${POOL_K}); above it: ${sameDoc} same-doc sections, ${sameFood} same-foodType other-doc sections`
      }
    } else {
      const t = targetItems[0]
      const q = r.query
      if (q.cuisines?.length && t?.chunk.metadata.category === "cuisine" && !(t.chunk.metadata.cuisines ?? []).some((x) => q.cuisines!.includes(x))) { cls = "B"; why = `cuisine gate: query cuisines=${q.cuisines.join(",")} vs doc cuisines` }
      else if (c.language !== "en") { cls = "D"; why = "not scored at all; non-English query, concepts=" + (q.conceptTerms ?? []).join("|") }
      else { cls = "A"; why = "not scored at all (no lexical/metadata evidence reached minScore)" }
    }
    counts.set(cls, [...(counts.get(cls) ?? []), r.id])
    detail.push(`${cls} ${r.id} [${c.language}] ${c.message.slice(0, 70)} -> ${hits(r.id)[0]} | ${why}`)
  }
  console.log(["", ...detail, "", ...[...counts].sort().map(([k, v]) => `${k}: ${v.length}  ${v.join(" ")}`), `section cases fired: ${fired.length}; miss total: ${[...counts.values()].reduce((a, b) => a + b.length, 0)}`].join("\n"))
})

/** Wrong-document slot analysis (top-4 primary slots) and the selector-vs-corpus question. */
it.skipIf(run !== "slots")("R3-I slot fill analysis", { timeout: 900000 }, () => {
  const fired = sections()
  const label: Record<string, number> = {}
  const posTot = [0, 0, 0, 0], posWrong = [0, 0, 0, 0]
  const posCls: Array<Record<string, number>> = [{}, {}, {}, {}]
  const lines: string[] = []
  const sectionStats = new Map<string, { wrong: number; right: number; cases: string[] }>()
  let selectorDisplaced = 0, corpusLimited = 0
  const sel: string[] = []
  for (const r of fired) {
    const ok = okSet(r.id)
    const units = unitsOf(byId.get(r.id)!)
    const docsTop = r.primary.map(doc)
    const covered = units.filter((u) => u.some((d) => docsTop.includes(d)))
    const { pool } = lexicalPool(r.query)
    const post = scoreAllForEval(index, r.query, R3H_CONFIG)
    const postFloor = (post[0]?.score ?? 0) * (R3_CONFIG.relativeFloor ?? 0)
    const postPool = post.filter((s) => s.score >= postFloor)
    r.primary.slice(0, 4).forEach((id, i) => {
      posTot[i]++
      const st = sectionStats.get(sec(id)) ?? { wrong: 0, right: 0, cases: [] }
      if (ok.has(doc(id))) { st.right++; sectionStats.set(sec(id), st); return }
      posWrong[i]++
      st.wrong++; st.cases.push(r.id); sectionStats.set(sec(id), st)
      const missingUnits = units.filter((u) => !u.some((d) => docsTop.includes(d)))
      let cls: string
      if (missingUnits.length === 0) cls = "A"
      else if (byId.get(r.id)!.multiDocument && missingUnits.length > 0 && missingUnits.some((u) => postPool.some((s) => u.includes(doc(s.item.chunk.id))))) cls = "D"
      else if (missingUnits.some((u) => !pool.some((s) => u.includes(doc(s.item.chunk.id))))) cls = "B"
      else cls = i === 0 ? "C" : "E"
      label[cls] = (label[cls] ?? 0) + 1
      posCls[i][cls] = (posCls[i][cls] ?? 0) + 1
      // selector-vs-corpus: was a better-scored ok-doc chunk in the post-floor pool left unpicked?
      const picked = new Set(r.primary.map(sec))
      const filler = postPool.find((s) => sec(s.item.chunk.id) === sec(id))
      const better = postPool.find((s) => !picked.has(sec(s.item.chunk.id)) && ok.has(doc(s.item.chunk.id)) && filler && s.score > filler.score)
      if (better) { selectorDisplaced++; sel.push(`${r.id}#${i + 1} filler ${sec(id)} (${filler!.score.toFixed(3)}) displaced ${sec(better.item.chunk.id)} (${better.score.toFixed(3)})`) }
      else corpusLimited++
      lines.push(`${cls} ${r.id}#${i + 1} wrong ${sec(id)} | covered ${covered.length}/${units.length} | ${byId.get(r.id)!.message.slice(0, 60)}`)
    })
  }
  const total = posWrong.reduce((a, b) => a + b, 0)
  const top3 = (arr: number[]) => arr.slice(0, 3).reduce((a, b) => a + b, 0)
  console.log(["",
    `fired positives=${fired.length}; wrong slots (all 4 positions)=${total}; top-3 wrong=${top3(posWrong)}/${top3(posTot)}=${f3(top3(posWrong) / top3(posTot))}`,
    ...[0, 1, 2, 3].map((i) => `slot #${i + 1}: wrong ${posWrong[i]}/${posTot[i]}=${f3(posWrong[i] / posTot[i])}  ${JSON.stringify(posCls[i])}`),
    `class totals (A filler/B absent from pool/C wrong top doc/D multi unresolved/E outranks specific): ${JSON.stringify(label)}`,
    `wrong slots where a higher-scored ok-doc chunk was left unpicked (selector penalties/cap displaced it): ${selectorDisplaced}; no better ok chunk existed (corpus-limited): ${corpusLimited}`,
    "", "Top wrong-doc sections (slot thieves):",
    ...[...sectionStats].filter(([, v]) => v.wrong).sort((a, b) => b[1].wrong - a[1].wrong).slice(0, 25).map(([k, v]) => `  ${String(v.wrong).padStart(3)} wrong / ${String(v.right).padStart(3)} right  ${k}`),
    "", ...(process.env.R3I_VERBOSE ? [...lines, "", ...sel] : []),
  ].join("\n"))
})

/** Per-section appearance counts across ALL DEV positives (filler evidence), keyed by section, with the cases it stole from. */
it.skipIf(run !== "filler")("R3-I section appearance table", { timeout: 900000 }, () => {
  const fired = sections()
  const rows = new Map<string, { n: number; wrong: number; hit: number; stolen: string[] }>()
  for (const it of index.items) rows.set(sec(it.chunk.id), { n: 0, wrong: 0, hit: 0, stolen: [] })
  for (const r of fired) {
    r.primary.slice(0, 4).forEach((id) => {
      const row = rows.get(sec(id))!
      row.n++
      if (hits(r.id).includes(sec(id))) row.hit++
      if (!okSet(r.id).has(doc(id))) { row.wrong++; row.stolen.push(r.id) }
    })
  }
  const targetCount = new Map<string, number>()
  for (const c of CASES_V4_DEV) for (const s of hits(c.id)) targetCount.set(s, (targetCount.get(s) ?? 0) + 1)
  console.log(["", "section | appearances in top-4 | as expected-section hit | wrong-doc slots | times labelled a target in DEV", ...[...rows].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} | ${v.n} | ${v.hit} | ${v.wrong} | ${targetCount.get(k) ?? 0}`)].join("\n"))
  if (process.env.R3I_OUT) writeFileSync(join(process.env.R3I_OUT), JSON.stringify([...rows], null, 1))
})

void GENERIC_DOCS
const _row: Row | null = null
void _row

it.skipIf(run !== "cases")("R3-I per-case dump (R3-H)", { timeout: 900000 }, () => {
  const { results } = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG)
  const short = (id: string) => sec(id).replace(/^(core|goal|cuisine|craving|food_makeovers|flavor_texture|coaching)\./, "")
  const lines = results.filter((r) => byId.get(r.id)!.expectedKnowledgeNeed).map((r) => {
    const c = byId.get(r.id)!
    const units = unitsOf(c)
    const got = units.filter((u) => u.some((d) => r.docs.slice(0, 3).includes(d))).length
    const wrong = r.primary.slice(0, 3).filter((id) => !okSet(r.id).has(doc(id))).length
    const flag = !r.fired ? "GATE-MISS" : got < units.length ? "DOC-MISS" : r.sectionRank !== null && r.sectionRank > 3 ? "SEC>3" : c.sectionEvaluation && r.sectionRank === null ? "SEC-NONE" : wrong ? "WRONG" : "ok"
    return `${flag.padEnd(9)} ${r.id} [${c.language}/${c.domain}${c.multiDocument ? "/MULTI" : ""}] "${c.message.slice(0, 90)}" want ${[...(c.expectedDocumentIds ?? []), ...(c.anyOfDocumentIds ? ["any:" + c.anyOfDocumentIds.join("|")] : [])].join("+")} sec ${hits(r.id).map(short).join("|") || "-"} (rank ${r.sectionRank}) got ${r.primary.map(short).join(" , ")}`
  })
  if (process.env.R3I_OUT) writeFileSync(process.env.R3I_OUT, lines.join("\n"))
  console.log(["", ...lines.filter((l) => !l.startsWith("ok"))].join("\n"))
})

import { CASES } from "./cases"
import { CASES_V2 } from "./cases-v2"
import { CASES_V3_DEV } from "./cases-v3-dev"
/** Section slugs referenced by ANY visible, frozen suite (v1, v2, v3.1 DEV, v4 DEV) and the number of references. Renaming one breaks pinned labels. */
export function labelledSections() {
  const m = new Map<string, number>()
  const add = (x: string) => m.set(x, (m.get(x) ?? 0) + 1)
  for (const c of [...CASES, ...CASES_V2] as Array<{ section?: { doc: string; heading: string } }>) if (c.section) add(`${c.section.doc}::${c.section.heading}`)
  for (const c of CASES_V3_DEV as Array<{ sections?: string[]; siblingSections?: string[] }>) [...(c.sections ?? []), ...(c.siblingSections ?? [])].forEach(add)
  for (const c of CASES_V4_DEV) [...(c.expectedSectionIds ?? []), ...(c.acceptableSectionIds ?? []), ...(c.alsoUsefulSectionIds ?? [])].forEach(add)
  return m
}
it.skipIf(run !== "labels")("R3-I labelled sections", () => {
  const lab = labelledSections()
  const all = index.items.map((i) => sec(i.chunk.id))
  const unl = all.filter((x) => !lab.has(x))
  const unknown = [...lab.keys()].filter((x) => !all.includes(x))
  console.log(["", `chunks=${all.length} labelled=${all.length - unl.length} unlabelled=${unl.length} unknownLabels=${unknown.join(",")}`, "UNLABELLED:", ...unl.map((x) => "  " + x)].join("\n"))
})

it.skipIf(run !== "queries")("R3-I query facets for chosen cases", () => {
  const { results } = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG)
  const want = (process.env.R3I_IDS ?? "").split(",")
  for (const r of results.filter((x) => want.includes(x.id))) {
    const q = r.query
    const lex = q ? scoreAllForEval(index, q, R3_CONFIG) : []
    console.log(`${r.id} fired=${r.fired} reason=${r.reason} q=${JSON.stringify(q ? { terms: q.query, cat: q.categories?.slice(0, 3), food: q.foodTypes, cuis: q.cuisines, sens: q.sensoryTargets, concept: q.conceptTerms, goal: q.goal, stated: q.goalStated } : null)}\n   lexTop5: ${lex.slice(0, 5).map((s) => `${sec(s.item.chunk.id).replace(/^[a-z_]+\./, "")}=${s.score.toFixed(2)}`).join(" , ")}\n   target(s): ${hits(r.id).map((h) => { const i = lex.findIndex((s) => sec(s.item.chunk.id) === h); return `${h.replace(/^[a-z_]+\./, "")}@${i < 0 ? "none" : `${i + 1}(${lex[i].score.toFixed(2)})`}` }).join(" | ")}`)
  }
})

import { multiLine, v4Block } from "./semantic-lab"
import { subsetReportsV4 } from "./run-eval-v4"
/** One consolidated DEV block for the frozen R3-H config (the number set the R3-I report compares before/after). R3I=eval */
it.skipIf(run !== "eval")("R3-I consolidated DEV block", { timeout: 900000 }, () => {
  const { results } = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG)
  const s = subsetReportsV4(CASES_V4_DEV, results)
  const row = (n: string, x: (typeof s.language)["vi"]) => `  ${n.padEnd(16)} n=${String(x.positives).padStart(3)} R@3=${f3(x.doc.recallAt3)} e2eR@3=${f3(x.doc.endToEndRecallAt3)} wrong=${f3(x.doc.wrongDocRate)} secT1=${f3(x.section.top1)} secT3=${f3(x.section.top3)} wrongSec=${f3(x.section.wrongSectionRate)} cov@4=${f3(x.doc.coverageAt4)} full=${f3(x.doc.fullCoverageAt4)}`
  const fired = results.filter((r) => r.fired && byId.get(r.id)!.expectedKnowledgeNeed)
  const wrongTop3 = fired.reduce((a, r) => a + r.primary.slice(0, 3).filter((id) => !okSet(r.id).has(doc(id))).length, 0)
  console.log(["", v4Block("R3-H", R3H_CONFIG), `  wrong top-3 chunks=${wrongTop3} of ${fired.reduce((a, r) => a + Math.min(3, r.primary.length), 0)}`,
    row("Vietnamese", s.language.vi), row("Mixed", s.language.mixed), row("English", s.language.en), row("Goal strategy", s.failureClass.GOAL_STRATEGY), row("Cuisine", s.failureClass.CUISINE_CONTEXT), row("OOV/low-overlap", s.failureClass.LOW_OVERLAP), row("Craving/sensory", s.failureClass.CRAVING_SENSORY), row("Multi-document", s.failureClass.MULTI_DOCUMENT), row("Sibling-section", s.failureClass.SIBLING_SECTION),
    multiLine("R3-H four-suite", R3H_CONFIG)].join("\n"))
})

it.skipIf(run !== "breakdown")("R3-I score breakdown", () => {
  const { results } = evaluateV4(CASES_V4_DEV, g4, R3H_CONFIG)
  for (const r of results.filter((x) => (process.env.R3I_IDS ?? "").split(",").includes(x.id) && x.query)) {
    const lex = scoreAllForEval(index, r.query!, R3_CONFIG)
    console.log(r.id, "terms", JSON.stringify(r.query!.query))
    for (const s of lex.slice(0, Number(process.env.R3I_N ?? 4))) console.log("  ", sec(s.item.chunk.id), s.score.toFixed(3), Object.entries(s.signals).filter(([, v]) => v).map(([k, v]) => `${k}=${(v as number).toFixed(2)}`).join(" "))
  }
})

import { R3G_CONFIG } from "./semantic-lab"
it.skipIf(run !== "oovdemo")("R3-I OOV demo candidates (lexical R3 misses, R3-G finds)", () => {
  const ids = CASES_V4_DEV.filter((c) => c.expectedKnowledgeNeed && c.sectionEvaluation && c.failureClass.includes("LOW_OVERLAP")).map((c) => c.id)
  const a = evaluateV4(CASES_V4_DEV.filter((c) => ids.includes(c.id)), g4, R3_CONFIG).results
  const b = evaluateV4(CASES_V4_DEV.filter((c) => ids.includes(c.id)), g4, R3G_CONFIG).results
  console.log(a.map((x, i) => `${x.id} R3=${x.sectionRank} R3G=${b[i].sectionRank}`).filter((l) => /R3=null R3G=[123]$/.test(l)).join("\n"))
})
