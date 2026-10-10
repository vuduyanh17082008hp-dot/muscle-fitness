import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { decideNutritionKnowledgeNeed } from "../../need"
import { normalizeTerms } from "../../normalize"
import { buildKnowledgeQuery } from "../../query"
import { getKnowledgeIndex, retrieveKnowledge, scoreAllForEval } from "../../retrieve"
import { ACTIVE_CONFIG, queryTermsOf, scoreChunk, type ScoreConfig, type ScoredChunk } from "../../score"
import { buildSemanticGatePrompt, parseSemanticGate, semanticOutputToDecision } from "../../semantic-gate"
import type { KnowledgeNeedDecision, NutritionKnowledgeQuery } from "../../types"
import { GENERIC_DOCS, type V3Case, type V3Hypothesis } from "./cases-v3-types"

/**
 * nutrition-retrieval-eval-v3 runner (test-only, read-only against the runtime). Same sequence as lib/nutrition/coach/chat.ts:
 * gate(message) -> buildKnowledgeQuery(message, reason, topic, hints) -> retrieveKnowledge(ACTIVE_CONFIG).
 * Goal is fixed to "fat_loss" and timezone to Asia/Singapore, exactly as the v1/v2 runner, so numbers are comparable.
 */
export const index = getKnowledgeIndex()
export const docOf = (id: string) => id.split("::")[0].replace("nutrition.", "")
const sectionOf = (id: string) => id.replace("nutrition.", "")
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] : 0
}
const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d)
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const promptHash = (m: string) => createHash("sha1").update(buildSemanticGatePrompt(m)).digest("hex").slice(0, 12)

// ---------------------------------------------------------------- gates
export type V3Gate = (c: V3Case) => KnowledgeNeedDecision
export type GateRecording = Record<string, { promptHash: string; reply: string | null }>
export const layer1Gate: V3Gate = (c) => decideNutritionKnowledgeNeed({ message: c.message, intent: c.intent })

/** Layer 1 + replay of recorded Layer-2 replies. A reply recorded against a different prompt is ignored (falls back to Layer 1). */
export function layeredGate(recording: GateRecording): V3Gate & { unrecorded: Set<string> } {
  const unrecorded = new Set<string>()
  const gate = (c: V3Case) => {
    const l1 = decideNutritionKnowledgeNeed({ message: c.message, intent: c.intent })
    if (!l1.uncertain) return l1
    const rec = recording[c.message]
    if (!rec || rec.promptHash !== promptHash(c.message)) {
      unrecorded.add(c.id)
      return l1
    }
    const out = parseSemanticGate(rec.reply)
    return out ? semanticOutputToDecision(out) : l1
  }
  return Object.assign(gate, { unrecorded })
}

/**
 * Retrieval-isolation gate (eval only): every positive fires with its first labelled reason and no Layer-2 hints; negatives
 * use Layer 1. Measures retrieval on cases the real gate would have dropped; never a statement about gate quality.
 */
export const oracleGate: V3Gate = (c) =>
  c.mustRetrieve ? { needed: true, reason: c.expectedCategory![0], confidence: "HIGH", rationale: "oracle (eval only)" } : layer1Gate(c)

export const DEV_RECORDING_PATH = join(__dirname, "semantic-gate-v3-dev.recorded.json")
export const readRecording = (path: string): GateRecording => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {})

/** Evaluator-only sealed directory (outside the repo). Absent => held-out is simply not evaluated. */
export const SEALED_DIR = process.env.NUTRITION_EVAL_V3_SEALED
export function loadHeldout(): { cases: V3Case[]; raw: string; recording: GateRecording } | null {
  if (!SEALED_DIR) return null
  const raw = readFileSync(join(SEALED_DIR, "heldout-cases.json"), "utf8")
  return { cases: JSON.parse(raw), raw, recording: readRecording(join(SEALED_DIR, "semantic-gate-v3-heldout.recorded.json")) }
}

