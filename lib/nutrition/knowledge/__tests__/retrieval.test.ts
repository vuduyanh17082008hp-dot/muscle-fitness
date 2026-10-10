import { describe, expect, it, vi } from "vitest"

import { MAX_CONTEXT_CHARS, MAX_PRIMARY_CHUNKS, MAX_TOTAL_CHUNKS, renderKnowledgeContext } from "../context"
import { COMPANION_HEADINGS, filterEligible } from "../filter"
import { loadKnowledgeChunks, loadPolicyDocuments } from "../load"
import { canonTerm, indexChunk, normalizeTerms } from "../normalize"
import { buildKnowledgeQuery } from "../query"
import { buildKnowledgeIndex, getOptionalNutritionKnowledgeContext, MAX_PRIMARY_PER_DOCUMENT, retrieveKnowledge } from "../retrieve"
import { compatibleGoalScore } from "../score"
import type { NutritionKnowledgeChunk, NutritionRetrievalTrace } from "../types"
import { index, run } from "./helpers"

const MESSAGES = [
  "I'm craving fried chicken while cutting.",
  "I'm craving Coco Pops.",
  "I want something Vietnamese tonight.",
  "What should I eat at a hawker centre tonight?",
  "I want something frozen and creamy.",
  "I want fast food but don't want to blow my calories.",
  "What can I eat that's crunchy and high protein?",
  "Is cereal bad for cutting?",
]

const docOf = (id: string) => id.split("::")[0]

describe("normalization", () => {
  it("maps sensory, cuisine and food aliases to canonical concepts", () => {
    expect(normalizeTerms("something crispy")).toContain("crunchy")
    expect(normalizeTerms("frozen")).toContain("cold")
    expect(normalizeTerms("silky")).toContain("creamy")
    expect(normalizeTerms("umami")).toContain("savory")
    expect(normalizeTerms("chilli")).toContain("spicy")
    expect(normalizeTerms("viet food")).toContain("vietnamese")
    expect(normalizeTerms("hawker center")).toContain("singapore_hawker")
    expect(normalizeTerms("cocoa pops")).toContain("cereal")
    expect(canonTerm("Crispy")).toBe("crunchy")
    expect(canonTerm("singaporean")).toBe("singapore_hawker")
    expect(normalizeTerms("crisp")).toContain("crunchy")
    expect(normalizeTerms("savoury")).toContain("savory")
    expect(normalizeTerms("icy chilled")).toContain("cold")
    expect(normalizeTerms("hawker centre")).toContain("singapore_hawker")
  })

  it("maps comparatives (crunchier, creamier, spicier...) and does not read 'protein-rich' as creamy", () => {
    expect(normalizeTerms("make it crunchier")).toContain("crunchy")
    expect(normalizeTerms("crispier")).toContain("crunchy")
    expect(normalizeTerms("creamier")).toContain("creamy")
    expect(normalizeTerms("spicier")).toContain("spicy")
    expect(normalizeTerms("a protein-rich dinner")).not.toContain("creamy")
  })

  it("expands vocabulary without replacing what the user said", () => {
    const q = buildKnowledgeQuery({ message: "I'm craving Coco Pops.", reason: "CRAVING" })
    expect(normalizeTerms("Coco Pops")).toEqual(expect.arrayContaining(["coco", "pop", "cereal"]))
    expect(q.foodTypes).toEqual(["cereal"])
    expect(q.query).toContain("coco")
  })
})

describe("indexed retrieval text", () => {
  const chunk = loadKnowledgeChunks().find((c) => c.id === "nutrition.food_makeovers.fried_chicken::main-calorie-drivers")!
  const indexed = indexChunk(chunk)

  it("carries title, category, path/heading and metadata, plus the content", () => {
    expect(indexed.retrievalText).toContain("Document: Fried Chicken Makeovers")
    expect(indexed.retrievalText).toContain("Category: food makeover")
    expect(indexed.retrievalText).toContain("Path: Fried Chicken Makeovers > Main calorie drivers")
    expect(indexed.retrievalText).toContain("Food types: fried chicken")
    expect(indexed.retrievalText).toContain("Sensory targets: crunchy")
    expect(indexed.retrievalText).toContain(chunk.content)
    expect(indexed.normalizedTerms).toEqual(expect.arrayContaining(["fried_chicken", "crunchy", "savory"]))
  })

  it("never leaks the wrapper text into the context handed to the agent", () => {
    const { context } = run("I'm craving fried chicken while cutting.")
    const all = loadKnowledgeChunks()
    for (const c of context!.chunks) {
      expect(c.content).toBe(all.find((k) => k.id === c.id)!.content)
      expect(c.content).not.toMatch(/^Document: |^Path: /m)
    }
  })

  it("does not invent metadata the corpus lacks", () => {
    expect(Object.keys(chunk.metadata)).not.toContain("containsIngredients")
  })
})

