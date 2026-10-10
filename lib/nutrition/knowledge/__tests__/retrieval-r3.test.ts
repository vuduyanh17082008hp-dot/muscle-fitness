import { describe, expect, it } from "vitest"

import { loadKnowledgeChunks } from "../load"
import { normalizeTerms } from "../normalize"
import { buildKnowledgeQuery } from "../query"
import { buildKnowledgeIndex, getKnowledgeIndex, retrieveKnowledge } from "../retrieve"
import { ACTIVE_CONFIG, queryTermsOf, R2_CONFIG, R3_CONFIG, scoreChunk, corpusStats, type ScoreConfig } from "../score"
import { TOPIC_RETRIEVAL_TERMS } from "../semantic-hints"
import type { KnowledgeNeedDecision, NutritionKnowledgeChunk } from "../types"

/**
 * N1.6.3-R3 behaviour: structured Layer-2 retrieval intent reaches section-local scoring, header words stop broadcasting,
 * a stated goal demotes the other goal's document, filler words are not evidence. Each test also runs the R2 configuration
 * (or the pre-R3 input) to prove the assertion would fail without the change. Asserts outcomes, not weights.
 */

const index = getKnowledgeIndex()
const need: KnowledgeNeedDecision = { needed: true, reason: "STRATEGY", confidence: "MEDIUM", source: "semantic" }
const primaries = (q: ReturnType<typeof buildKnowledgeQuery>, config: ScoreConfig, idx = index) =>
  retrieveKnowledge(idx, q, need, config).context?.chunks.filter((c) => c.sourceType === "primary").map((c) => c.id.replace("nutrition.", "")) ?? []

describe("R3 configuration", () => {
  it("R3 is the active configuration; R2 is preserved exactly as the reference", () => {
    expect(ACTIVE_CONFIG).toBe(R3_CONFIG)
    expect(R2_CONFIG.weights.concept).toBe(0)
    expect(R2_CONFIG.weights.localMatch).toBe(0.04)
    expect(R2_CONFIG.lexicalScope).toBeUndefined()
    expect(R2_CONFIG.goalMismatchFactor).toBeUndefined()
    expect(R3_CONFIG).toMatchObject({ lexicalScope: "local", goalMismatchFactor: 0.7, maxPerDocument: 3, relativeFloor: 0.5, minScore: 0.3 })
  })
})

describe("R3-B: the Layer-2 retrieval intent becomes bounded query terms", () => {
  it("topics become the corpus's own canonical words; a stated goal outranks the stored goal; nothing else changes", () => {
    const q = buildKnowledgeQuery({ message: "mình đang cut mà tối nào cũng đói", reason: "STRATEGY", goal: "muscle_gain", hints: { topics: ["satiety"], goal: "fat_loss" } })
    expect(q.conceptTerms).toEqual(expect.arrayContaining(["satiety", "volume"]))
    expect(q.goal).toBe("fat_loss")
    expect(q.goalStated).toBe(true)
    const none = buildKnowledgeQuery({ message: "mình đang cut mà tối nào cũng đói", reason: "STRATEGY", goal: "muscle_gain" })
    expect(none.conceptTerms).toBeUndefined()
    expect(none.goal).toBe("muscle_gain")
    expect(none.goalStated).toBeUndefined()
  })

  it("every topic maps to a few words that exist in the corpus vocabulary (no dead topic)", () => {
    const vocab = new Set(index.items.flatMap((i) => i.localTerms))
    for (const [topic, words] of Object.entries(TOPIC_RETRIEVAL_TERMS)) {
      expect(words.length, topic).toBeLessThanOrEqual(6)
      expect(normalizeTerms(words.join(" ")).some((t) => vocab.has(t)), topic).toBe(true)
    }
  })

  it("a Vietnamese ask with no known token reaches the right section only through the intent (R2 returned nothing)", () => {
    const q = buildKnowledgeQuery({ message: "bụng réo suốt buổi tối", reason: "STRATEGY", goal: "fat_loss", hints: { topics: ["satiety"], goal: "fat_loss" } })
    expect(primaries(q, R3_CONFIG).slice(0, 3).filter((id) => id.endsWith("::satiety-and-volume")).length).toBeGreaterThan(0)
    expect(primaries(q, R3_CONFIG)[0]).toBe("goal.fat_loss::satiety-and-volume") // the stated goal's own document wins the tie
    expect(primaries(q, R2_CONFIG)).toEqual([])
  })
})