// ---------------------------------------------------------------- per case
const requiredOf = (c: V3Case) => [...(c.mandatoryDocs ?? []), ...(c.anyOfDocs ?? [])]
/** Requirement units: each mandatory doc is one unit; the anyOf group is one unit satisfied by any member. */
const unitsOf = (c: V3Case): string[][] => [...(c.mandatoryDocs ?? []).map((d) => [d]), ...(c.anyOfDocs?.length ? [c.anyOfDocs] : [])]
const okDocs = (c: V3Case) => new Set([...requiredOf(c), ...(c.acceptableDocs ?? [])])

export type V3Result = {
  id: string
  fired: boolean
  reason: string
  query: NutritionKnowledgeQuery | null
  primary: string[]
  docs: string[]
  totalChunks: number
  contextChars: number
  latencyMs: number
  sectionRank: number | null
  /** Chunks clearing MIN_SCORE, and those also clearing the relative floor (the pool selection picks from). */
  candidates: number
  pool: Array<{ id: string; score: number }>
}

function run(c: V3Case, gate: V3Gate, config: ScoreConfig): V3Result {
  const need = gate(c)
  const base: V3Result = { id: c.id, fired: need.needed, reason: need.reason, query: null, primary: [], docs: [], totalChunks: 0, contextChars: 0, latencyMs: 0, sectionRank: null, candidates: 0, pool: [] }
  if (!need.needed) return base
  const query = buildKnowledgeQuery({ message: c.message, reason: need.reason, intent: c.intent, topic: c.topic, goal: "fat_loss", timezone: "Asia/Singapore", hints: need.hints })
  const { context, trace } = retrieveKnowledge(index, query, need, config)
  const chunks = context?.chunks ?? []
  const primary = chunks.filter((x) => x.sourceType === "primary").map((x) => x.id)
  const rank = c.sections ? primary.findIndex((id) => c.sections!.includes(sectionOf(id))) + 1 : 0
  const scored = scoreAllForEval(index, query, config)
  const floor = (scored[0]?.score ?? 0) * (config.relativeFloor ?? 0)
  const pool = scored.filter((s) => s.score >= floor).map((s) => ({ id: s.item.chunk.id, score: s.score }))
  return { ...base, query, primary, docs: [...new Set(primary.map(docOf))], totalChunks: chunks.length, contextChars: trace.contextCharacters, latencyMs: trace.latencyMs, sectionRank: rank > 0 ? rank : null, candidates: scored.length, pool }
}

// ---------------------------------------------------------------- report
export type V3Report = ReturnType<typeof summarize>

