import { decideNutritionKnowledgeNeed } from "../../need"
import type { KnowledgeNeedDecision } from "../../types"
import { buildKnowledgeQuery } from "../../query"
import { getKnowledgeIndex, retrieveKnowledge, scoreAllForEval } from "../../retrieve"
import type { ScoreConfig } from "../../score"
import { parseSemanticGate, semanticOutputToDecision } from "../../semantic-gate"
import { CASES, type EvalCase } from "./cases"

/**
 * N1.6.3 evaluation engine (test-only). Mirrors the runtime sequence
 * (gate -> query -> retrieval) and measures each level of the evaluation
 * pyramid separately, so a retrieval problem is never blamed on the gate or
 * vice versa.
 */
const index = getKnowledgeIndex()
const docOf = (id: string) => id.split("::")[0].replace("nutrition.", "")
const headingOf = (id: string) => id.split("::")[1] ?? ""
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0
}
const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d)

export type CaseResult = {
  id: string
  fired: boolean
  /** Primary chunk ids in selection order. */
  primary: string[]
  docsTop3: string[]
  /** Every distinct document among the primary chunks, in rank order. */
  docsAll: string[]
  zero: boolean
  contextChars: number
  latencyMs: number
  /** Rank (1-based) of the expected section among primary chunks, or null. */
  sectionRank: number | null
  mandatoryFound: number
  mandatoryTotal: number
  wrongTop3: number
  top3Chunks: number
}

export type EvalReport = {
  split: string
  cases: number
  gate: { tp: number; fp: number; fn: number; tn: number; precision: number; recall: number }
  docRecallAt3: number
  docRecallAt1: number
  docRecallAt4: number
  /** Mean reciprocal rank of the first mandatory document among distinct documents (0 when absent). */
  mrr: number
  /** Of section cases whose document was retrieved, the share where the expected section was not ranked first. */
  wrongSectionRate: number
  wrongDocumentRate: number
  zeroResultRate: number
  avgPrimaryChunks: number
  section: { cases: number; top1: number; top3: number }
  latencyMs: { avg: number; p95: number }
  context: { avgChars: number; maxChars: number }
  /** Cases where the gate was expected to fire but did not (excluded from retrieval-level metrics). */
  gateMisses: string[]
  failures: Array<{ id: string; why: string }>
}

/** Gate under test. Default: the deterministic Layer 1 only (no model). */
export type GateFn = (c: EvalCase) => KnowledgeNeedDecision
const layer1: GateFn = (c) => decideNutritionKnowledgeNeed({ message: c.message, intent: c.intent })

function evaluateCase(c: EvalCase, config: ScoreConfig, gate: GateFn): CaseResult {
  const need = gate(c)
  const blank: CaseResult = { id: c.id, fired: false, primary: [], docsTop3: [], docsAll: [], zero: false, contextChars: 0, latencyMs: 0, sectionRank: null, mandatoryFound: 0, mandatoryTotal: c.docs?.length ?? 0, wrongTop3: 0, top3Chunks: 0 }
  if (!need.needed) return blank
  const query = buildKnowledgeQuery({ message: c.message, reason: need.reason, intent: c.intent, goal: "fat_loss", timezone: "Asia/Singapore", hints: need.hints })
  const { context, trace } = retrieveKnowledge(index, query, need, config)
  const primary = (context?.chunks ?? []).filter((x) => x.sourceType === "primary").map((x) => x.id)
  const docsTop3 = [...new Set(primary.map(docOf))].slice(0, 3)
  const acceptable = new Set([...(c.docs ?? []), ...(c.acceptable ?? [])])
  const top3 = primary.slice(0, 3)
  const sectionRank = c.section ? primary.findIndex((id) => docOf(id) === c.section!.doc && headingOf(id) === c.section!.heading) + 1 || null : null
  return {
    ...blank,
    fired: true,
    primary,
    docsTop3,
    docsAll: [...new Set(primary.map(docOf))],
    zero: primary.length === 0,
    contextChars: trace.contextCharacters,
    latencyMs: trace.latencyMs,
    sectionRank,
    mandatoryFound: (c.docs ?? []).filter((d) => docsTop3.includes(d)).length,
    wrongTop3: top3.filter((id) => !acceptable.has(docOf(id))).length,
    top3Chunks: top3.length,
  }
}

