import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { COMPANION_HEADINGS } from "../../filter"
import { CASES } from "./cases"
import { CASES_V2 } from "./cases-v2"
import { CASES_V30_DEV, CASES_V3_DEV } from "./cases-v3-dev"
import type { V3Case } from "./cases-v3-types"
import { classifyFailures, DEV_RECORDING_PATH, docOf, evaluateV3, f3, HYPOTHESES, hypothesisReports, index, layer1Gate, layeredGate, loadHeldout, oracleGate, readRecording, SEALED_DIR, sha256, tally, type V3Report } from "./run-eval-v3"

/**
 * nutrition-retrieval-eval-v3.1 (N1.6.3-R2). Dev split lives in the repo; the held-out split is sealed outside it and only runs
 * when NUTRITION_EVAL_V3_SEALED points at the evaluator's directory. NUTRITION_EVAL_V3_PRINT=1 prints the dev baseline.
 */
const FROZEN_DEV_SHA256 = "886cf77b2bc8b87d7a96e6c94c54a464c77f0dfc8241f61c1c53babf70381968"
/** Hash only: the held-out content stays outside the repo. */
const FROZEN_HELDOUT_SHA256 = "c36c17a6ee178ca635be755772d430ce829aa63427f9bef0c47d533695fef676"
/** v3.0 (first 146 dev / 73 held-out rows) — proves v3.1 only appended. */
const V30_DEV_SHA256 = "7f947aac923ce35629cef2104884a5a7a2f265b070a11b4a42ec29096a37adc7"
const V30_HELDOUT_SHA256 = "24a7058c22358f1523ad1b0d6c2c5f1e683f02fe4104453d90027aed3a65ae4f"

const tokens = (s: string) => new Set(s.toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1))
const jaccard = (a: Set<string>, b: Set<string>) => {
  const i = [...a].filter((x) => b.has(x)).length
  return i / (a.size + b.size - i || 1)
}

const heldout = loadHeldout()
const PRINT = process.env.NUTRITION_EVAL_V3_PRINT === "1"
const chunkIds = new Set(index.items.map((i) => i.chunk.id.replace("nutrition.", "")))
const docIds = new Set([...chunkIds].map(docOf))
const isCompanion = (sec: string) => (COMPANION_HEADINGS as readonly string[]).some((h) => sec.endsWith(`::${h}`))

function integrity(cases: V3Case[], split: "dev" | "heldout") {
  const ids = cases.map((c) => c.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const c of cases) {
    expect(c.split, c.id).toBe(split)
    expect(c.id.startsWith(split === "heldout" ? "h3-" : "d3-"), c.id).toBe(true)
    const req = [...(c.mandatoryDocs ?? []), ...(c.anyOfDocs ?? [])]
    const ok = [...req, ...(c.acceptableDocs ?? [])]
    const all = [...ok, ...(c.unacceptableDocs ?? [])]
    if (!c.mustRetrieve) {
      expect(all.length + (c.sections?.length ?? 0) + (c.siblingSections?.length ?? 0), `${c.id}: negatives carry no labels`).toBe(0)
      continue
    }
    expect(req.length, `${c.id}: positive needs a required doc`).toBeGreaterThan(0)
    for (const d of all) expect(docIds.has(d), `${c.id}: unknown doc ${d}`).toBe(true)
    for (const d of c.unacceptableDocs ?? []) expect(ok.includes(d), `${c.id}: ${d} both ok and unacceptable`).toBe(false)
    for (const sec of [...(c.sections ?? []), ...(c.siblingSections ?? [])]) {
      expect(chunkIds.has(sec), `${c.id}: unknown section ${sec}`).toBe(true)
      expect(isCompanion(sec), `${c.id}: companion section ${sec}`).toBe(false)
      expect(ok.includes(docOf(sec)), `${c.id}: section doc ${sec} not required/acceptable`).toBe(true)
    }
    for (const sec of c.siblingSections ?? []) expect(c.sections?.includes(sec), `${c.id}: ${sec} is both gold and sibling`).toBeFalsy()
    const h = c.hypotheses ?? []
    if (h.includes("A_DIVERSITY_KEEP")) expect(c.siblingSections?.length, `${c.id}: A_KEEP needs a sibling`).toBeGreaterThan(0)
    if (h.includes("A_DIVERSITY_HELP")) expect((c.mandatoryDocs?.length ?? 0) + (c.anyOfDocs?.length ? 1 : 0), `${c.id}: A_HELP needs 2 required units`).toBeGreaterThan(1)
    if (h.includes("B_METADATA_BROADCAST") || h.includes("D_CANONICALISATION")) expect(c.sections?.length, `${c.id}: B/D need a gold section`).toBeGreaterThan(0)
  }
}

