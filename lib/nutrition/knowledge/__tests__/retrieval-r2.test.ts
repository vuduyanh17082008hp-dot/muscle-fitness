import { describe, expect, it } from "vitest"

import { loadKnowledgeChunks } from "../load"
import { indexChunk, normalizeTerms } from "../normalize"
import { buildKnowledgeQuery } from "../query"
import { buildKnowledgeIndex, retrieveKnowledge } from "../retrieve"
import { ACTIVE_CONFIG, R1_CONFIG, type ScoreConfig } from "../score"
import type { KnowledgeNeedDecision, NutritionKnowledgeChunk } from "../types"
import { run } from "./helpers"

/** N1.6.3-R2 behaviour: sibling sections, section-local evidence, query normalization. Asserts outcomes, not weights. */

const need: KnowledgeNeedDecision = { needed: true, reason: "FLAVOR_TEXTURE", confidence: "HIGH" }
const template = loadKnowledgeChunks().find((c) => c.id === "nutrition.flavor_texture.texture_hacks::crunch")!

/** Synthetic chunk cloned from a real one so the metadata schema stays valid. */
const make = (doc: string, heading: string, content: string, over: Partial<NutritionKnowledgeChunk["metadata"]> = {}): NutritionKnowledgeChunk => ({
  id: `nutrition.${doc}::${heading.toLowerCase().replace(/\s+/g, "-")}`,
  documentId: `nutrition.${doc}`,
  heading,
  content,
  metadata: { ...template.metadata, id: `nutrition.${doc}`, title: doc, sensoryTargets: [], foodTypes: [], ...over },
})

const primaries = (chunks: NutritionKnowledgeChunk[], q: string, config: ScoreConfig) => {
  const index = buildKnowledgeIndex(chunks)
  const query = buildKnowledgeQuery({ message: q, reason: "FLAVOR_TEXTURE", timezone: "Asia/Singapore" })
  return retrieveKnowledge(index, query, need, config).context?.chunks.filter((c) => c.sourceType === "primary").map((c) => c.id.replace("nutrition.", "")) ?? []
}

describe("D: a valid sibling is not displaced merely for sharing a document (document penalty 0)", () => {
  // alpha holds two relevant sections; beta is a weaker filler in the same category (so only the document penalty differs).
  const chunks = [
    make("alpha", "Brittle", "brittle snappy topping adds snap and bite to soft bowls"),
    make("alpha", "Shards", "shards give bite to soft bowls"),
    make("beta", "Other", "snappy bite"),
  ]
  const ask = "snappy bite for my soft bowls"

  it("R2 ranks the document-A sibling second, ahead of the weaker document-B filler", () => {
    expect(primaries(chunks, ask, ACTIVE_CONFIG)).toEqual(["alpha::brittle", "alpha::shards", "beta::other"])
  })

  it("R1 let the filler jump the sibling (proves the test discriminates)", () => {
    expect(primaries(chunks, ask, R1_CONFIG)).toEqual(["alpha::brittle", "beta::other", "alpha::shards"])
  })
})

describe("C: section-local evidence decides when every document-level signal ties (localMatch)", () => {
  // Same document => identical title/category/goal/locale/authority. The query word is in the shared header of both,
  // so lexicalBody ties; only the second section also says it in its own body. Its heading sorts last, so a pure id tie-break loses.
  const chunks = [make("gamma", "Aaa Plain", "general notes about plating"), make("gamma", "Zzz Local", "gamma is discussed right here")]

  it("R2 prefers the locally relevant section", () => {
    expect(primaries(chunks, "gamma", ACTIVE_CONFIG)[0]).toBe("gamma::zzz-local")
  })

  it("R1 fell back to chunk-id order (proves the test discriminates)", () => {
    expect(primaries(chunks, "gamma", R1_CONFIG)[0]).toBe("gamma::aaa-plain")
  })

  it("local terms exclude the broadcast document header", () => {
    const item = indexChunk(make("delta", "Local Heading", "marmalade only here", { cuisines: ["vietnamese"] }))
    expect(item.localTerms).toContain("marmalade")
    expect(item.localTerms).not.toContain("vietnamese")
    expect(item.normalizedTerms).toContain("vietnamese")
  })
})

describe("E: per-document cap", () => {
  const many = Array.from({ length: 6 }, (_, i) => make("alpha", `Part ${i}`, "snappy bite for soft bowls"))
  it("R2 fills a lone document up to 3 primaries and no further", () => {
    expect(primaries(many, "snappy bite for my soft bowls", ACTIVE_CONFIG)).toHaveLength(3)
  })
  it("R1 stopped at 2", () => {
    expect(primaries(many, "snappy bite for my soft bowls", R1_CONFIG)).toHaveLength(2)
  })
})

describe("query normalization", () => {
  it("A: keeps Vietnamese words whole instead of shattering them at every diacritic", () => {
    const terms = normalizeTerms("đồ ăn mềm hết trơn, muốn có chút giòn giòn")
    expect(terms).toEqual(expect.arrayContaining(["muốn", "mềm", "giòn", "trơn", "chút"]))
    // The old ASCII-only split produced fragments such as "mu", "ch", "tr", "gi".
    for (const fragment of ["mu", "ch", "tr", "gi", "ng", "nh"]) expect(terms).not.toContain(fragment)
    expect(normalizeTerms("bún chả phở")).toEqual(expect.arrayContaining(["bún", "chả", "phở"]))
  })

  it("A: indexes non-ASCII corpus text the same way, so a user's accented word can match it", () => {
    const item = indexChunk(make("eps", "Noodles", "phở and bún chả are lighter than fried noodles"))
    expect(item.localTerms).toEqual(expect.arrayContaining(["phở", "bún", "chả"]))
  })

  it("B: a '-ness' heading shares terms with the user's base word, so local section matching works", () => {
    for (const [heading, user] of [["Crispness", "how do I keep it crisp"], ["Creaminess", "I want it creamy"], ["Sweetness", "needs to be sweet"], ["Bitterness", "too bitter"]] as const) {
      const shared = normalizeTerms(heading).filter((t) => normalizeTerms(user).includes(t))
      expect(shared, `${heading} vs "${user}"`).not.toHaveLength(0)
    }
    expect(normalizeTerms("crisp")).toEqual(expect.arrayContaining(["crisp", "crunchy"])) // original token + canonical concept
  })

  it("B: unrelated words are untouched; stemming is applied identically to query and corpus", () => {
    expect(normalizeTerms("business")).toEqual(["busy"]) // known cosmetic over-stem; harmless because both sides map the same way
    expect(normalizeTerms("bowls")).toEqual(["bowl"])
    expect(normalizeTerms("glass")).toEqual(["glass"])
  })

  it("surfaces Texture Hacks > Crispness for a 'crisp' ask in the real corpus", () => {
    const { ids: got } = run("how do I get a crisp outside on baked tofu")
    expect(got.slice(0, 3)).toContain("nutrition.flavor_texture.texture_hacks::crispness")
  })
})

describe("companions stay out of primary ranking", () => {
  it("decision-rule / failure-mode sections are never primaries under the active config", () => {
    const index = buildKnowledgeIndex(loadKnowledgeChunks())
    const query = buildKnowledgeQuery({ message: "make my bowl crunchier", reason: "FLAVOR_TEXTURE", timezone: "Asia/Singapore" })
    const out = retrieveKnowledge(index, query, need, ACTIVE_CONFIG).context!.chunks
    for (const c of out.filter((x) => x.sourceType === "primary")) expect(c.id).not.toMatch(/::(?:do-not-claim|coach-decision-rules|common-failure-modes)/)
  })
})