export function evaluate(config: ScoreConfig, split: "dev" | "heldout" | "all" = "all", cases: EvalCase[] = CASES, gate: GateFn = layer1): { report: EvalReport; results: CaseResult[] } {
  const selected = cases.filter((c) => split === "all" || c.split === split)
  const results = selected.map((c) => evaluateCase(c, config, gate))
  const byId = new Map(selected.map((c) => [c.id, c]))

  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const r of results) {
    const expected = byId.get(r.id)!.gate
    if (expected && r.fired) tp++
    else if (!expected && r.fired) fp++
    else if (expected && !r.fired) fn++
    else tn++
  }

  const fired = results.filter((r) => r.fired && byId.get(r.id)!.gate)
  const mandatory = fired.filter((r) => r.mandatoryTotal > 0)
  const withSection = fired.filter((r) => byId.get(r.id)!.section)
  const recallAt = (k: number) => ratio(mandatory.reduce((s, r) => s + (byId.get(r.id)!.docs ?? []).filter((d) => r.docsAll.slice(0, k).includes(d)).length, 0), mandatory.reduce((s, r) => s + r.mandatoryTotal, 0))
  const failures: EvalReport["failures"] = []
  for (const r of fired) {
    const c = byId.get(r.id)!
    if (r.mandatoryFound < r.mandatoryTotal) failures.push({ id: r.id, why: `missing ${(c.docs ?? []).filter((d) => !r.docsTop3.includes(d)).join(", ")} (got ${r.docsTop3.join(", ") || "nothing"})` })
    if (r.wrongTop3 > 0) failures.push({ id: r.id, why: `wrong doc in top 3: ${r.primary.slice(0, 3).filter((id) => !new Set([...(c.docs ?? []), ...(c.acceptable ?? [])]).has(docOf(id))).join(", ")}` })
    if (c.section && (r.sectionRank === null || r.sectionRank > 3)) failures.push({ id: r.id, why: `section ${c.section.doc}::${c.section.heading} rank ${r.sectionRank ?? "absent"}` })
  }

  const report: EvalReport = {
    split,
    cases: selected.length,
    gate: { tp, fp, fn, tn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) },
    docRecallAt3: ratio(mandatory.reduce((s, r) => s + r.mandatoryFound, 0), mandatory.reduce((s, r) => s + r.mandatoryTotal, 0)),
    docRecallAt1: recallAt(1),
    docRecallAt4: recallAt(4),
    mrr: mean(mandatory.map((r) => { const rank = r.docsAll.findIndex((d) => (byId.get(r.id)!.docs ?? []).includes(d)); return rank < 0 ? 0 : 1 / (rank + 1) })),
    wrongSectionRate: ratio(withSection.filter((r) => r.docsAll.includes(byId.get(r.id)!.section!.doc) && r.sectionRank !== 1).length, withSection.filter((r) => r.docsAll.includes(byId.get(r.id)!.section!.doc)).length),
    wrongDocumentRate: fired.reduce((s, r) => s + r.wrongTop3, 0) / Math.max(1, fired.reduce((s, r) => s + r.top3Chunks, 0)),
    zeroResultRate: fired.length ? fired.filter((r) => r.zero).length / fired.length : 0,
    avgPrimaryChunks: mean(fired.map((r) => r.primary.length)),
    section: { cases: withSection.length, top1: ratio(withSection.filter((r) => r.sectionRank === 1).length, withSection.length), top3: ratio(withSection.filter((r) => r.sectionRank !== null && r.sectionRank <= 3).length, withSection.length) },
    latencyMs: { avg: mean(fired.map((r) => r.latencyMs)), p95: pct(fired.map((r) => r.latencyMs), 0.95) },
    context: { avgChars: mean(fired.map((r) => r.contextChars)), maxChars: Math.max(0, ...fired.map((r) => r.contextChars)) },
    gateMisses: results.filter((r) => byId.get(r.id)!.gate && !r.fired).map((r) => r.id),
    failures,
  }
  return { report, results }
}

/** Dev/eval only: full per-signal breakdown of the top candidates for one message. */
export function explain(message: string, config: ScoreConfig, top = 6) {
  const need = decideNutritionKnowledgeNeed({ message })
  const query = buildKnowledgeQuery({ message, reason: need.reason, goal: "fat_loss", timezone: "Asia/Singapore" })
  return scoreAllForEval(index, query, config).slice(0, top).map((s) => ({ id: s.item.chunk.id.replace("nutrition.", ""), ...Object.fromEntries(Object.entries(s.breakdown).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) }))
}

