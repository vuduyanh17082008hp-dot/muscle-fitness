import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { MAX_CONTEXT_CHARS } from "../../context"
import { decideNutritionKnowledgeNeed } from "../../need"
import { ACTIVE_CONFIG } from "../../score"
import { buildSemanticGatePrompt } from "../../semantic-gate"
import { CASES } from "./cases"
import { CASES_V2, EVAL_VERSION, type EvalTag } from "./cases-v2"
import { evaluate, layeredGate } from "./run-eval"

/**
 * nutrition-retrieval-eval-v2 regression guard (offline, deterministic).
 * Layer 2 answers are REPLAYED from semantic-gate-v2.recorded.json (recorded once with the live, opt-in
 * semantic-gate.live.test.ts); normal `npm test` never calls OpenAI.
 *
 * The numeric floors below are the measured values with slack: they stop regressions, they are NOT the freeze targets.
 * The freeze targets and the gap to them are reported in docs/nutrition-knowledge-eval.md.
 */
type Recording = Record<string, { promptHash: string; reply: string | null }>
const recording: Recording = JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8"))
const layered = layeredGate(recording)
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12)

describe(`${EVAL_VERSION}: dataset`, () => {
  const dev = CASES_V2.filter((c) => c.split === "dev")
  const held = CASES_V2.filter((c) => c.split === "heldout")

  it("has the required scale and a ~70/30 split", () => {
    expect(EVAL_VERSION).toBe("nutrition-retrieval-eval-v2")
    expect(CASES_V2.length).toBeGreaterThanOrEqual(100)
    expect(CASES_V2.length).toBeLessThanOrEqual(125)
    expect(dev.length / CASES_V2.length).toBeGreaterThan(0.64)
    expect(dev.length / CASES_V2.length).toBeLessThan(0.74)
    expect(new Set(CASES_V2.map((c) => c.id)).size).toBe(CASES_V2.length)
  })

  it("has enough document and section ground truth", () => {
    expect(CASES_V2.filter((c) => c.gate && c.docs?.length).length).toBeGreaterThanOrEqual(60)
    expect(CASES_V2.filter((c) => c.section).length).toBeGreaterThanOrEqual(40)
  })

  it("covers every required kind of message", () => {
    const tags = new Set<EvalTag>(CASES_V2.map((c) => c.tag))
    for (const t of ["direct", "indirect", "messy", "bilingual", "negative", "near-miss"] as const) expect(tags.has(t)).toBe(true)
    expect(held.some((c) => c.tag === "indirect")).toBe(true)
    expect(held.some((c) => c.tag === "bilingual")).toBe(true)
    expect(held.some((c) => c.tag === "near-miss")).toBe(true)
  })

  it("held-out never repeats a dev or v1 message (it is a separate, lexically different split)", () => {
    const seen = new Set([...dev.map((c) => c.message.toLowerCase()), ...CASES.map((c) => c.message.toLowerCase())])
    expect(held.every((c) => !seen.has(c.message.toLowerCase()))).toBe(true)
  })

  it("the recording matches the CURRENT prompt for every uncertain case (re-record if this fails)", () => {
    for (const c of [...CASES_V2, ...CASES]) {
      if (!decideNutritionKnowledgeNeed({ message: c.message, intent: c.intent }).uncertain) continue
      expect(recording[c.message]?.promptHash, c.message).toBe(hash(buildSemanticGatePrompt(c.message)))
    }
  })
})

describe(`${EVAL_VERSION}: Layer 1 (deterministic)`, () => {
  const all = evaluate(ACTIVE_CONFIG, "all", CASES_V2)

  it("never retrieves for a negative or near-miss (precision 1.0 on every split)", () => {
    expect(all.report.gate.fp).toBe(0)
  })

  it("the uncertain band covers most deterministic misses while sending few negatives to a model", () => {
    const rows = CASES_V2.map((c) => ({ c, d: decideNutritionKnowledgeNeed({ message: c.message }) }))
    const missed = rows.filter((r) => r.c.gate && !r.d.needed)
    const negatives = rows.filter((r) => !r.c.gate)
    expect(missed.filter((r) => r.d.uncertain).length / missed.length).toBeGreaterThanOrEqual(0.9)
    // R3 deliberately widened the band (provenance talk, advice-shaped questions, unaccented Vietnamese) to lift gate recall: 0.10 -> 0.20 negatives may reach Layer 2.
    expect(negatives.filter((r) => r.d.uncertain).length / negatives.length).toBeLessThanOrEqual(0.2)
    expect(rows.filter((r) => r.d.needed && r.d.uncertain)).toHaveLength(0)
  })
})