describe("goal compatibility and locale", () => {
  it("missing goal metadata is broadly compatible, not a rejection", () => {
    expect(compatibleGoalScore("fat_loss", undefined)).toBeGreaterThan(0)
    expect(compatibleGoalScore("fat_loss", [])).toBeGreaterThan(0)
    expect(compatibleGoalScore("fat_loss", ["fat_loss"])).toBeGreaterThan(compatibleGoalScore("fat_loss", undefined))
    expect(compatibleGoalScore("fat_loss", ["muscle_gain"])).toBeGreaterThan(0)
    expect(compatibleGoalScore("fat_loss", ["muscle_gain"])).toBeLessThan(compatibleGoalScore("fat_loss", undefined))
    expect(compatibleGoalScore(undefined, ["fat_loss"])).toBe(0)
  })

  it("goal-less documents stay retrievable for a goal-bearing user", () => {
    expect(run("Is cereal bad for cutting?").docs).toContain("core.basics")
    expect(run("I'm craving fried chicken while cutting.").docs).toContain("food_makeovers.fried_chicken")
  })

  it("locale ranks but never filters", () => {
    const sg = run("What should I eat at a hawker centre tonight?", { timezone: "Asia/Singapore" })
    const global = run("What should I eat at a hawker centre tonight?", { timezone: "Europe/London" })
    expect(sg.query.locale).toBe("SG")
    expect(global.query.locale).toBe("global")
    expect(global.docs[0]).toBe("cuisine.singapore_hawker")
  })

  it("an SG user asking for Vietnamese still gets Vietnamese, not hawker", () => {
    const { docs } = run("I want Vietnamese food at home.", { timezone: "Asia/Singapore" })
    expect(docs[0]).toBe("cuisine.vietnamese")
    expect(docs).not.toContain("cuisine.singapore_hawker")
  })
})

describe("diversity, bounds and zero results", () => {
  it.each(MESSAGES)("respects chunk and character limits: %s", (message) => {
    const { context } = run(message)
    const chunks = context!.chunks
    const primary = chunks.filter((c) => c.sourceType === "primary")
    expect(primary.length).toBeLessThanOrEqual(MAX_PRIMARY_CHUNKS)
    expect(chunks.length).toBeLessThanOrEqual(MAX_TOTAL_CHUNKS)
    expect(chunks.length - primary.length).toBeLessThanOrEqual(2)
    const perDoc = new Map<string, number>()
    for (const c of primary) perDoc.set(docOf(c.id), (perDoc.get(docOf(c.id)) ?? 0) + 1)
    expect(Math.max(...perDoc.values())).toBeLessThanOrEqual(MAX_PRIMARY_PER_DOCUMENT)
    expect(renderKnowledgeContext(context!).length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS)
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length)
  })

  it("enforces the character budget by truncating or dropping oversized chunks", () => {
    const big = loadKnowledgeChunks().map((c) => ({ ...c, content: `${c.content}\n${"Extra strategy sentence. ".repeat(120)}` }))
    const query = buildKnowledgeQuery({ message: "I'm craving Coco Pops.", reason: "CRAVING", goal: "fat_loss" })
    const { context, trace } = retrieveKnowledge(buildKnowledgeIndex(big), query, { needed: true, reason: "CRAVING", confidence: "HIGH" })
    expect(renderKnowledgeContext(context!).length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS)
    expect(trace.contextCharacters).toBeLessThanOrEqual(MAX_CONTEXT_CHARS)
    expect(context!.chunks.length).toBeLessThanOrEqual(MAX_TOTAL_CHUNKS)
  })

  it("returns nothing (zero result) instead of forcing topK irrelevant chunks", () => {
    const query = buildKnowledgeQuery({ message: "quantum xylophone zeppelin", reason: "GENERAL_NUTRITION", goal: null })
    const { context, trace } = retrieveKnowledge(index, query, { needed: true, reason: "GENERAL_NUTRITION", confidence: "LOW" })
    expect(context).toBeNull()
    expect(trace).toMatchObject({ zeroResult: true, totalChunkCount: 0, contextCharacters: 0 })
  })
})

describe("companions", () => {
  it("attaches Do-not-claim style sections for selected primaries, from the same document, max 2", () => {
    const { context } = run("I'm craving fried chicken while cutting.")
    const companions = context!.chunks.filter((c) => c.sourceType === "companion")
    const primaryDocs = new Set(context!.chunks.filter((c) => c.sourceType === "primary").map((c) => docOf(c.id)))
    expect(companions.length).toBeGreaterThan(0)
    expect(companions.length).toBeLessThanOrEqual(2)
    for (const c of companions) {
      expect(primaryDocs.has(docOf(c.id))).toBe(true)
      expect(COMPANION_HEADINGS).toContain(c.id.split("::")[1])
    }
  })

  it("companions never rank as primaries and are never attached recursively", () => {
    for (const message of MESSAGES) {
      const { context } = run(message)
      const primary = context!.chunks.filter((c) => c.sourceType === "primary")
      expect(primary.some((c) => c.id.endsWith("::do-not-claim"))).toBe(false)
      expect(context!.chunks.length).toBeLessThanOrEqual(primary.length + 2)
    }
  })

  it("attaches nothing when the document has no companion section", () => {
    const stripped = loadKnowledgeChunks().filter((c) => !(COMPANION_HEADINGS as readonly string[]).includes(c.id.split("::")[1]))
    const query = buildKnowledgeQuery({ message: "I'm craving Coco Pops.", reason: "CRAVING" })
    const { context } = retrieveKnowledge(buildKnowledgeIndex(stripped), query, { needed: true, reason: "CRAVING", confidence: "HIGH" })
    expect(context!.chunks.every((c) => c.sourceType === "primary")).toBe(true)
  })
})