export const f = (n: number, digits = 3) => (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)

export const FAILURE_CLASSES = ["CATEGORY_CONFUSION", "FOOD_TYPE_CONFUSION", "SENSORY_CONFUSION", "GENERIC_DOC_DOMINANCE", "TITLE_HEADING_COLLISION", "GOAL_OVERWEIGHT", "LEXICAL_OVERLAP", "COMPANION_POLLUTION", "LOCALE_OVERWEIGHT", "NO_CORRECT_CANDIDATE", "OTHER"] as const
export type FailureClass = (typeof FAILURE_CLASSES)[number]
const SIGNAL_CLASS: Record<string, FailureClass> = { lexicalBody: "LEXICAL_OVERLAP", localMatch: "LEXICAL_OVERLAP", headingMatch: "TITLE_HEADING_COLLISION", titleMatch: "TITLE_HEADING_COLLISION", category: "CATEGORY_CONFUSION", foodType: "FOOD_TYPE_CONFUSION", sensory: "SENSORY_CONFUSION", cuisine: "OTHER", goal: "GOAL_OVERWEIGHT", locale: "LOCALE_OVERWEIGHT", authority: "OTHER" }

/**
 * Deterministic failure bucketing for every wrong document in a case's top 3.
 * Rule (no judgement): compare the wrong chunk with the best-scoring chunk of a mandatory/acceptable
 * document; the class is the signal with the largest WEIGHTED advantage of wrong over right.
 * Overrides: a companion-heading chunk is COMPANION_POLLUTION; a core.* document is GENERIC_DOC_DOMINANCE;
 * no correct candidate scored at all is NO_CORRECT_CANDIDATE.
 */
export function bucketWrongDocuments(config: ScoreConfig, cases: EvalCase[], gate: GateFn = layer1): Array<{ id: string; message: string; wrong: string; cls: FailureClass; signal?: string }> {
  const out: Array<{ id: string; message: string; wrong: string; cls: FailureClass; signal?: string }> = []
  for (const c of cases) {
    if (!c.gate) continue
    const need = gate(c)
    if (!need.needed) continue
    const query = buildKnowledgeQuery({ message: c.message, reason: need.reason, intent: c.intent, goal: "fat_loss", timezone: "Asia/Singapore", hints: need.hints })
    const { context } = retrieveKnowledge(index, query, need, config)
    const primary = (context?.chunks ?? []).filter((x) => x.sourceType === "primary").map((x) => x.id).slice(0, 3)
    const ok = new Set([...(c.docs ?? []), ...(c.acceptable ?? [])])
    const scored = scoreAllForEval(index, query, config)
    const bestRight = scored.find((s) => ok.has(docOf(s.item.chunk.id)))
    for (const id of primary.filter((p) => !ok.has(docOf(p)))) {
      const wrong = scored.find((s) => s.item.chunk.id === id)!
      let cls: FailureClass
      let signal: string | undefined
      if (/(?:do-not-claim|coach-decision-rules|common-failure-modes)$/.test(id)) cls = "COMPANION_POLLUTION"
      else if (docOf(id).startsWith("core.")) cls = "GENERIC_DOC_DOMINANCE"
      else if (!bestRight) cls = "NO_CORRECT_CANDIDATE"
      else {
        const [top] = Object.entries(config.weights)
          .map(([k, w]) => [k, w * ((wrong.signals as Record<string, number>)[k] - (bestRight.signals as Record<string, number>)[k])] as const)
          .sort((a, b) => b[1] - a[1])
        signal = top && top[1] > 0 ? top[0] : "none>0"
        cls = top && top[1] > 0 ? SIGNAL_CLASS[top[0]] : "OTHER"
      }
      out.push({ id: c.id, message: c.message, wrong: id.replace("nutrition.", ""), cls, signal })
    }
  }
  return out
}

/** Layer 1 + a replay of RECORDED Layer-2 answers (see semantic-gate.live.test.ts). Deterministic, no network. */
export function layeredGate(recording: Record<string, { promptHash: string; reply: string | null }>): GateFn {
  return (c) => {
    const l1 = decideNutritionKnowledgeNeed({ message: c.message, intent: c.intent })
    if (!l1.uncertain) return l1
    const out = parseSemanticGate(recording[c.message]?.reply)
    return out ? semanticOutputToDecision(out) : l1
  }
}