describe(`${EVAL_VERSION}: layered gate (Layer 1 + recorded Layer 2)`, () => {
  const dev = evaluate(ACTIVE_CONFIG, "dev", CASES_V2, layered)
  const held = evaluate(ACTIVE_CONFIG, "heldout", CASES_V2, layered)
  const all = evaluate(ACTIVE_CONFIG, "all", CASES_V2, layered)

  it("gate precision stays >= 0.95 on every split", () => {
    for (const r of [dev, held, all]) expect(r.report.gate.precision).toBeGreaterThanOrEqual(0.95)
    expect(all.report.gate.fp).toBe(0)
  })

  it("gate recall floors (measured: dev 1.00, held-out 0.84-0.88 across two recordings, overall ~0.96)", () => {
    expect(dev.report.gate.recall).toBeGreaterThanOrEqual(0.95)
    expect(held.report.gate.recall).toBeGreaterThanOrEqual(0.8)
    expect(all.report.gate.recall).toBeGreaterThanOrEqual(0.9)
  })

  it("retrieval floors (measured overall: Recall@3 0.82, wrong-document 0.23, section Top-3 0.60)", () => {
    expect(all.report.docRecallAt3).toBeGreaterThanOrEqual(0.78)
    expect(all.report.wrongDocumentRate).toBeLessThanOrEqual(0.28)
    expect(all.report.section.top3).toBeGreaterThanOrEqual(0.55)
    expect(all.report.zeroResultRate).toBeLessThanOrEqual(0.06)
  })

  it("stays inside the context and latency budgets", () => {
    expect(all.report.context.maxChars).toBeLessThanOrEqual(MAX_CONTEXT_CHARS)
    expect(all.report.latencyMs.p95).toBeLessThan(20)
  })

  it("the layered gate is a strict improvement over Layer 1 alone on the same cases", () => {
    const l1 = evaluate(ACTIVE_CONFIG, "all", CASES_V2)
    expect(all.report.gate.recall).toBeGreaterThan(l1.report.gate.recall + 0.3)
    expect(all.report.gate.precision).toBeGreaterThanOrEqual(l1.report.gate.precision - 0.05)
  })
})

describe("regressions: frozen N1.6.2/N1.6.3 behaviour is preserved", () => {
  it("'Make this meal crunchier.' still ranks Texture Hacks > Crunch in the top 3 (v1 d-5)", () => {
    const row = evaluate(ACTIVE_CONFIG, "dev", CASES).results.find((r) => r.id === "d-5")!
    expect(row.sectionRank).not.toBeNull()
    expect(row.sectionRank!).toBeLessThanOrEqual(3)
  })

  it("v1 dev/all metrics did not regress under the R1 configuration", () => {
    const dev = evaluate(ACTIVE_CONFIG, "dev").report
    const all = evaluate(ACTIVE_CONFIG, "all").report
    expect(dev.docRecallAt3).toBeGreaterThanOrEqual(0.964)
    expect(dev.section.top3).toBe(1)
    expect(all.section.top3).toBeGreaterThanOrEqual(0.9)
    expect(all.wrongDocumentRate).toBeLessThanOrEqual(0.185)
    expect(all.docRecallAt3).toBeGreaterThanOrEqual(0.944)
  })

  it("an indirect-craving query reaches the right document, bounded and gracefully (zero results are not errors)", () => {
    const row = evaluate(ACTIVE_CONFIG, "all", CASES_V2, layered).results.find((r) => r.id === "d2-p09")!
    expect(row.fired).toBe(true)
    expect(row.docsTop3).toContain("craving.ice_cream")
    expect(row.contextChars).toBeLessThanOrEqual(MAX_CONTEXT_CHARS)
  })
})