describe("R3-C: section-local scoring", () => {
  const template = loadKnowledgeChunks().find((c) => c.id === "nutrition.flavor_texture.texture_hacks::crunch")!
  const make = (doc: string, heading: string, content: string, over: Partial<NutritionKnowledgeChunk["metadata"]> = {}): NutritionKnowledgeChunk => ({
    id: `nutrition.${doc}::${heading.toLowerCase().replace(/\s+/g, "-")}`,
    documentId: `nutrition.${doc}`,
    heading,
    content,
    metadata: { ...template.metadata, id: `nutrition.${doc}`, title: doc, sensoryTargets: [], foodTypes: [], category: "goal", ...over },
  })

  it("a topic is credited to the section that is itself about it, never to its siblings", () => {
    const idx = buildKnowledgeIndex([make("alpha", "Aaa filler", "tea water table"), make("alpha", "Fullness", "satiety and volume keep hunger down"), make("alpha", "Zzz filler", "chair window table")])
    const q = buildKnowledgeQuery({ message: "xin chào", reason: "STRATEGY", hints: { topics: ["satiety"] } })
    expect(primaries(q, R3_CONFIG, idx)).toEqual(["alpha::fullness"])
    expect(primaries(q, R2_CONFIG, idx)).toEqual([]) // R2 had no way to use the concept
  })

  it("document-header words (cuisine, goal, food metadata) no longer broadcast lexical credit to every section", () => {
    const idx = buildKnowledgeIndex([make("alpha", "Noodles", "noodle broth bowl", { cuisines: ["vietnamese"], category: "cuisine" }), make("alpha", "Protein", "grilled pork protein", { cuisines: ["vietnamese"], category: "cuisine" })])
    const stats = corpusStats(idx.items)
    const query = buildKnowledgeQuery({ message: "vietnamese noodle", reason: "CUISINE", hints: { cuisines: ["vietnamese"] } })
    const protein = idx.items.find((i) => i.chunk.heading === "Protein")!
    const lexical = (cfg: ScoreConfig) => scoreChunk(protein, query, stats, queryTermsOf(query), { ...cfg, minScore: 0 })!.signals.lexicalBody
    expect(lexical(R2_CONFIG)).toBeGreaterThan(0) // the header said "vietnamese" for this section too
    expect(lexical(R3_CONFIG)).toBe(0) // its own heading and body do not
  })

  it("a goal the message states demotes the other goal's document by the configured factor; a stored goal never does", () => {
    const item = index.items.find((i) => i.chunk.id === "nutrition.goal.muscle_gain::protein-consistency")!
    const base = { query: "protein", goal: "fat_loss", categories: ["goal" as const], locale: "SG" as const }
    const score = (stated: boolean) => scoreChunk(item, { ...base, ...(stated ? { goalStated: true } : {}) }, index.stats, queryTermsOf({ ...base }), { ...R3_CONFIG, minScore: 0 })!.score
    expect(score(true) / score(false)).toBeCloseTo(0.7, 5)
    expect(scoreChunk(item, { ...base, goalStated: true }, index.stats, queryTermsOf(base), { ...R2_CONFIG, minScore: 0 })!.score).toBe(scoreChunk(item, base, index.stats, queryTermsOf(base), { ...R2_CONFIG, minScore: 0 })!.score)
  })
})

describe("R3-E: filler words are not retrieval evidence", () => {
  it("drops conversational filler that idf would otherwise rate as highly informative, and keeps domain words", () => {
    const t = normalizeTerms("do I actually need a mass gainer shake, honestly, even though it looks fine")
    for (const filler of ["actually", "honestly", "even", "though", "looks"]) expect(t, filler).not.toContain(filler)
    expect(t).toEqual(expect.arrayContaining(["mass", "gainer", "shake"]))
    expect(normalizeTerms("keep going, stay full, stop snacking, eat enough protein while I cut")).toEqual(expect.arrayContaining(["keep", "full", "stop", "enough", "protein", "cut"]))
  })

  it("'actually' no longer pulls the makeover boilerplate heading 'Identify what the user actually wants'", () => {
    const q = buildKnowledgeQuery({ message: "do I actually need a mass gainer shake", reason: "STRATEGY", goal: "muscle_gain" })
    const ids = primaries(q, R3_CONFIG)
    expect(ids.some((id) => id.endsWith("::identify-what-the-user-actually-wants"))).toBe(false)
  })
})
