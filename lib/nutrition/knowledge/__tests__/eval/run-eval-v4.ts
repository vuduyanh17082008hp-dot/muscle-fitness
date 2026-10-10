import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"

import { decideNutritionKnowledgeNeed } from "../../need"
import { buildKnowledgeQuery } from "../../query"
import { retrieveKnowledge, scoreAllForEval } from "../../retrieve"
import { ACTIVE_CONFIG, type ScoreConfig } from "../../score"
import { buildSemanticGatePrompt, parseSemanticGate, resolveUncertainNeed, semanticOutputToDecision } from "../../semantic-gate"
import type { KnowledgeNeedDecision, NutritionKnowledgeQuery } from "../../types"
import { docOf, f3, index } from "./run-eval-v3"
import { GENERIC_DOCS, type V4Case, type V4Concept, type V4Difficulty, type V4Domain, type V4FailureClass, type V4Language } from "./cases-v4-types"

/**
 * nutrition-retrieval-eval-v4 runner (test-only, read-only against the runtime). Mirrors the open-ended chat path in
 * lib/nutrition/coach/chat.ts: gate(message) -> buildKnowledgeQuery(message, reason, topic, goal, Asia/Singapore, hints)
 * -> retrieveKnowledge(config). No N1.5 intent is passed (v4 cases are free text); the goal is the case's athleteGoal.
 * Split-agnostic: it evaluates whatever cases and recording it is given.
 */
export { docOf, index }
const sectionOf = (id: string) => id.replace("nutrition.", "")
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] : 0
}
const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d)
export const promptHashV4 = (m: string) => createHash("sha1").update(buildSemanticGatePrompt(m)).digest("hex").slice(0, 12)

/** Public R3 targets (layered gate). Coverage@4 is tracked without a threshold. */
export const V4_TARGETS = { gatePrecision: 0.95, gateRecall: 0.9, recallAt3: 0.95, wrongDocRateMax: 0.1, sectionTop3: 0.9 } as const

// ---------------------------------------------------------------- gates
export type V4Gate = (c: V4Case) => KnowledgeNeedDecision
export type GateRecording = Record<string, { promptHash: string; reply: string | null }>
export const layer1GateV4: V4Gate = (c) => decideNutritionKnowledgeNeed({ message: c.message })

/** Layer 1 + replay of recorded Layer-2 replies. A reply recorded against a different prompt is ignored (falls back to Layer 1). */
export function layeredGateV4(recording: GateRecording): V4Gate & { unrecorded: Set<string> } {
  const unrecorded = new Set<string>()
  const gate = (c: V4Case) => {
    const l1 = layer1GateV4(c)
    if (!l1.uncertain) return l1
    const rec = recording[c.message]
    if (!rec || rec.promptHash !== promptHashV4(c.message)) {
      unrecorded.add(c.id)
      return l1
    }
    const out = parseSemanticGate(rec.reply)
    return out ? semanticOutputToDecision(out) : l1
  }
  return Object.assign(gate, { unrecorded })
}

/** Retrieval-isolation gate (eval only): positives fire with their first labelled reason and no hints; negatives use Layer 1. */
export const oracleGateV4: V4Gate = (c) =>
  c.expectedKnowledgeNeed ? { needed: true, reason: c.expectedReasons![0], confidence: "HIGH", rationale: "oracle (eval only)" } : layer1GateV4(c)

export const DEV_RECORDING_PATH_V4 = join(__dirname, "semantic-gate-v4-dev.recorded.json")
export const readRecordingV4 = (path: string): GateRecording => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {})

/**
 * LIVE: records the real Layer-2 classifier reply for every case Layer 1 marks uncertain (skips current recordings).
 * Classifier calls only — never the answer-quality batch. Returns the number of model calls made.
 */