const line = (name: string, r: V3Report) =>
  `${name.padEnd(24)} n=${r.cases} pos=${r.positives} neg=${r.negatives} | gate P=${f3(r.gate.precision)} R=${f3(r.gate.recall)} cat=${f3(r.gate.categoryAgreement)} (fp ${r.gate.fp}, fn ${r.gate.fn})` +
  ` | R@1=${f3(r.doc.recallAt1)} R@3=${f3(r.doc.recallAt3)} R@4=${f3(r.doc.recallAt4)} e2eR@3=${f3(r.doc.endToEndRecallAt3)} MRR=${f3(r.doc.mrr)} wrong=${f3(r.doc.wrongDocRate)} distract=${f3(r.doc.distractingDocRate)} genericAbove=${f3(r.doc.genericAboveSpecificRate)}` +
  ` | sec n=${r.section.cases} T1=${f3(r.section.top1)} T3=${f3(r.section.top3)} wrongSec=${f3(r.section.wrongSectionRate)} sib n=${r.section.siblingCases} survive=${f3(r.section.siblingSurvival)} suppressed=${f3(r.section.siblingSuppressedBySelection)}` +
  ` | zero=${f3(r.ops.zeroResultRate)} cand=${r.ops.avgCandidates.toFixed(1)} pool=${r.ops.avgPoolAfterFloor.toFixed(1)} prim=${r.ops.avgPrimaryChunks.toFixed(2)} total=${r.ops.avgTotalChunks.toFixed(2)} ctx=${Math.round(r.ops.contextAvgChars)}/${r.ops.contextMaxChars} lat=${r.ops.latencyAvgMs.toFixed(2)}/${r.ops.latencyP95Ms.toFixed(2)}ms`

describe("nutrition-retrieval-eval-v3.1: dataset integrity (dev)", () => {
  it("dev split is well-formed and every label resolves to a real, rankable corpus target", () => integrity(CASES_V3_DEV, "dev"))

  it("dev covers every language, style, contrast group and hypothesis", () => {
    for (const lang of ["en", "vi", "mixed"]) expect(CASES_V3_DEV.some((c) => c.lang === lang), lang).toBe(true)
    for (const style of ["direct", "indirect", "conversational", "slang", "fragment", "messy", "followup", "paraphrase"]) expect(CASES_V3_DEV.some((c) => c.style === style), style).toBe(true)
    for (const g of ["CRUNCH_VS_CREAMINESS", "CRUNCH_VS_CRISPNESS", "SWEET_VS_SAVORY", "CRAVING_VS_MACRO_LOOKUP", "CUISINE_VS_FOOD_ENTITY", "GENERIC_VS_SPECIFIC_MAKEOVER", "HAWKER_VS_VIETNAMESE", "FAT_LOSS_VS_GENERAL", "MAKEOVER_VS_SIMPLE_EDIT", "LANGUAGE_VS_CUISINE", "SIBLING_SECTIONS", "DIVERSITY_HELP", "METADATA_VS_LOCAL", "CANONICAL_COLLAPSE"]) expect(CASES_V3_DEV.some((c) => c.contrast === g), g).toBe(true)
    for (const t of ["generic-doc", "section-metadata"]) expect(CASES_V3_DEV.some((c) => c.trap === t), t).toBe(true)
    for (const h of HYPOTHESES) expect(CASES_V3_DEV.filter((c) => c.hypotheses?.includes(h)).length, h).toBeGreaterThanOrEqual(4)
  })

  it("no near-duplicates: token Jaccard < 0.5 within v3 and against every v1/v2 message", () => {
    const v3 = [...CASES_V3_DEV, ...(heldout?.cases ?? [])]
    const old = [...CASES, ...CASES_V2].map((c) => tokens(c.message))
    const t3 = v3.map((c) => tokens(c.message))
    for (let i = 0; i < t3.length; i++) {
      for (let j = i + 1; j < t3.length; j++) expect(jaccard(t3[i], t3[j]), `${v3[i].id} ~ ${v3[j].id}`).toBeLessThan(0.5)
      for (const o of old) expect(jaccard(t3[i], o), v3[i].id).toBeLessThan(0.5)
    }
  })

  it("v3.1 only appended to v3.0, and the dev split is frozen (any edit = a new, documented version)", () => {
    expect(sha256(JSON.stringify(CASES_V30_DEV))).toBe(V30_DEV_SHA256)
    expect(CASES_V3_DEV.slice(0, CASES_V30_DEV.length)).toEqual(CASES_V30_DEV)
    expect(sha256(JSON.stringify(CASES_V3_DEV))).toBe(FROZEN_DEV_SHA256)
  })
})