function summarize(cases: V3Case[], results: V3Result[]) {
  const byId = new Map(cases.map((c) => [c.id, c]))
  const C = (r: V3Result) => byId.get(r.id)!
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const r of results) {
    const e = C(r).mustRetrieve
    if (e && r.fired) tp++
    else if (!e && r.fired) fp++
    else if (e) fn++
    else tn++
  }
  const fired = results.filter((r) => r.fired && C(r).mustRetrieve)
  const positives = results.filter((r) => C(r).mustRetrieve)
  const unitHits = (r: V3Result, k: number) => unitsOf(C(r)).filter((u) => u.some((d) => r.docs.slice(0, k).includes(d))).length
  const units = (rs: V3Result[]) => rs.reduce((s, r) => s + unitsOf(C(r)).length, 0)
  const recallAt = (k: number, rs = fired) => ratio(rs.reduce((s, r) => s + unitHits(r, k), 0), units(rs))
  const top3 = (r: V3Result) => r.primary.slice(0, 3)
  const top3Total = fired.reduce((s, r) => s + top3(r).length, 0)
  const withUnacc = fired.filter((r) => C(r).unacceptableDocs?.length)
  const withSec = fired.filter((r) => C(r).sections?.length)
  const secDocsPresent = withSec.filter((r) => C(r).sections!.some((x) => r.docs.includes(docOf(x))))
  const genericAbove = fired.filter((r) => {
    const req = requiredOf(C(r))
    const firstReq = r.docs.findIndex((d) => req.includes(d))
    const firstGeneric = r.docs.findIndex((d) => GENERIC_DOCS.includes(d) && !req.includes(d))
    return firstGeneric >= 0 && (firstReq < 0 || firstGeneric < firstReq)
  })
  const catAgree = fired.filter((r) => C(r).expectedCategory?.includes(r.reason as never)).length
  const withSib = fired.filter((r) => C(r).siblingSections?.length)
  const isSib = (r: V3Result, id: string) => C(r).siblingSections!.includes(sectionOf(id))
  /** A sibling cleared the floor, was not selected, and outscored a selected chunk from another document. */
  const suppressed = (r: V3Result) => {
    if (r.primary.some((id) => isSib(r, id))) return false
    const otherDocScores = r.pool.filter((p) => r.primary.includes(p.id) && !C(r).siblingSections!.some((x) => docOf(x) === docOf(p.id))).map((p) => p.score)
    return r.pool.some((p) => isSib(r, p.id) && otherDocScores.some((o) => p.score > o))
  }
  return {
    cases: cases.length,
    positives: positives.length,
    negatives: cases.length - positives.length,
    gate: { tp, fp, fn, tn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), categoryAgreement: ratio(catAgree, fired.length), misses: positives.filter((r) => !r.fired).map((r) => r.id), falsePositives: results.filter((r) => r.fired && !C(r).mustRetrieve).map((r) => r.id) },
    doc: {
      recallAt1: recallAt(1),
      recallAt3: recallAt(3),
      recallAt4: recallAt(4),
      /** Recall@3 counting gate misses as failures (what a user actually gets). */
      endToEndRecallAt3: recallAt(3, positives),
      mrr: mean(fired.map((r) => { const i = r.docs.findIndex((d) => requiredOf(C(r)).includes(d)); return i < 0 ? 0 : 1 / (i + 1) })),
      wrongDocRate: ratio(fired.reduce((s, r) => s + top3(r).filter((id) => !okDocs(C(r)).has(docOf(id))).length, 0), top3Total),
      distractingDocRate: ratio(withUnacc.reduce((s, r) => s + top3(r).filter((id) => C(r).unacceptableDocs!.includes(docOf(id))).length, 0), withUnacc.reduce((s, r) => s + top3(r).length, 0)),
      distractedCaseRate: ratio(withUnacc.filter((r) => r.docs.some((d) => C(r).unacceptableDocs!.includes(d))).length, withUnacc.length),
      genericAboveSpecificRate: ratio(genericAbove.length, fired.length),
    },
    section: {
      cases: withSec.length,
      top1: ratio(withSec.filter((r) => r.sectionRank === 1).length, withSec.length),
      top3: ratio(withSec.filter((r) => r.sectionRank !== null && r.sectionRank <= 3).length, withSec.length),
      /** Of section cases whose target document was retrieved, the share where that document's best-ranked chunk is not a target section. */
      wrongSectionRate: ratio(secDocsPresent.filter((r) => { const first = r.primary.find((id) => C(r).sections!.some((x) => docOf(x) === docOf(id))); return !first || !C(r).sections!.includes(sectionOf(first)) }).length, secDocsPresent.length),
      /** Cases with labelled siblings: gold section AND at least one sibling both among the primary chunks. */
      siblingCases: withSib.length,
      siblingSurvival: ratio(withSib.filter((r) => r.sectionRank !== null && r.primary.some((id) => isSib(r, id))).length, withSib.length),
      siblingSuppressedBySelection: ratio(withSib.filter(suppressed).length, withSib.length),
    },
    ops: {
      avgCandidates: mean(fired.map((r) => r.candidates)),
      avgPoolAfterFloor: mean(fired.map((r) => r.pool.length)),
      zeroResultRate: ratio(fired.filter((r) => r.primary.length === 0).length, fired.length),
      avgPrimaryChunks: mean(fired.map((r) => r.primary.length)),
      avgTotalChunks: mean(fired.map((r) => r.totalChunks)),
      contextAvgChars: mean(fired.map((r) => r.contextChars)),
      contextMaxChars: Math.max(0, ...fired.map((r) => r.contextChars)),
      latencyAvgMs: mean(fired.map((r) => r.latencyMs)),
      latencyP95Ms: p95(fired.map((r) => r.latencyMs)),
    },
  }
}

