import { describe, expect, it } from "vitest"

import { MAX_CONTEXT_CHARS } from "../../context"
import { ACTIVE_CONFIG, BASELINE_CONFIG, SIGNAL_NAMES } from "../../score"
import { CASES } from "./cases"
import { evaluate, explain } from "./run-eval"

/**
 * N1.6.3 regression guard. The numbers asserted for BASELINE_CONFIG are the
 * N1.6.2 reference (so the baseline stays reproducible); the numbers asserted
 * for ACTIVE_CONFIG are floors taken from the frozen configuration. The full
 * measured table and the targets that are NOT met live in
 * docs/nutrition-knowledge-eval.md — this file does not hide them.
 */
describe("N1.6.3 evaluation set", () => {
  it("is split roughly 70/30 and held-out phrasing is distinct from dev phrasing", () => {
    const dev = CASES.filter((c) => c.split === "dev")
    const held = CASES.filter((c) => c.split === "heldout")
    expect(dev.length / CASES.length).toBeGreaterThan(0.6)
    expect(dev.length / CASES.length).toBeLessThan(0.75)
    const devText = new Set(dev.map((c) => c.message.toLowerCase()))
    expect(held.every((c) => !devText.has(c.message.toLowerCase()))).toBe(true)
  })

  it("exposes every score signal for dev/eval only (not in the runtime trace)", () => {
    const [top] = explain("Make this meal crunchier.", ACTIVE_CONFIG, 1)
    for (const signal of [...SIGNAL_NAMES, "total"]) expect(top).toHaveProperty(signal)
  })
})

describe("baseline (N1.6.2 weights) — the measured weakness", () => {
  const { report } = evaluate(BASELINE_CONFIG, "dev")

  it("ranks the wrong sections for section-level asks", () => {
    expect(report.section.top3).toBeLessThan(0.7)
    expect(report.section.top1).toBeLessThan(0.6)
  })

  it("'Make this meal crunchier.' does not surface Texture Hacks > Crunch at all", () => {
    const { results } = evaluate(BASELINE_CONFIG, "dev")
    expect(results.find((r) => r.id === "d-5")?.sectionRank).toBeNull()
  })
})

describe("frozen N1.6.3 configuration", () => {
  const dev = evaluate(ACTIVE_CONFIG, "dev")
  const held = evaluate(ACTIVE_CONFIG, "heldout")
  const baseHeld = evaluate(BASELINE_CONFIG, "heldout")

  it("CRUNCH SECTION DEFECT: Texture Hacks > Crunch ranks in the top 3 for 'Make this meal crunchier.'", () => {
    const row = dev.results.find((r) => r.id === "d-5")!
    expect(row.sectionRank).not.toBeNull()
    expect(row.sectionRank!).toBeLessThanOrEqual(3)
  })

  it("dev: section ranking, mandatory Recall@3 and gate meet their floors", () => {
    expect(dev.report.section.top3).toBe(1)
    expect(dev.report.section.top1).toBeGreaterThanOrEqual(0.75)
    expect(dev.report.docRecallAt3).toBeGreaterThanOrEqual(0.95)
    expect(dev.report.gate.precision).toBe(1)
    expect(dev.report.gate.recall).toBe(1)
  })

  it("held-out: never worse than the baseline (the config was not tuned on it)", () => {
    expect(held.report.docRecallAt3).toBeGreaterThanOrEqual(baseHeld.report.docRecallAt3)
    expect(held.report.wrongDocumentRate).toBeLessThanOrEqual(baseHeld.report.wrongDocumentRate)
    expect(held.report.gate.precision).toBe(1)
    expect(held.report.zeroResultRate).toBe(0)
  })

  it("stays inside the latency and context budgets", () => {
    const all = evaluate(ACTIVE_CONFIG, "all").report
    expect(all.latencyMs.avg).toBeLessThan(5)
    expect(all.latencyMs.p95).toBeLessThan(20)
    expect(all.context.maxChars).toBeLessThanOrEqual(MAX_CONTEXT_CHARS)
  })

  it("never retrieves for deterministic-tool messages (gate precision 1.0 on every split)", () => {
    expect(evaluate(ACTIVE_CONFIG, "all").report.gate.fp).toBe(0)
  })
})
