import { describe, expect, it } from "vitest"

import { CASES } from "./cases"
import { CASES_V2 } from "./cases-v2"
import { CASES_V3_DEV } from "./cases-v3-dev"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { decideNutritionKnowledgeNeed } from "../../need"
import { R2_CONFIG } from "../../score"
import { sha256 } from "./run-eval-v3"
import {
  DEV_RECORDING_PATH_V4,
  lineV4,
  distributionV4,
  evaluateV4,
  FAILURE_CLASSES_V4,
  integrityErrorsV4,
  jaccardV4,
  layer1GateV4,
  layeredGateV4,
  leakageV4,
  oracleGateV4,
  readRecordingV4,
  subsetReportsV4,
  titleMatchAttackV4,
  tokensV4,
  type V4Report,
} from "./run-eval-v4"

/**
 * nutrition-retrieval-eval-v4 (N1.6.3-R3). DEV split only: the held-out split is sealed outside the repo and is never
 * loaded here. NUTRITION_EVAL_V4_PRINT=1 prints the DEV baseline.
 */
const FROZEN_DEV_SHA256 = "a1bdad474b1e4aebaa6ba707909aaf7b63e97ceb877cd419156146153788de93"

const PRINT = process.env.NUTRITION_EVAL_V4_PRINT === "1"
const dist = distributionV4(CASES_V4_DEV)

describe("nutrition-retrieval-eval-v4: dataset integrity (dev)", () => {
  it("every label resolves to a real, rankable corpus target and the schema is consistent", () => {
    expect(integrityErrorsV4(CASES_V4_DEV, "dev")).toEqual([])
  })

  it("meets the published size, language, difficulty and coverage shape", () => {
    expect(dist.total).toBeGreaterThanOrEqual(220)
    expect(dist.total).toBeLessThanOrEqual(260)
    expect(dist.negativeShare).toBeGreaterThanOrEqual(0.15)
    expect(dist.negativeShare).toBeLessThanOrEqual(0.2)
    expect(dist.language.vi).toBeGreaterThanOrEqual(0.12)
    expect(dist.language.mixed).toBeGreaterThanOrEqual(0.1)
    expect(dist.sectionEvaluableShare).toBeGreaterThanOrEqual(0.75)
    expect(dist.contrastGroups).toBeGreaterThanOrEqual(18)
    for (const [g, n] of Object.entries(dist.contrastGroupSizes)) expect(n, g).toBeGreaterThanOrEqual(2)
    for (const f of FAILURE_CLASSES_V4) expect(dist.failureClass[f], f).toBeGreaterThanOrEqual(5)
  })

  it("no keyword giveaways: messages rarely quote a required document title or target heading", () => {
    const { titleHits, headingHits } = leakageV4(CASES_V4_DEV)
    expect(titleHits.length / dist.positives).toBeLessThanOrEqual(0.05)
    expect(headingHits.length / dist.positives).toBeLessThanOrEqual(0.1)
  })

  it("no near-duplicates: token Jaccard < 0.5 within v4 and against every v1/v2/v3-dev message", () => {
    const old = [...CASES, ...CASES_V2, ...CASES_V3_DEV].map((c) => ({ id: c.id, t: tokensV4(c.message) }))
    const t = CASES_V4_DEV.map((c) => ({ id: c.id, t: tokensV4(c.message) }))
    const dupes: string[] = []
    for (let i = 0; i < t.length; i++)
      for (const o of [...t.slice(i + 1), ...old]) if (jaccardV4(t[i].t, o.t) >= 0.5) dupes.push(`${t[i].id} ~ ${o.id}`)
    expect(dupes).toEqual([])
  })

  it("the dev split is frozen (any edit = a new, documented version)", () => {
    expect(sha256(JSON.stringify(CASES_V4_DEV))).toBe(FROZEN_DEV_SHA256)
  })
})

