import { describe, expect, it, vi } from "vitest"

import { decideNutritionKnowledgeNeed } from "../need"
import { getOptionalNutritionKnowledgeContext, retrieveKnowledge } from "../retrieve"
import {
  buildR3hConfig,
  corpusCovers,
  embedQuery,
  getCorpusVectors,
  parseCorpusVectors,
  R3H_FROZEN,
  retrievalModeFromEnv,
  type EmbedResult,
  type SemanticDeps,
} from "../runtime-semantic"
import { R3_CONFIG } from "../score"
import { queryEmbedText } from "../semantic-rerank"
import { CASES_V4_DEV } from "./eval/cases-v4-dev"
import { openStore } from "./eval/embed-store"
import { evaluateV4 } from "./eval/run-eval-v4"
import { g4, R3H_CONFIG } from "./eval/semantic-lab"
import { index } from "./helpers"

const store = openStore()
const corpus = getCorpusVectors()!
const MSG = "I keep craving something crunchy and salty but I am cutting"
const unit = (n = 512): Float32Array => Float32Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0))
const ok = (v = unit()): EmbedResult => ({ ok: true, vector: v })
const fakeEmbed = (r: EmbedResult) => vi.fn<(text: string) => Promise<EmbedResult>>(async () => r)
const deps = (over: Partial<SemanticDeps> = {}): SemanticDeps => ({ mode: "R3_H", configured: () => true, corpus, ...over })
type Ctx = Awaited<ReturnType<typeof getOptionalNutritionKnowledgeContext>>
const ids = (c: Ctx) => c?.chunks.map((x) => `${x.sourceType}:${x.id}`)
const run = async (d: SemanticDeps, message = MSG) => {
  const logs: Array<Record<string, unknown>> = []
  const context = await getOptionalNutritionKnowledgeContext(
    { message, need: decideNutritionKnowledgeNeed({ message }), goal: "fat_loss", timezone: "Asia/Singapore" },
    { index, log: () => undefined, semantic: d, logSemantic: (x) => void logs.push(x) },
  )
  return { context, diag: logs[0] as Record<string, unknown> | undefined }
}
const r3 = async () => ids((await run(deps({ mode: "R3" }))).context)