describe("nutrition-retrieval-eval-v3.1: R1 baseline on DEV (offline, layered gate replay)", () => {
  const gate = layeredGate(readRecording(DEV_RECORDING_PATH))
  const { report, results } = evaluateV3(CASES_V3_DEV, gate)

  it("every Layer-1-uncertain dev case has a current Layer-2 recording", () => {
    expect([...gate.unrecorded]).toEqual([])
  })

  // R1 dev baseline at the v3.1 freeze (2026-10-10) minus slack: a non-regression floor, not a target.
  it("does not regress below the R1 dev baseline (layered gate and oracle gate)", () => {
    expect(report.gate.precision).toBeGreaterThanOrEqual(0.95)
    expect(report.gate.recall).toBeGreaterThanOrEqual(0.73)
    expect(report.doc.recallAt3).toBeGreaterThanOrEqual(0.86)
    expect(report.doc.mrr).toBeGreaterThanOrEqual(0.8)
    expect(report.doc.wrongDocRate).toBeLessThanOrEqual(0.34)
    expect(report.section.top3).toBeGreaterThanOrEqual(0.53)
    expect(report.ops.zeroResultRate).toBeLessThanOrEqual(0.03)
    const oracle = evaluateV3(CASES_V3_DEV, oracleGate).report
    expect(oracle.doc.recallAt3).toBeGreaterThanOrEqual(0.84)
    expect(oracle.doc.wrongDocRate).toBeLessThanOrEqual(0.34)
    expect(oracle.section.top3).toBeGreaterThanOrEqual(0.59)
  })

  // R2 dev result (2026-10-10) minus slack: a non-regression floor for the retained R2 changes, not a target.
  it("does not regress below the R2 dev result (layered gate and oracle gate)", () => {
    expect(report.doc.recallAt3).toBeGreaterThanOrEqual(0.86)
    expect(report.doc.wrongDocRate).toBeLessThanOrEqual(0.29)
    expect(report.section.top3).toBeGreaterThanOrEqual(0.62)
    const oracle = evaluateV3(CASES_V3_DEV, oracleGate).report
    expect(oracle.doc.recallAt3).toBeGreaterThanOrEqual(0.84)
    expect(oracle.doc.wrongDocRate).toBeLessThanOrEqual(0.29)
    expect(oracle.section.top3).toBeGreaterThanOrEqual(0.66)
    expect(oracle.section.top1).toBeGreaterThanOrEqual(0.5)
  })

  it.skipIf(!PRINT)("prints the dev baseline, hypothesis subsets and failure classes", () => {
    const l1 = evaluateV3(CASES_V3_DEV, layer1Gate).report
    const hyp = hypothesisReports(CASES_V3_DEV, results)
    const oracle = evaluateV3(CASES_V3_DEV, oracleGate)
    const hypO = hypothesisReports(CASES_V3_DEV, oracle.results)
    const events = classifyFailures(CASES_V3_DEV, results)
    console.log(
      [
        "",
        line("DEV layered", report),
        line("DEV layer1-only", l1),
        ...HYPOTHESES.map((h) => line(`DEV ${h}`, hyp[h])),
        line("DEV oracle-gate", oracle.report),
        ...HYPOTHESES.map((h) => line(`DEV oracle ${h}`, hypO[h])),
        "gate misses: " + report.gate.misses.join(", "),
        "gate FPs: " + report.gate.falsePositives.join(", "),
        "failure classes: " + JSON.stringify(tally(events)),
        ...events.map((e) => `  ${e.id} ${e.kind} ${e.cls}${e.signal ? `(${e.signal})` : ""} ${e.chunk ?? ""}`),
      ].join("\n"),
    )
  })
})

