import { retrieveKnowledge, scoreAllForEval } from "../../retrieve"
import { R3_CONFIG, type ScoreConfig } from "../../score"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { f3, index } from "./run-eval-v3"
import { evaluateV4, FAILURE_CLASSES_V4, subsetReportsV4, unitsOf } from "./run-eval-v4"
import { g4 } from "./semantic-lab"

/** R3-H diagnostics (test-only, DEV): document-level and section-level breakdowns for one config. */
const byId = new Map(CASES_V4_DEV.map((c) => [c.id, c]))
const sec = (id: string) => id.replace("nutrition.", "")
const doc = (id: string) => sec(id).split("::")[0]
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function diagBlock(name: string, cfg: ScoreConfig) {
  const { results, report } = evaluateV4(CASES_V4_DEV, g4, cfg)
  const fired = results.filter((r) => r.fired && byId.get(r.id)!.expectedKnowledgeNeed)
  const C = (r: { id: string }) => byId.get(r.id)!
  const ok = (r: { id: string }) => new Set([...(C(r).expectedDocumentIds ?? []), ...(C(r).anyOfDocumentIds ?? []), ...(C(r).acceptableDocumentIds ?? [])])
  const req = (r: { id: string }) => new Set([...(C(r).expectedDocumentIds ?? []), ...(C(r).anyOfDocumentIds ?? [])])
  const top1Doc = fired.filter((r) => r.primary.length && req(r).has(doc(r.primary[0]))).length / fired.length
  const topOk = fired.filter((r) => r.primary.length && ok(r).has(doc(r.primary[0]))).length / fired.length
  const two = fired.filter((r) => r.docs.length >= 2)
  const secondUseful = two.filter((r) => ok(r).has(r.docs[1])).length / Math.max(1, two.length)
  const multi = fired.filter((r) => C(r).multiDocument)
  const multiSecond = multi.filter((r) => unitsOf(C(r)).length >= 2 && r.docs.slice(0, 4).filter((d) => unitsOf(C(r)).some((u) => u.includes(d))).length >= 2).length / Math.max(1, multi.length)
  // wrong-doc by position within the top-3 chunks
  const pos = [0, 0, 0], tot = [0, 0, 0]
  for (const r of fired) r.primary.slice(0, 3).forEach((id, i) => { tot[i]++; if (!ok(r).has(doc(id))) pos[i]++ })
  const cls = subsetReportsV4(CASES_V4_DEV, results).failureClass
  const byClass = FAILURE_CLASSES_V4.filter((k) => cls[k].positives > 0 && k !== "NEGATIVE_NEAR_MISS").map((k) => `${k.slice(0, 7)}=${f3(cls[k].doc.wrongDocRate)}`).join(" ")

  // section diagnostics
  const secCases = fired.filter((r) => C(r).sectionEvaluation)
  const hits = (r: { id: string }) => [...(C(r).expectedSectionIds ?? []), ...(C(r).acceptableSectionIds ?? [])]
  let inPool = 0, exact = 0, near = 0, noLocal = 0
  const pre: number[] = [], post: number[] = []
  for (const r of secCases) {
    const lex = scoreAllForEval(index, r.query!, R3_CONFIG)
    const floor = (lex[0]?.score ?? 0) * (R3_CONFIG.relativeFloor ?? 0)
    const pool = lex.filter((s) => s.score >= floor).slice(0, 12)
    const h = hits(r)
    const preIdx = lex.findIndex((s) => h.includes(sec(s.item.chunk.id)))
    if (pool.some((s) => h.includes(sec(s.item.chunk.id)))) inPool++
    if (preIdx >= 0) pre.push(preIdx + 1)
    const tgt = preIdx >= 0 ? lex[preIdx] : null
    if (tgt && tgt.signals.localMatch === 0 && tgt.signals.headingMatch === 0) noLocal++
    if (tgt && lex.some((s) => s !== tgt && s.score === tgt.score)) exact++
    else if (tgt && lex.some((s) => s !== tgt && Math.abs(s.score - tgt.score) <= 0.02)) near++
    const aft = scoreAllForEval(index, r.query!, cfg)
    const postIdx = aft.findIndex((s) => h.includes(sec(s.item.chunk.id)))
    if (postIdx >= 0) post.push(postIdx + 1)
  }
  const n = secCases.length
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0)
  return [
    `${name}: DOC  R@1(docOfTop1)=${f3(top1Doc)} top1-doc-acceptable=${f3(topOk)} 2nd-doc-useful=${f3(secondUseful)} (n=${two.length}) multi-doc both-found@4=${f3(multiSecond)} (n=${multi.length})`,
    `${"".padEnd(name.length)}  wrong-doc by chunk position top3: #1 ${f3(pos[0] / tot[0])} #2 ${f3(pos[1] / tot[1])} #3 ${f3(pos[2] / tot[2])} | by class ${byClass}`,
    `${"".padEnd(name.length)}  SEC  n=${n} target-in-lexical-pool(12)=${f3(inPool / n)} | pre-rank present=${pre.length} mean=${mean(pre).toFixed(2)} med=${med(pre)} top3=${f3(pre.filter((x) => x <= 3).length / n)} | post-rank present=${post.length} mean=${mean(post).toFixed(2)} med=${med(post)} top3=${f3(post.filter((x) => x <= 3).length / n)} | exact-tie=${f3(exact / n)} near-tie(<=.02)=${f3(near / n)} no-local-evidence=${f3(noLocal / n)}`,
    `${"".padEnd(name.length)}  report secT3=${f3(report.section.top3)} wrongDoc=${f3(report.doc.wrongDocRate)}`,
  ].join("\n")
}
void retrieveKnowledge
