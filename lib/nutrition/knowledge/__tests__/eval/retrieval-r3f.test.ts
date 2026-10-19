import { describe, expect, it } from "vitest"

import { rankHierarchical } from "../../hierarchical"
import { buildKnowledgeQuery } from "../../query"
import { ACTIVE_CONFIG, R3_CONFIG, R3F_CONFIG } from "../../score"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { withHier } from "./hier-lab"
import { DEV_RECORDING_PATH_V4, evaluateV4, index, layeredGateV4, readRecordingV4 } from "./run-eval-v4"

/**
 * N1.6.3-R3-F (hierarchical document -> section retrieval), DEV candidate. Not active: the runtime stays on R3. These are
 * non-regression floors for the candidate and a structural check that document and section scores are separately observable.
 * Experiments and the four-suite comparison: hier-experiments.print.test.ts, docs/nutrition-knowledge-eval-v4.md "R3-F".
 */
describe("R3-F: hierarchical retrieval (DEV candidate, opt-in)", () => {
  it("is not active: the runtime config has no hierarchical stage", () => {
    expect(ACTIVE_CONFIG).toBe(R3_CONFIG)
    expect(ACTIVE_CONFIG.hier).toBeUndefined()
  })

  it("document score and section score are separate observable objects; inside one document local sections order by sectionScore alone", () => {
    const query = buildKnowledgeQuery({ message: "how do I make my smoothie thicker and creamier", reason: "FLAVOR_TEXTURE", goal: "fat_loss", timezone: "Asia/Singapore" })
    const { docs, sections } = rankHierarchical(index.items, index.stats, query, withHier(R3_CONFIG, {}))
    expect(docs.length).toBeGreaterThan(1)
    expect(docs[0].documentScore).toBeGreaterThanOrEqual(docs[1].documentScore)
    const inDoc = sections.filter((s) => s.documentId === sections[0].documentId)
    expect(inDoc.length).toBeGreaterThan(1)
    for (let i = 1; i < inDoc.length; i++) expect(inDoc[i - 1].sectionScore).toBeGreaterThanOrEqual(inDoc[i].sectionScore)
  })

  const gate = layeredGateV4(readRecordingV4(DEV_RECORDING_PATH_V4))
  const r3 = evaluateV4(CASES_V4_DEV, gate, R3_CONFIG).report
  const r3f = evaluateV4(CASES_V4_DEV, gate, R3F_CONFIG).report

  it("v4 DEV (layered gate): wrong-document and section Top-3 improve on R3, Recall@3 stays within 0.02, nothing returns empty", () => {
    expect(r3f.doc.wrongDocRate).toBeLessThanOrEqual(r3.doc.wrongDocRate - 0.03)
    expect(r3f.section.top3).toBeGreaterThanOrEqual(r3.section.top3) // R3-I: was +0.015; the corpus fixes raised plain R3 section Top-3 to F5's level (F5 is not active)
    expect(r3f.section.siblingSurvival).toBeGreaterThan(r3.section.siblingSurvival)
    expect(r3f.doc.recallAt3).toBeGreaterThanOrEqual(r3.doc.recallAt3 - 0.02)
    expect(r3f.doc.endToEndRecallAt3).toBeGreaterThanOrEqual(0.81)
    expect(r3f.ops.zeroResultRate).toBeLessThanOrEqual(0.03)
    expect(r3f.ops.contextMaxChars).toBeLessThanOrEqual(3200)
    expect(r3f.ops.latencyP95Ms).toBeLessThan(25)
  })

  it("the gate is untouched by the retrieval experiment (same recordings, same decisions)", () => {
    expect(r3f.gate).toEqual(r3.gate)
  })
})