export function evaluateV3(cases: V3Case[], gate: V3Gate, config: ScoreConfig = ACTIVE_CONFIG) {
  const results = cases.map((c) => run(c, gate, config))
  return { report: summarize(cases, results), results }
}

export const HYPOTHESES: V3Hypothesis[] = ["A_DIVERSITY_KEEP", "A_DIVERSITY_HELP", "B_METADATA_BROADCAST", "C_LEXICAL_EVIDENCE", "D_CANONICALISATION"]

/** Same metrics restricted to the probes tagged with each hypothesis. */
export function hypothesisReports(cases: V3Case[], results: V3Result[]) {
  return Object.fromEntries(
    HYPOTHESES.map((h) => {
      const sub = cases.filter((c) => c.hypotheses?.includes(h))
      const ids = new Set(sub.map((c) => c.id))
      return [h, summarize(sub, results.filter((r) => ids.has(r.id)))]
    }),
  ) as Record<V3Hypothesis, V3Report>
}

// ---------------------------------------------------------------- failure classes (diagnostic only; never feed back into the runtime)
export const FAILURE_CLASSES_V3 = ["CATEGORY_CONFUSION", "FOOD_TYPE_CONFUSION", "SENSORY_CONFUSION", "GENERIC_DOC_DOMINANCE", "TITLE_HEADING_COLLISION", "METADATA_BROADCAST", "LEXICAL_OVERLAP", "CUISINE_CONFUSION", "GOAL_CONFUSION", "COMPANION_POLLUTION", "QUERY_UNDERSPECIFICATION", "OTHER"] as const
export type FailureClassV3 = (typeof FAILURE_CLASSES_V3)[number]
const SIGNAL_CLASS: Record<string, FailureClassV3> = { lexicalBody: "LEXICAL_OVERLAP", localMatch: "LEXICAL_OVERLAP", headingMatch: "TITLE_HEADING_COLLISION", titleMatch: "TITLE_HEADING_COLLISION", category: "CATEGORY_CONFUSION", foodType: "FOOD_TYPE_CONFUSION", sensory: "SENSORY_CONFUSION", cuisine: "CUISINE_CONFUSION", goal: "GOAL_CONFUSION", locale: "OTHER", authority: "OTHER" }
const COMPANION_RE = /::(?:do-not-claim|coach-decision-rules|common-failure-modes|suggested-tool-calls)(?:-\d+)?$/

/** Score with the chunk's own heading + body only (no broadcast document header / metadata terms). */
function bodyOnlyScore(s: ScoredChunk, query: NutritionKnowledgeQuery, config: ScoreConfig): number {
  const item = { ...s.item, normalizedTerms: normalizeTerms(`${s.item.chunk.heading}\n\n${s.item.chunk.content}`) }
  return scoreChunk(item, query, index.stats, queryTermsOf(query), { ...config, minScore: 0 })?.score ?? 0
}

const weighted = (s: ScoredChunk, config: ScoreConfig, minus?: ScoredChunk) =>
  Object.entries(config.weights)
    .map(([k, w]) => [k, w * ((s.signals as Record<string, number>)[k] - (minus ? (minus.signals as Record<string, number>)[k] : 0))] as const)
    .sort((a, b) => b[1] - a[1])[0]

/**
 * Precedence: companion > generic doc > no correct candidate scored > cuisine > metadata broadcast > largest weighted signal.
 * `right` = the best correct chunk the wrong one outranked (undefined when none scored at all). When the wrong chunk displaced
 * nothing (tail filler with no correct alternative), it is labelled by its own largest weighted signal.
 */