export async function recordLayer2V4(cases: V4Case[], path: string): Promise<number> {
  if (!process.env.OPENAI_API_KEY) {
    const key = readFileSync(".env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "")
    if (key) process.env.OPENAI_API_KEY = key
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing")
  const store: Record<string, { promptHash: string; reply: string | null; ms: number }> = readRecordingV4(path) as never
  let calls = 0
  for (const c of cases) {
    const l1 = layer1GateV4(c)
    if (!l1.uncertain || store[c.message]?.promptHash === promptHashV4(c.message)) continue
    const started = performance.now()
    let reply: string | null = null
    await resolveUncertainNeed(c.message, l1, {
      log: () => {},
      call: async (prompt) => {
        calls++
        const r = await callOpenAiWithFallback(prompt)
        reply = r?.reply ?? null
        return r
      },
    })
    store[c.message] = { promptHash: promptHashV4(c.message), reply, ms: Math.round(performance.now() - started) }
  }
  writeFileSync(path, JSON.stringify(store, null, 1))
  return calls
}

// ---------------------------------------------------------------- per case
const requiredOf = (c: V4Case) => [...(c.expectedDocumentIds ?? []), ...(c.anyOfDocumentIds ?? [])]
/** Requirement units: each expected doc is one unit; the anyOf group is one unit satisfied by any member. */
export const unitsOf = (c: V4Case): string[][] => [...(c.expectedDocumentIds ?? []).map((d) => [d]), ...(c.anyOfDocumentIds?.length ? [c.anyOfDocumentIds] : [])]
const okDocs = (c: V4Case) => new Set([...requiredOf(c), ...(c.acceptableDocumentIds ?? [])])
const hitSections = (c: V4Case) => [...(c.expectedSectionIds ?? []), ...(c.acceptableSectionIds ?? [])]

/** Observable facets of the built query, in V4Concept form. */
export const conceptsOf = (q: NutritionKnowledgeQuery): Set<V4Concept> =>
  new Set<V4Concept>([
    ...(q.sensoryTargets ?? []).map((x) => `sensory:${x}` as const),
    ...(q.cuisines ?? []).map((x) => `cuisine:${x}` as const),
    ...(q.foodTypes ?? []).map((x) => `food:${x}` as const),
    ...(q.goal ? [`goal:${q.goal}` as const] : []),
  ])

export type V4Result = {
  id: string
  fired: boolean
  reason: string
  hinted: boolean
  query: NutritionKnowledgeQuery | null
  primary: string[]
  docs: string[]
  totalChunks: number
  contextChars: number
  latencyMs: number
  sectionRank: number | null
  candidates: number
  pool: Array<{ id: string; score: number }>
  /** Same reason, Layer-2 hints dropped (only when the decision carried hints). */
  noHints?: { docs: string[]; sectionRank: number | null }
}

function retrieve(c: V4Case, need: KnowledgeNeedDecision, config: ScoreConfig) {
  const query = buildKnowledgeQuery({ message: c.message, reason: need.reason, topic: c.topic, goal: c.athleteGoal, timezone: "Asia/Singapore", hints: need.hints })
  const { context, trace } = retrieveKnowledge(index, query, need, config)
  const chunks = context?.chunks ?? []
  const primary = chunks.filter((x) => x.sourceType === "primary").map((x) => x.id)
  const hits = hitSections(c)
  const rank = hits.length ? primary.findIndex((id) => hits.includes(sectionOf(id))) + 1 : 0
  return { query, primary, docs: [...new Set(primary.map(docOf))], chunks, trace, sectionRank: rank > 0 ? rank : null }
}

function run(c: V4Case, gate: V4Gate, config: ScoreConfig): V4Result {
  const need = gate(c)
  const hinted = !!(need.hints && (need.hints.sensory?.length || need.hints.cuisines?.length || need.hints.foods?.length))
  const base: V4Result = { id: c.id, fired: need.needed, reason: need.reason, hinted, query: null, primary: [], docs: [], totalChunks: 0, contextChars: 0, latencyMs: 0, sectionRank: null, candidates: 0, pool: [] }
  if (!need.needed) return base
  const r = retrieve(c, need, config)
  const scored = scoreAllForEval(index, r.query, config)
  const floor = (scored[0]?.score ?? 0) * (config.relativeFloor ?? 0)
  const pool = scored.filter((s) => s.score >= floor).map((s) => ({ id: s.item.chunk.id, score: s.score }))
  const noHints = hinted ? (({ docs, sectionRank }) => ({ docs, sectionRank }))(retrieve(c, { ...need, hints: undefined }, config)) : undefined
  return { ...base, query: r.query, primary: r.primary, docs: r.docs, totalChunks: r.chunks.length, contextChars: r.trace.contextCharacters, latencyMs: r.trace.latencyMs, sectionRank: r.sectionRank, candidates: scored.length, pool, ...(noHints ? { noHints } : {}) }
}

// ---------------------------------------------------------------- report
export type GateMissClass = "follow-up" | "language" | "polysemy" | "semantic"
export const gateMissClass = (c: V4Case): GateMissClass =>
  c.topic ? "follow-up" : c.language !== "en" ? "language" : c.failureClass.includes("POLYSEMY") ? "polysemy" : "semantic"

const count = <T extends string>(xs: T[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})

export type V4Report = ReturnType<typeof summarizeV4>

export function summarizeV4(cases: V4Case[], results: V4Result[]) {
  const byId = new Map(cases.map((c) => [c.id, c]))
  const C = (r: V4Result) => byId.get(r.id)!
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const r of results) {
    const e = C(r).expectedKnowledgeNeed
    if (e && r.fired) tp++
    else if (!e && r.fired) fp++
    else if (e) fn++
    else tn++
  }
  const positives = results.filter((r) => C(r).expectedKnowledgeNeed)
  const fired = positives.filter((r) => r.fired)
  const unitHits = (r: V4Result, k: number, docs = r.docs) => unitsOf(C(r)).filter((u) => u.some((d) => docs.slice(0, k).includes(d))).length
  const units = (rs: V4Result[]) => rs.reduce((s, r) => s + unitsOf(C(r)).length, 0)
  const recallAt = (k: number, rs = fired) => ratio(rs.reduce((s, r) => s + unitHits(r, k), 0), units(rs))
  const top3 = (r: V4Result) => r.primary.slice(0, 3)
  const top3Total = fired.reduce((s, r) => s + top3(r).length, 0)
  const withUnacc = fired.filter((r) => C(r).unacceptableDocumentIds?.length)
  const withSec = fired.filter((r) => C(r).sectionEvaluation)
  const secPositives = positives.filter((r) => C(r).sectionEvaluation)
  const secDocsPresent = withSec.filter((r) => hitSections(C(r)).some((x) => r.docs.includes(docOf(x))))
  const genericAbove = fired.filter((r) => {
    const req = requiredOf(C(r))
    const firstReq = r.docs.findIndex((d) => req.includes(d))
    const firstGeneric = r.docs.findIndex((d) => GENERIC_DOCS.includes(d) && !req.includes(d))
    return firstGeneric >= 0 && (firstReq < 0 || firstGeneric < firstReq)
  })
  const multi = (rs: V4Result[]) => rs.filter((r) => C(r).multiDocument)
  const coverage = (r: V4Result) => (r.fired ? unitHits(r, 4) / unitsOf(C(r)).length : 0)
  const sibSensitive = withSec.filter((r) => C(r).siblingSensitive)
  const withSib = fired.filter((r) => C(r).alsoUsefulSectionIds?.length)
  const isSib = (r: V4Result, id: string) => C(r).alsoUsefulSectionIds!.includes(sectionOf(id))
  /** A useful sibling cleared the floor, was not selected, and outscored a selected chunk from another document. */
  const suppressed = (r: V4Result) => {
    if (r.primary.some((id) => isSib(r, id))) return false
    const otherDocScores = r.pool.filter((p) => r.primary.includes(p.id) && !C(r).alsoUsefulSectionIds!.some((x) => docOf(x) === docOf(p.id))).map((p) => p.score)
    return r.pool.some((p) => isSib(r, p.id) && otherDocScores.some((o) => p.score > o))
  }
  // query understanding (observable outputs only)
  const withReq = fired.filter((r) => C(r).requiredConcepts?.length)
  const conceptHit = (r: V4Result) => C(r).requiredConcepts!.every((x) => conceptsOf(r.query!).has(x))
  const withForbid = fired.filter((r) => C(r).forbiddenConcepts?.length)
  const forbidClean = (r: V4Result) => !C(r).forbiddenConcepts!.some((x) => conceptsOf(r.query!).has(x))
  const nonEn = withReq.filter((r) => C(r).language !== "en")
  const hinted = fired.filter((r) => r.noHints)
  const hintedSec = hinted.filter((r) => C(r).sectionEvaluation)
  const r3 = (r: V4Result, docs: string[]) => unitHits(r, 3, docs) / Math.max(1, unitsOf(C(r)).length)
  const t3 = (rank: number | null) => (rank !== null && rank <= 3 ? 1 : 0)
  return {
    cases: cases.length,
    positives: positives.length,
    negatives: cases.length - positives.length,
    gate: {
      tp, fp, fn, tn,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      misses: positives.filter((r) => !r.fired).map((r) => r.id),
      missClasses: count(positives.filter((r) => !r.fired).map((r) => gateMissClass(C(r)))),
      falsePositives: results.filter((r) => r.fired && !C(r).expectedKnowledgeNeed).map((r) => r.id),
      nearMissFalsePositives: results.filter((r) => r.fired && !C(r).expectedKnowledgeNeed && C(r).failureClass.includes("NEGATIVE_NEAR_MISS")).length,
    },
    doc: {
      recallAt1: recallAt(1),
      recallAt3: recallAt(3),
      recallAt4: recallAt(4),
      endToEndRecallAt3: recallAt(3, positives),
      mrr: mean(fired.map((r) => { const i = r.docs.findIndex((d) => requiredOf(C(r)).includes(d)); return i < 0 ? 0 : 1 / (i + 1) })),
      wrongDocRate: ratio(fired.reduce((s, r) => s + top3(r).filter((id) => !okDocs(C(r)).has(docOf(id))).length, 0), top3Total),
      distractedCaseRate: ratio(withUnacc.filter((r) => r.docs.some((d) => C(r).unacceptableDocumentIds!.includes(d))).length, withUnacc.length),
      genericAboveSpecificRate: ratio(genericAbove.length, fired.length),
      /** Multi-document cases: mean share of requirement units in the top-4 chunks (fired), its full-coverage rate, and end-to-end (misses = 0). */
      multiDocCases: multi(positives).length,
      coverageAt4: mean(multi(fired).map(coverage)),
      fullCoverageAt4: ratio(multi(fired).filter((r) => coverage(r) === 1).length, multi(fired).length),
      endToEndCoverageAt4: mean(multi(positives).map(coverage)),
    },
    section: {
      cases: withSec.length,
      top1: ratio(withSec.filter((r) => r.sectionRank === 1).length, withSec.length),
      top3: ratio(withSec.filter((r) => t3(r.sectionRank)).length, withSec.length),
      endToEndTop3: ratio(secPositives.filter((r) => r.fired && t3(r.sectionRank)).length, secPositives.length),
      /** Of section cases whose target document was retrieved, the share where that document's best-ranked chunk is not a hit section. */
      wrongSectionRate: ratio(secDocsPresent.filter((r) => { const first = r.primary.find((id) => hitSections(C(r)).some((x) => docOf(x) === docOf(id))); return !first || !hitSections(C(r)).includes(sectionOf(first)) }).length, secDocsPresent.length),
      /** Target section must beat its same-document siblings. */
      siblingSensitiveCases: sibSensitive.length,
      siblingSensitiveTop1: ratio(sibSensitive.filter((r) => r.sectionRank === 1).length, sibSensitive.length),
      siblingSensitiveTop3: ratio(sibSensitive.filter((r) => t3(r.sectionRank)).length, sibSensitive.length),
      /** Cases labelling an also-useful sibling: target hit AND the sibling selected; sibling outscored a selected other-doc chunk yet was dropped. */
      alsoUsefulCases: withSib.length,
      siblingSurvival: ratio(withSib.filter((r) => r.sectionRank !== null && r.primary.some((id) => isSib(r, id))).length, withSib.length),
      siblingSuppressedBySelection: ratio(withSib.filter(suppressed).length, withSib.length),
    },
    understanding: {
      /** Fired positives whose gate reason is one of the labelled correct readings / the primary one. */
      intentAccuracy: ratio(fired.filter((r) => C(r).expectedReasons!.includes(r.reason as never)).length, fired.length),
      intentPrimaryAccuracy: ratio(fired.filter((r) => C(r).expectedReasons![0] === r.reason).length, fired.length),
      conceptCases: withReq.length,
      conceptCoverage: ratio(withReq.filter(conceptHit).length, withReq.length),
      /** vi / mixed cases with labelled concepts: all concepts recovered in the query. */
      languageNormalizationCases: nonEn.length,
      languageNormalization: ratio(nonEn.filter(conceptHit).length, nonEn.length),
      /** No forbidden reading (e.g. hot weather -> spicy) leaked into the query. */
      polysemyCases: withForbid.length,
      polysemyResolution: ratio(withForbid.filter(forbidClean).length, withForbid.length),
      /** Fired cases whose Layer-2 decision carried facets: doc R@3 / section T3 with vs without those hints. */
      hintedCases: hinted.length,
      hintRecallAt3: mean(hinted.map((r) => r3(r, r.docs))),
      hintRecallAt3WithoutHints: mean(hinted.map((r) => r3(r, r.noHints!.docs))),
      hintSectionTop3: mean(hintedSec.map((r) => t3(r.sectionRank))),
      hintSectionTop3WithoutHints: mean(hintedSec.map((r) => t3(r.noHints!.sectionRank))),
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

export const lineV4 = (name: string, r: V4Report) =>
  `${name.padEnd(30)} n=${r.cases} pos=${r.positives} neg=${r.negatives} | gate P=${f3(r.gate.precision)} R=${f3(r.gate.recall)} (fp ${r.gate.fp}, fn ${r.gate.fn})` +
  ` | R@1=${f3(r.doc.recallAt1)} R@3=${f3(r.doc.recallAt3)} R@4=${f3(r.doc.recallAt4)} e2eR@3=${f3(r.doc.endToEndRecallAt3)} MRR=${f3(r.doc.mrr)} wrong=${f3(r.doc.wrongDocRate)} cov@4=${f3(r.doc.coverageAt4)}(n=${r.doc.multiDocCases})` +
  ` | sec n=${r.section.cases} T1=${f3(r.section.top1)} T3=${f3(r.section.top3)} e2eT3=${f3(r.section.endToEndTop3)} wrongSec=${f3(r.section.wrongSectionRate)}` +
  ` | zero=${f3(r.ops.zeroResultRate)}`

export function evaluateV4(cases: V4Case[], gate: V4Gate, config: ScoreConfig = ACTIVE_CONFIG) {
  const results = cases.map((c) => run(c, gate, config))
  return { report: summarizeV4(cases, results), results }
}

export const FAILURE_CLASSES_V4: V4FailureClass[] = ["INDIRECT_INTENT", "LOW_OVERLAP", "VIETNAMESE", "MIXED_LANGUAGE", "GOAL_STRATEGY", "POLYSEMY", "CUISINE_CONTEXT", "CRAVING_SENSORY", "MULTI_DOCUMENT", "SIBLING_SECTION", "FOLLOW_UP", "NEGATIVE_NEAR_MISS"]
export const DOMAINS_V4: V4Domain[] = ["texture", "flavor", "craving", "makeover", "cuisine", "goal_strategy", "principles", "coaching", "negative"]
export const LANGUAGES_V4: V4Language[] = ["en", "vi", "mixed"]
export const DIFFICULTIES_V4: V4Difficulty[] = ["easy", "medium", "hard"]

// ---------------------------------------------------------------- dataset checks (split-agnostic)
const chunkIds = new Set(index.items.map((i) => sectionOf(i.chunk.id)))
const docIds = new Set([...chunkIds].map(docOf))
const UNRANKABLE = /::(?:do-not-claim|coach-decision-rules|common-failure-modes|suggested-tool-calls)$/
/** Letters only Vietnamese uses (French-shared accents such as é / è / ê excluded: "café" is English). */
const VI_CHARS = /[ảãạăằắẳẵặầấẩẫậđẻẽẹềếểễệỉĩịỏõọồốổỗộơờớởỡợủũụưừứửữựỳỷỹỵ]/i

/** Every problem with the labels, as readable strings (empty = valid). */
export function integrityErrorsV4(cases: V4Case[], split: "dev" | "heldout"): string[] {
  const err: string[] = []
  const bad = (c: V4Case, m: string) => err.push(`${c.id}: ${m}`)
  const ids = cases.map((c) => c.id)
  if (new Set(ids).size !== ids.length) err.push("duplicate ids")
  for (const c of cases) {
    if (c.split !== split || !c.id.startsWith(split === "dev" ? "d4-" : "h4-")) bad(c, "wrong split/prefix")
    if (VI_CHARS.test(c.message) && c.language === "en") bad(c, "Vietnamese text labelled en")
    if (c.multiDocument !== unitsOf(c).length >= 2) bad(c, "multiDocument flag disagrees with requirement units")
    if (c.failureClass.includes("MULTI_DOCUMENT") !== c.multiDocument) bad(c, "MULTI_DOCUMENT class disagrees with flag")
    const req = requiredOf(c)
    const ok = [...okDocs(c)]
    const secs = [...(c.expectedSectionIds ?? []), ...(c.acceptableSectionIds ?? []), ...(c.alsoUsefulSectionIds ?? [])]
    if (!c.expectedKnowledgeNeed) {
      if (req.length || secs.length || c.expectedReasons || c.requiredConcepts || c.forbiddenConcepts || c.unacceptableDocumentIds || c.acceptableDocumentIds) bad(c, "negative carries labels")
      continue
    }
    if (!req.length) bad(c, "positive needs a required doc")
    if (!c.expectedReasons?.length || c.expectedReasons.includes("NOT_NEEDED")) bad(c, "positive needs expected reasons")
    for (const d of [...ok, ...(c.unacceptableDocumentIds ?? [])]) if (!docIds.has(d)) bad(c, `unknown doc ${d}`)
    for (const d of c.unacceptableDocumentIds ?? []) if (ok.includes(d)) bad(c, `${d} both ok and unacceptable`)
    if (c.sectionEvaluation !== !!c.expectedSectionIds?.length) bad(c, "sectionEvaluation disagrees with expectedSectionIds")
    if (!c.sectionEvaluation && secs.length) bad(c, "document-only case carries section labels")
    if (c.siblingSensitive && !c.sectionEvaluation) bad(c, "sibling-sensitive case needs a target section")
    if (new Set(secs).size !== secs.length) bad(c, "a section is in more than one of expected/acceptable/alsoUseful")
    for (const x of secs) {
      if (!chunkIds.has(x)) bad(c, `unknown section ${x}`)
      if (UNRANKABLE.test(x)) bad(c, `unrankable section ${x}`)
      if (!ok.includes(docOf(x))) bad(c, `section ${x} not in a required/acceptable doc`)
    }
    for (const x of c.expectedSectionIds ?? []) if (!req.includes(docOf(x))) bad(c, `target section ${x} not in a required doc`)
    for (const x of c.requiredConcepts ?? []) if (c.forbiddenConcepts?.includes(x)) bad(c, `concept ${x} both required and forbidden`)
  }
  return err
}

const pct = (n: number, d: number) => (d ? n / d : 0)

export function distributionV4(cases: V4Case[]) {
  const pos = cases.filter((c) => c.expectedKnowledgeNeed)
  const groups = count(cases.filter((c) => c.contrastGroup).map((c) => c.contrastGroup!))
  return {
    total: cases.length,
    positives: pos.length,
    negatives: cases.length - pos.length,
    negativeShare: pct(cases.length - pos.length, cases.length),
    nearMissNegatives: cases.filter((c) => c.failureClass.includes("NEGATIVE_NEAR_MISS")).length,
    language: Object.fromEntries(LANGUAGES_V4.map((l) => [l, pct(cases.filter((c) => c.language === l).length, cases.length)])),
    difficulty: Object.fromEntries(DIFFICULTIES_V4.map((d) => [d, pct(cases.filter((c) => c.difficulty === d).length, cases.length)])),
    domain: count(cases.map((c) => c.domain)),
    failureClass: Object.fromEntries(FAILURE_CLASSES_V4.map((f) => [f, cases.filter((c) => c.failureClass.includes(f)).length])),
    sectionEvaluableShare: pct(pos.filter((c) => c.sectionEvaluation).length, pos.length),
    multiDocument: pos.filter((c) => c.multiDocument).length,
    siblingSensitive: pos.filter((c) => c.siblingSensitive).length,
    withAlsoUseful: pos.filter((c) => c.alsoUsefulSectionIds?.length).length,
    withRequiredConcepts: pos.filter((c) => c.requiredConcepts?.length).length,
    withForbiddenConcepts: pos.filter((c) => c.forbiddenConcepts?.length).length,
    followUps: cases.filter((c) => c.topic).length,
    contrastGroups: Object.keys(groups).length,
    contrastGroupSizes: groups,
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFC")
const titles = new Map(index.items.map((i) => [docOf(i.chunk.id), norm(String((i.chunk.metadata as { title?: string }).title ?? ""))]))
const headings = new Map(index.items.map((i) => [sectionOf(i.chunk.id), norm(i.chunk.heading)]))

/** Keyword giveaways: a positive whose message quotes a required document's title or a target section's heading verbatim. */
export function leakageV4(cases: V4Case[]) {
  const pos = cases.filter((c) => c.expectedKnowledgeNeed)
  const titleHits = pos.filter((c) => requiredOf(c).some((d) => titles.get(d) && norm(c.message).includes(titles.get(d)!))).map((c) => c.id)
  const headingHits = pos.filter((c) => (c.expectedSectionIds ?? []).some((x) => (headings.get(x)?.length ?? 0) > 3 && norm(c.message).includes(headings.get(x)!))).map((c) => c.id)
  return { titleHits, headingHits }
}

// ---------------------------------------------------------------- adversarial simulations (benchmark-strength diagnostics only)
const docTokens = new Map<string, Set<string>>()
for (const i of index.items) {
  const d = docOf(i.chunk.id)
  const set = docTokens.get(d) ?? new Set<string>()
  for (const t of norm(`${titles.get(d) ?? ""} ${i.chunk.heading} ${d.replace(/[._]/g, " ")}`).split(/[^\p{L}\p{N}]+/u)) if (t.length > 2) set.add(t)
  docTokens.set(d, set)
}

/** "Title matcher": rank documents purely by message-token overlap with title + headings + id. Doc R@3 over positives. */
export function titleMatchAttackV4(cases: V4Case[]) {
  const pos = cases.filter((c) => c.expectedKnowledgeNeed)
  const hits = pos.map((c) => {
    const t = tokensV4(c.message)
    const ranked = [...docTokens].map(([d, s]) => [d, [...t].filter((x) => s.has(x)).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([d]) => d)
    return unitsOf(c).filter((u) => u.some((d) => ranked.slice(0, 3).includes(d))).length / unitsOf(c).length
  })
  return { cases: pos.length, recallAt3: mean(hits) }
}

/**
 * "Alias table fitted on DEV": every token of a DEV message that carries requiredConcepts is aliased to those concepts.
 * maxDf = Infinity is a deliberately over-generous upper bound; a small maxDf (rare tokens only) is a realistic alias table.
 * Share of `target` concept cases whose concepts it would recover.
 */
export function aliasAttackV4(dev: V4Case[], target: V4Case[], maxDf = Infinity) {
  const df = new Map<string, number>()
  for (const c of dev) for (const t of tokensV4(c.message)) df.set(t, (df.get(t) ?? 0) + 1)
  const table = new Map<string, Set<V4Concept>>()
  for (const c of dev) for (const t of tokensV4(c.message)) if (df.get(t)! <= maxDf) for (const k of c.requiredConcepts ?? []) table.set(t, (table.get(t) ?? new Set()).add(k))
  const withReq = target.filter((c) => c.requiredConcepts?.length)
  const covered = withReq.filter((c) => {
    const got = new Set([...tokensV4(c.message)].flatMap((t) => [...(table.get(t) ?? [])]))
    return c.requiredConcepts!.every((k) => got.has(k))
  })
  const nonEn = withReq.filter((c) => c.language !== "en")
  return { cases: withReq.length, covered: ratio(covered.length, withReq.length), nonEnCases: nonEn.length, nonEnCovered: ratio(covered.filter((c) => c.language !== "en").length, nonEn.length) }
}

/** Share of `target` message tokens (length > 2) never seen in any `dev` message, overall and for vi / mixed rows. */
export function vocabularyNoveltyV4(dev: V4Case[], target: V4Case[]) {
  const seen = new Set(dev.flatMap((c) => [...tokensV4(c.message)]))
  const novel = (cs: V4Case[]) => {
    const toks = cs.flatMap((c) => [...tokensV4(c.message)].filter((t) => t.length > 2))
    return ratio(toks.filter((t) => !seen.has(t)).length, toks.length)
  }
  return { all: novel(target), nonEn: novel(target.filter((c) => c.language !== "en")) }
}

export const tokensV4 = (s: string) => new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1))
export const jaccardV4 = (a: Set<string>, b: Set<string>) => {
  const i = [...a].filter((x) => b.has(x)).length
  return i / (a.size + b.size - i || 1)
}

/** Same metrics restricted to each slice (by failure class, domain, language, difficulty). */
export function subsetReportsV4(cases: V4Case[], results: V4Result[]) {
  const slice = (pred: (c: V4Case) => boolean) => {
    const sub = cases.filter(pred)
    const ids = new Set(sub.map((c) => c.id))
    return summarizeV4(sub, results.filter((r) => ids.has(r.id)))
  }
  const by = <K extends string>(keys: K[], pred: (c: V4Case, k: K) => boolean) => Object.fromEntries(keys.map((k) => [k, slice((c) => pred(c, k))])) as Record<K, V4Report>
  return {
    failureClass: by(FAILURE_CLASSES_V4, (c, k) => c.failureClass.includes(k)),
    domain: by(DOMAINS_V4, (c, k) => c.domain === k),
    language: by(LANGUAGES_V4, (c, k) => c.language === k),
    difficulty: by(DIFFICULTIES_V4, (c, k) => c.difficulty === k),
  }
}