describe.skipIf(!heldout)("nutrition-retrieval-eval-v3.1: HELD-OUT (evaluator only)", () => {
  it("held-out is well-formed, frozen, appended to v3.0 and disjoint from dev", () => {
    integrity(heldout!.cases, "heldout")
    expect(sha256(JSON.stringify(heldout!.cases.slice(0, 73), null, 1) + "\n")).toBe(V30_HELDOUT_SHA256)
    expect(sha256(heldout!.raw)).toBe(FROZEN_HELDOUT_SHA256)
    const devMessages = new Set(CASES_V3_DEV.map((c) => c.message.toLowerCase()))
    for (const c of heldout!.cases) expect(devMessages.has(c.message.toLowerCase()), c.id).toBe(false)
  })

  it("runs the held-out + overall baseline into the sealed directory (never printed into the repo)", () => {
    const gate = layeredGate({ ...readRecording(DEV_RECORDING_PATH), ...heldout!.recording })
    const h = evaluateV3(heldout!.cases, gate)
    const all = [...CASES_V3_DEV, ...heldout!.cases]
    const o = evaluateV3(all, gate)
    const ho = evaluateV3(heldout!.cases, oracleGate)
    const oo = evaluateV3(all, oracleGate)
    const out = {
      heldoutOracle: ho.report,
      overallOracle: oo.report,
      heldoutOracleHypotheses: hypothesisReports(heldout!.cases, ho.results),
      overallOracleHypotheses: hypothesisReports(all, oo.results),
      heldoutLayered: h.report,
      heldoutLayer1: evaluateV3(heldout!.cases, layer1Gate).report,
      overallLayered: o.report,
      overallLayer1: evaluateV3(all, layer1Gate).report,
      heldoutHypotheses: hypothesisReports(heldout!.cases, h.results),
      overallHypotheses: hypothesisReports(all, o.results),
      unrecorded: [...gate.unrecorded],
      heldoutFailureClasses: tally(classifyFailures(heldout!.cases, h.results)),
      overallFailureClasses: tally(classifyFailures(all, o.results)),
      heldoutFailures: classifyFailures(heldout!.cases, h.results),
    }
    writeFileSync(join(SEALED_DIR!, "heldout-baseline.json"), JSON.stringify(out, null, 1))
    if (PRINT)
      console.log(
        [
          "",
          line("HELD-OUT layered", out.heldoutLayered),
          line("HELD-OUT layer1-only", out.heldoutLayer1),
          ...HYPOTHESES.map((x) => line(`HO ${x}`, out.heldoutHypotheses[x])),
          line("HO oracle-gate", out.heldoutOracle),
          ...HYPOTHESES.map((x) => line(`HO oracle ${x}`, out.heldoutOracleHypotheses[x])),
          line("OVERALL layered", out.overallLayered),
          line("OVERALL layer1-only", out.overallLayer1),
          ...HYPOTHESES.map((x) => line(`ALL ${x}`, out.overallHypotheses[x])),
          line("ALL oracle-gate", out.overallOracle),
          ...HYPOTHESES.map((x) => line(`ALL oracle ${x}`, out.overallOracleHypotheses[x])),
          "unrecorded: " + out.unrecorded.join(", "),
          "held-out classes: " + JSON.stringify(out.heldoutFailureClasses),
          "overall classes: " + JSON.stringify(out.overallFailureClasses),
        ].join("\n"),
      )
    expect(out.unrecorded).toEqual([])
  })
})