describe("policy, brand and hard constraints", () => {
  it("policy never enters the retrieval index or any result", () => {
    const policyIds = new Set(loadPolicyDocuments().map((p) => p.metadata.id))
    expect(index.items.some((i) => policyIds.has(i.chunk.documentId))).toBe(false)
    for (const message of MESSAGES) expect(run(message).ids.some((id) => policyIds.has(docOf(id)))).toBe(false)
  })

  it("filters policy-authority, brand-category, never-retrieved and malformed chunks", () => {
    const base = loadKnowledgeChunks()[0]
    const variant = (over: Partial<NutritionKnowledgeChunk["metadata"]>, extra: Partial<NutritionKnowledgeChunk> = {}) =>
      indexChunk({ ...base, ...extra, metadata: { ...base.metadata, ...over } })
    const kept = filterEligible([
      variant({ authority: "policy" }),
      variant({ category: "brand" }),
      variant({}, { heading: "Do not claim" }),
      variant({}, { heading: "Suggested tool calls" }),
      variant({}, { content: "   " }),
      variant({}),
    ])
    expect(kept).toHaveLength(1)
  })

  it("food metadata is not a hard filter: a dairy-tagged cereal doc stays eligible (safety is enforced at recommendation time)", () => {
    const cereal = index.items.filter((i) => i.chunk.documentId === "nutrition.craving.cereal")
    expect(cereal[0].chunk.metadata.foodTypes).toContain("dairy")
    expect(filterEligible(cereal).length).toBe(cereal.filter((i) => !["do-not-claim", "suggested-tool-calls"].includes(i.chunk.id.split("::")[1])).length)
    expect(run("I'm craving Coco Pops.").docs).toContain("craving.cereal")
    expect(renderKnowledgeContext(run("I'm craving Coco Pops.").context!)).toContain("adapt it with a safe alternative or skip it")
  })
})

describe("determinism, trace and latency", () => {
  it("same corpus + query gives identical output", () => {
    const stable = (r: ReturnType<typeof run>) => JSON.stringify(r.context, (k, v) => (k === "latencyMs" ? 0 : v))
    for (const message of MESSAGES) expect(stable(run(message))).toBe(stable(run(message)))
  })

  it("the trace carries only ids, counts and a structural summary", () => {
    const { trace } = run("I'm craving fried chicken while cutting.")
    expect(Object.keys(trace!).sort()).toEqual(
      ["candidateCount", "categories", "companionChunkIds", "contextCharacters", "fallbackUsed", "filteredCount", "latencyMs", "primaryChunkCount", "querySummary", "reason", "retrievalTriggered", "selectedChunkIds", "totalChunkCount", "zeroResult"].sort(),
    )
    expect(JSON.stringify(trace)).not.toContain("craving fried chicken")
    expect(trace).toMatchObject({ retrievalTriggered: true, reason: "CRAVING", fallbackUsed: false, zeroResult: false, candidateCount: index.items.length })
    expect(trace!.selectedChunkIds.length).toBe(trace!.primaryChunkCount)
  })

  it("is cheap: average retrieval stays far below 50ms", () => {
    const runs = 100
    const started = performance.now()
    for (let i = 0; i < runs; i++) run(MESSAGES[i % MESSAGES.length])
    expect((performance.now() - started) / runs).toBeLessThan(50)
  })
})

describe("graceful failure", () => {
  const need = { needed: true, reason: "CRAVING", confidence: "HIGH" } as const
  const input = { need, message: "I'm craving Coco Pops.", goal: "fat_loss", timezone: "Asia/Singapore" }

  it("returns null and logs a fallback trace when scoring throws on a malformed chunk", async () => {
    const broken = buildKnowledgeIndex(loadKnowledgeChunks())
    broken.items[0] = { ...broken.items[0], chunk: undefined as never }
    const log = vi.fn<(t: NutritionRetrievalTrace) => void>()
    await expect(getOptionalNutritionKnowledgeContext(input, { index: broken, log })).resolves.toBeNull()
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ fallbackUsed: true, zeroResult: true }))
  })

  it("returns null without searching when the gate says knowledge is not needed", async () => {
    const log = vi.fn()
    await expect(getOptionalNutritionKnowledgeContext({ ...input, need: { needed: false, reason: "NOT_NEEDED", confidence: "HIGH" } }, { index, log })).resolves.toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it("returns a context on the happy path", async () => {
    const context = await getOptionalNutritionKnowledgeContext(input, { index, log: () => {} })
    expect(context?.chunks.length).toBeGreaterThan(0)
  })
})