describe("nutrition-retrieval-eval-v4: R2 baseline on DEV (offline, layered gate replay; R3 active)", () => {
  const gate = layeredGateV4(readRecordingV4(DEV_RECORDING_PATH_V4))
  const { report, results } = evaluateV4(CASES_V4_DEV, gate)

  it("every Layer-1-uncertain dev case has a current Layer-2 recording", () => {
    expect([...gate.unrecorded]).toEqual([])
  })

  // R2 DEV baseline at the v4 freeze (2026-10-10) minus slack: a non-regression floor, not a target (targets: V4_TARGETS).
  it("does not regress below the R2 dev baseline (layered gate and oracle gate)", () => {
    expect(report.gate.precision).toBeGreaterThanOrEqual(0.95)
    expect(report.gate.recall).toBeGreaterThanOrEqual(0.74)
    expect(report.doc.recallAt3).toBeGreaterThanOrEqual(0.76)
    expect(report.doc.mrr).toBeGreaterThanOrEqual(0.71)
    expect(report.doc.wrongDocRate).toBeLessThanOrEqual(0.33)
    expect(report.section.top3).toBeGreaterThanOrEqual(0.57)
    expect(report.ops.zeroResultRate).toBeLessThanOrEqual(0.1)
    const oracle = evaluateV4(CASES_V4_DEV, oracleGateV4).report
    expect(oracle.doc.recallAt3).toBeGreaterThanOrEqual(0.69)
    expect(oracle.doc.wrongDocRate).toBeLessThanOrEqual(0.38)
    expect(oracle.section.top3).toBeGreaterThanOrEqual(0.49)
  })

  it.skipIf(!PRINT)("prints the dev distribution, baseline and slices", () => {
    const l1 = evaluateV4(CASES_V4_DEV, layer1GateV4).report
    const oracle = evaluateV4(CASES_V4_DEV, oracleGateV4)
    const sub = subsetReportsV4(CASES_V4_DEV, results)
    const subO = subsetReportsV4(CASES_V4_DEV, oracle.results)
    const slices = (label: string, s: typeof sub) =>
      Object.entries(s).flatMap(([kind, m]) => Object.entries(m).map(([k, r]) => lineV4(`${label} ${kind}:${k}`, r as V4Report)))
    console.log(
      [
        "",
        "distribution: " + JSON.stringify(dist),
        "leakage: " + JSON.stringify(leakageV4(CASES_V4_DEV)),
        "title-matcher attack: " + JSON.stringify(titleMatchAttackV4(CASES_V4_DEV)),
        "sha256: " + sha256(JSON.stringify(CASES_V4_DEV)),
        lineV4("DEV layered", report),
        lineV4("DEV layer1-only", l1),
        lineV4("DEV oracle-gate", oracle.report),
        "layered gate: " + JSON.stringify(report.gate),
        "layered section: " + JSON.stringify(report.section),
        "layered doc: " + JSON.stringify(report.doc),
        "layered understanding: " + JSON.stringify(report.understanding),
        "oracle section: " + JSON.stringify(oracle.report.section),
        "oracle understanding: " + JSON.stringify(oracle.report.understanding),
        "ops: " + JSON.stringify(report.ops),
        ...slices("L", sub),
        ...slices("O", subO),
        "unrecorded: " + [...gate.unrecorded].join(", "),
      ].join("\n"),
    )
  })
})

// N1.6.3-R3 DEV candidate (measured on the frozen DEV split with the recorded Layer-2 replies of the final prompt, minus slack).
// A DEV candidate is NOT a pass: only the sealed held-out split can show generalisation. These are non-regression floors, not targets.
describe("nutrition-retrieval-eval-v4: R3 DEV candidate floors", () => {
  const gate = layeredGateV4(readRecordingV4(DEV_RECORDING_PATH_V4))
  const r3 = evaluateV4(CASES_V4_DEV, gate).report
  const r2 = evaluateV4(CASES_V4_DEV, gate, R2_CONFIG).report
  const oracle = evaluateV4(CASES_V4_DEV, oracleGateV4).report

  it("layered gate: precision stays >= 0.95 while recall clears the 0.90 target on DEV", () => {
    expect(r3.gate.precision).toBeGreaterThanOrEqual(0.97)
    expect(r3.gate.recall).toBeGreaterThanOrEqual(0.92)
    expect(r3.gate.nearMissFalsePositives).toBeLessThanOrEqual(2)
  })

  it("retrieval floors (layered): document recall, end-to-end recall, section Top-3, coverage, zero-result", () => {
    expect(r3.doc.recallAt3).toBeGreaterThanOrEqual(0.84)
    expect(r3.doc.endToEndRecallAt3).toBeGreaterThanOrEqual(0.8)
    expect(r3.doc.wrongDocRate).toBeLessThanOrEqual(0.35)
    expect(r3.section.top3).toBeGreaterThanOrEqual(0.63)
    expect(r3.doc.coverageAt4).toBeGreaterThanOrEqual(0.68)
    expect(r3.ops.zeroResultRate).toBeLessThanOrEqual(0.03)
  })

  it("oracle gate (retrieval isolated) does not fall below the R2 floors", () => {
    expect(oracle.doc.recallAt3).toBeGreaterThanOrEqual(0.69)
    expect(oracle.doc.wrongDocRate).toBeLessThanOrEqual(0.38)
    expect(oracle.section.top3).toBeGreaterThanOrEqual(0.5)
  })

  it("on the SAME gate and recordings, R3 scoring beats R2 scoring (the gain is not just the gate)", () => {
    expect(r3.doc.recallAt3 - r2.doc.recallAt3).toBeGreaterThanOrEqual(0.07)
    expect(r3.section.top3 - r2.section.top3).toBeGreaterThanOrEqual(0.05)
    expect(r3.doc.wrongDocRate).toBeLessThanOrEqual(r2.doc.wrongDocRate)
    expect(r3.ops.zeroResultRate).toBeLessThan(r2.ops.zeroResultRate)
  })

  it("Vietnamese and mixed-language rows keep their concepts (understanding comes from the Layer-2 intent, not aliases)", () => {
    expect(r3.understanding.languageNormalization).toBeGreaterThanOrEqual(0.88)
    expect(r3.understanding.conceptCoverage).toBeGreaterThanOrEqual(0.9)
  })

  it("budgets: bounded context, a bounded share of messages reaches the model, latency stays tiny", () => {
    expect(r3.ops.contextMaxChars).toBeLessThanOrEqual(3200)
    expect(r3.ops.contextAvgChars).toBeLessThanOrEqual(2200)
    expect(r3.ops.latencyP95Ms).toBeLessThan(25)
    const routed = CASES_V4_DEV.map((c) => ({ c, u: !!decideNutritionKnowledgeNeed({ message: c.message }).uncertain }))
    expect(routed.filter((r) => r.u).length / routed.length).toBeLessThanOrEqual(0.7)
    const negatives = routed.filter((r) => !r.c.expectedKnowledgeNeed)
    expect(negatives.filter((r) => r.u).length / negatives.length).toBeLessThanOrEqual(0.4)
  })
})