describe("R3-H2 runtime activation", () => {
  it("gate approves the test message (otherwise the tests below prove nothing)", async () => {
    expect(decideNutritionKnowledgeNeed({ message: MSG }).needed).toBe(true)
    expect((await r3())?.length).toBeGreaterThan(0)
  })

  it("corpus vectors: complete for the live corpus, validated, model/dims pinned", () => {
    expect(corpus).not.toBeNull()
    expect(corpusCovers(corpus, index.items)).toBe(true)
    expect(parseCorpusVectors(JSON.stringify({ meta: { model: "other", dims: 512 }, ids: {}, vectors: {} }))).toBeNull()
    expect(parseCorpusVectors(JSON.stringify({ meta: { model: "text-embedding-3-small", dims: 1536 }, ids: {}, vectors: {} }))).toBeNull()
    expect(parseCorpusVectors("not json")).toBeNull()
  })

  it("frozen config is exactly the sealed R3-H lab config", () => {
    const live = buildR3hConfig(store.lookup)
    expect(R3H_FROZEN.semantic).toMatchObject({ k: 12, alpha: 0.4, beta: 0.6, query: "raw", corpus: "titled", mode: "blend" })
    const strip = (c: typeof live) => JSON.parse(JSON.stringify({ ...c, hybrid: { ...c.hybrid, semantic: { ...c.hybrid!.semantic, embed: 0, onSkip: 0 } } }))
    expect(strip(live)).toEqual(strip(R3H_CONFIG))
    expect(live.hybrid!.docPrior).toBe(0.3)
  })

  it("A. runtime vectors reproduce the sealed R3-H selection on every DEV query", () => {
    let compared = 0
    for (const r of evaluateV4(CASES_V4_DEV, g4, R3_CONFIG).results.filter((x) => x.fired && x.query)) {
      const qText = queryEmbedText(r.query!, "raw")
      const qv = store.lookup(qText)
      if (!qv) continue
      const cfg = buildR3hConfig((t) => (t === qText ? qv : corpus.lookup(t)))
      const need = { needed: true, reason: r.reason, confidence: "LOW" } as never
      const live = retrieveKnowledge(index, r.query!, need, cfg).context?.chunks.map((c) => c.id)
      const sealed = retrieveKnowledge(index, r.query!, need, R3H_CONFIG).context?.chunks.map((c) => c.id)
      expect(live).toEqual(sealed)
      compared++
    }
    expect(compared).toBeGreaterThan(40)
  })

  it("A. live path: exactly one embedding call on the raw message, R3-H reported, output contract intact", async () => {
    const embed = fakeEmbed(ok())
    const { context, diag } = await run(deps({ embed }))
    expect(embed).toHaveBeenCalledTimes(1)
    expect(embed.mock.calls[0][0]).toBe(MSG)
    expect(diag).toMatchObject({ semanticRerankAttempted: true, semanticRerankSucceeded: true, activeRetrievalConfig: "R3_H" })
    expect(diag!.embeddingLatencyMs).toBeTypeOf("number")
    expect(JSON.stringify(diag)).not.toContain("crunchy")
    const base = (await run(deps({ mode: "R3" }))).context!
    expect(Object.keys(context!).sort()).toEqual(Object.keys(base).sort())
    expect(Object.keys(context!.chunks[0]).sort()).toEqual(Object.keys(base.chunks[0]).sort())
    expect(Object.keys(context!.retrievalTrace).sort()).toEqual(Object.keys(base.retrievalTrace).sort())
  })

  it.each([
    ["B. timeout", "timeout"],
    ["C. API error", "api_error"],
    ["network error", "network_error"],
    ["D. invalid response", "invalid_response"],
  ] as const)("%s -> R3 fallback identical to R3", async (_n, reason) => {
    const { context, diag } = await run(deps({ embed: fakeEmbed({ ok: false, reason }) }))
    expect(ids(context)).toEqual(await r3())
    expect(diag).toMatchObject({ semanticRerankAttempted: true, semanticRerankSucceeded: false, semanticRerankFallbackReason: reason, activeRetrievalConfig: "R3" })
  })

  it("a throwing embedder never crashes retrieval", async () => {
    const { context, diag } = await run(deps({ embed: vi.fn(async () => { throw new Error("boom") }) }))
    expect(ids(context)).toEqual(await r3())
    expect(diag!.semanticRerankSucceeded).toBe(false)
  })

  it("D/E. embedQuery accepts a valid vector and rejects wrong-size, empty, non-numeric, non-finite, non-unit and error responses", async () => {
    const reply = (embedding: unknown, status = 200) => (async () => new Response(JSON.stringify({ data: [{ embedding }] }), { status })) as unknown as typeof fetch
    const call = (f: typeof fetch) => embedQuery("q", { fetchImpl: f, apiKey: "k", timeoutMs: 200 })
    const bad = { ok: false, reason: "invalid_response" }
    expect(await call(reply(Array.from(unit())))).toMatchObject({ ok: true })
    expect(await call(reply(Array.from(unit(256))))).toEqual(bad)
    expect(await call(reply([]))).toEqual(bad)
    expect(await call(reply(Array.from({ length: 512 }, () => "x")))).toEqual(bad)
    expect(await call(reply(Array.from({ length: 512 }, () => null)))).toEqual(bad)
    expect(await call(reply(Array.from({ length: 512 }, () => 1)))).toEqual(bad)
    expect(await call((async () => new Response("{}", { status: 200 })) as unknown as typeof fetch)).toEqual(bad)
    expect(await call((async () => new Response("{}", { status: 500 })) as unknown as typeof fetch)).toEqual({ ok: false, reason: "api_error" })
    expect(await call((async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch)).toEqual({ ok: false, reason: "network_error" })
  })

  it("timeout: a hung provider is aborted at the bound; the turn continues with R3; no unhandled rejection", async () => {
    const hung = ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    const started = performance.now()
    const { context, diag } = await run(deps({ embed: (t) => embedQuery(t, { fetchImpl: hung, apiKey: "k", timeoutMs: 50 }) }))
    expect(performance.now() - started).toBeLessThan(1000)
    expect(diag!.semanticRerankFallbackReason).toBe("timeout")
    expect(ids(context)).toEqual(await r3())
    await new Promise((r) => setTimeout(r, 20))
    process.off("unhandledRejection", unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it("F. missing or stale corpus vectors -> no embedding call, full R3", async () => {
    const embed = fakeEmbed(ok())
    const empty = parseCorpusVectors(JSON.stringify({ meta: { model: "text-embedding-3-small", dims: 512 }, ids: {}, vectors: {} }))
    for (const c of [null, empty]) {
      const { context, diag } = await run(deps({ embed, corpus: c }))
      expect(ids(context)).toEqual(await r3())
      expect(diag).toMatchObject({ semanticRerankAttempted: false, activeRetrievalConfig: "R3" })
      expect(diag!.semanticRerankFallbackReason).toMatch(/corpus_vectors_/)
    }
    expect(embed).not.toHaveBeenCalled()
  })

  it("F. a content-hash mismatch for one chunk (corpus edited) disables semantic entirely, never reuses the stale vector", async () => {
    const ids0 = new Map(corpus.ids)
    ids0.set([...ids0.keys()][0], "deadbeef")
    const embed = fakeEmbed(ok())
    const { context, diag } = await run(deps({ embed, corpus: { ...corpus, ids: ids0 } }))
    expect(embed).not.toHaveBeenCalled()
    expect(diag!.semanticRerankFallbackReason).toBe("corpus_vectors_stale")
    expect(ids(context)).toEqual(await r3())
  })

  it("F. a vector missing from the pool at rerank time -> plain R3, never a half hybrid", async () => {
    // Coverage passes (ids/lookup complete) but the rerank-time lookup misses: simulated by a corpus whose lookup is complete for coverage then drops afterwards.
    let covered = false
    const flaky = { ...corpus, lookup: (t: string) => (covered ? undefined : corpus.lookup(t)) }
    const embed = vi.fn(async () => { covered = true; return ok() })
    const { context, diag } = await run(deps({ embed, corpus: flaky }))
    expect(diag).toMatchObject({ semanticRerankAttempted: true, semanticRerankSucceeded: false, semanticRerankFallbackReason: "missing_vector", activeRetrievalConfig: "R3" })
    expect(ids(context)).toEqual(await r3())
  })

  it("G. R3 mode / unconfigured never call the embedder and equal plain R3", async () => {
    const embed = fakeEmbed(ok())
    const viaMode = await run(deps({ embed, mode: "R3" }))
    const viaKey = await run(deps({ embed, configured: () => false }))
    expect(embed).not.toHaveBeenCalled()
    const direct = retrieveKnowledge(index, viaMode.context!.query, decideNutritionKnowledgeNeed({ message: MSG }), R3_CONFIG).context
    expect(ids(viaMode.context)).toEqual(ids(direct))
    expect(ids(viaKey.context)).toEqual(ids(direct))
    expect(viaKey.diag!.semanticRerankFallbackReason).toBe("not_configured")
  })

  it("H/I. gate says no retrieval -> no embedding call and no diagnostics", async () => {
    const embed = fakeEmbed(ok())
    for (const message of ["log 150g grilled chicken breast for lunch", "add 20g more rice", "hello"]) {
      const n = decideNutritionKnowledgeNeed({ message })
      expect(n.needed).toBe(false)
      const { context, diag } = await run(deps({ embed }), message)
      expect(context).toBeNull()
      expect(diag).toBeUndefined()
    }
    expect(embed).not.toHaveBeenCalled()
  })

  it("mode switch is server-env only; default R3_H, NUTRITION_RETRIEVAL_CONFIG=R3 is the kill switch", () => {
    expect(retrievalModeFromEnv({})).toBe("R3_H")
    expect(retrievalModeFromEnv({ NUTRITION_RETRIEVAL_CONFIG: "r3" })).toBe("R3")
    expect(retrievalModeFromEnv({ NUTRITION_RETRIEVAL_CONFIG: "garbage" })).toBe("R3_H")
  })
})