function classify(wrong: ScoredChunk, right: ScoredChunk | undefined, anyCorrectScored: boolean, query: NutritionKnowledgeQuery, config: ScoreConfig): { cls: FailureClassV3; signal?: string } {
  const id = wrong.item.chunk.id
  const otherDoc = !right || docOf(right.item.chunk.id) !== docOf(id)
  if (COMPANION_RE.test(id)) return { cls: "COMPANION_POLLUTION" }
  if (otherDoc && (GENERIC_DOCS.includes(docOf(id)) || docOf(id).startsWith("core."))) return { cls: "GENERIC_DOC_DOMINANCE" }
  if (!anyCorrectScored) return { cls: "QUERY_UNDERSPECIFICATION" }
  if (otherDoc && docOf(id).startsWith("cuisine.")) return { cls: "CUISINE_CONFUSION" }
  if (right && wrong.score >= right.score && bodyOnlyScore(right, query, config) > bodyOnlyScore(wrong, query, config)) return { cls: "METADATA_BROADCAST" }
  const [k, v] = weighted(wrong, config, right && wrong.score >= right.score ? right : undefined)
  return v > 0 ? { cls: SIGNAL_CLASS[k], signal: k } : { cls: "OTHER" }
}

export type FailureEvent = { id: string; kind: "missing" | "wrong" | "distractor" | "section"; cls: FailureClassV3; signal?: string; chunk?: string }

/** One event per failure: wrong/distractor chunk in top 3, unmet requirement unit at @3, section target not in top 3. */
export function classifyFailures(cases: V3Case[], results: V3Result[], config: ScoreConfig = ACTIVE_CONFIG): FailureEvent[] {
  const out: FailureEvent[] = []
  for (const r of results) {
    const c = cases.find((x) => x.id === r.id)!
    if (!c.mustRetrieve || !r.fired || !r.query) continue
    const scored = scoreAllForEval(index, r.query, config)
    const byId = new Map(scored.map((s) => [s.item.chunk.id, s]))
    const req = requiredOf(c)
    const ok = okDocs(c)
    const top3 = r.primary.slice(0, 3)
    /** Best chunk satisfying `isRight` that is not already shown in the top 3 (the one a wrong chunk displaced). */
    const bestUnshown = (isRight: (id: string) => boolean) => scored.find((s) => isRight(s.item.chunk.id) && !top3.includes(s.item.chunk.id))
    const anyReq = scored.some((s) => req.includes(docOf(s.item.chunk.id)))
    for (const id of top3) {
      const kind = c.unacceptableDocs?.includes(docOf(id)) ? "distractor" : !ok.has(docOf(id)) ? "wrong" : null
      if (kind) out.push({ id: c.id, kind, chunk: sectionOf(id), ...classify(byId.get(id)!, bestUnshown((x) => req.includes(docOf(x))), anyReq, r.query, config) })
    }
    for (const u of unitsOf(c)) {
      if (u.some((d) => r.docs.slice(0, 3).includes(d))) continue
      const right = bestUnshown((x) => u.includes(docOf(x)))
      const displacer = [...top3].reverse().map((id) => byId.get(id)!).find((s) => !req.includes(docOf(s.item.chunk.id)))
      out.push({ id: c.id, kind: "missing", chunk: u.join("|"), ...(displacer ? classify(displacer, right, !!right, r.query, config) : { cls: "QUERY_UNDERSPECIFICATION" as const }) })
    }
    if (c.sections?.length && (r.sectionRank === null || r.sectionRank > 3)) {
      const isTarget = (x: string) => c.sections!.includes(sectionOf(x))
      const right = bestUnshown(isTarget)
      const sameDoc = top3.find((id) => !isTarget(id) && c.sections!.some((x) => docOf(x) === docOf(id)))
      const displacer = byId.get(sameDoc ?? top3[top3.length - 1] ?? "")
      out.push({ id: c.id, kind: "section", chunk: displacer ? sectionOf(displacer.item.chunk.id) : undefined, ...(displacer ? classify(displacer, right, !!right, r.query, config) : { cls: "QUERY_UNDERSPECIFICATION" as const }) })
    }
  }
  return out
}

export const tally = (events: FailureEvent[]) =>
  Object.fromEntries(Object.entries(events.reduce<Record<string, number>>((m, e) => ((m[e.cls] = (m[e.cls] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]))

export const f3 = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3)
