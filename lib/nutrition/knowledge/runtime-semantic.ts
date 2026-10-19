import "server-only"

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"

import { getOpenAiApiKey, isOpenAiConfigured, OPENAI_CHAT_BASE_URL } from "@/lib/dante-core/openai/config"

import { filterEligible } from "./filter"
import type { HybridConfig } from "./hybrid"
import { chunkEmbedText, queryEmbedText } from "./semantic-rerank"
import { R3_CONFIG, R3F_CONFIG, type ScoreConfig } from "./score"
import type { IndexedKnowledgeChunk, NutritionKnowledgeQuery } from "./types"

/**
 * N1.6.3-R3-H2: runtime activation of the sealed R3-H retriever. Everything async lives here; `retrieveKnowledge` stays synchronous.
 * The only network call is ONE query embedding per retrieval turn (raw current message, nothing else). Corpus vectors are
 * precomputed (never embedded per request). Any problem (not configured, timeout, API error, malformed / wrong-size vector,
 * missing or stale corpus vector) yields `fallback` and the caller runs plain R3 - never a partial hybrid.
 */

export const EMBED_MODEL = "text-embedding-3-small"
export const EMBED_DIMS = 512
/** One attempt, no retries. Observed query embedding ~205 ms average. */
export const QUERY_EMBED_TIMEOUT_MS = 1500

export type RetrievalMode = "R3" | "R3_H"
/** Server-side switch only. Default R3_H (activated); NUTRITION_RETRIEVAL_CONFIG=R3 is the kill switch. */
export const retrievalModeFromEnv = (env: Record<string, string | undefined> = process.env): RetrievalMode => (env.NUTRITION_RETRIEVAL_CONFIG?.trim().toUpperCase() === "R3" ? "R3" : "R3_H")

/** The frozen R3-H configuration (sealed v4). `embed` is bound per request. */
export const R3H_FROZEN = {
  semantic: { mode: "blend", k: 12, query: "raw", corpus: "titled", alpha: 0.4, beta: 0.6 },
  docPrior: 0.3,
  protect: { minDocRatio: 1, minSectionRatio: 1, max: 0, goalDocument: true },
} as const

export function buildR3hConfig(embed: (text: string) => ArrayLike<number> | undefined, onSkip?: () => void): ScoreConfig {
  const hybrid: HybridConfig = {
    doc: R3F_CONFIG.hier!,
    semantic: { ...R3H_FROZEN.semantic, embed, onSkip },
    mode: "prior",
    docPrior: R3H_FROZEN.docPrior,
    protect: { ...R3H_FROZEN.protect },
  }
  return { ...R3_CONFIG, hybrid }
}

// ---------- corpus vectors ----------

export const CORPUS_VECTORS_PATH = path.join(process.cwd(), "lib", "nutrition", "knowledge", "vectors", "r3h-corpus.json")
/** sha1 over model:dims:exact text: any corpus / representation edit changes the key, so a stale vector can only miss. */
export const embedKey = (text: string) => createHash("sha1").update(`${EMBED_MODEL}:${EMBED_DIMS}:${text}`).digest("hex").slice(0, 20)

type CorpusFile = { meta: { model: string; dims: number }; ids: Record<string, string>; vectors: Record<string, string> }
export type CorpusVectors = { lookup: (text: string) => Float32Array | undefined; ids: Map<string, string>; size: number }

const finiteVector = (v: ArrayLike<number>) => v.length === EMBED_DIMS && Array.from(v as ArrayLike<number>).every(Number.isFinite)

/** Parses + validates the file; returns null (never throws) when it is unusable. Invalid entries are dropped, not repaired. */
export function parseCorpusVectors(raw: string): CorpusVectors | null {
  try {
    const file = JSON.parse(raw) as CorpusFile
    if (file.meta?.model !== EMBED_MODEL || file.meta?.dims !== EMBED_DIMS) return null
    const vecs = new Map<string, Float32Array>()
    for (const [key, b64] of Object.entries(file.vectors ?? {})) {
      const buf = Buffer.from(b64, "base64")
      if (buf.byteLength !== EMBED_DIMS * 4) continue
      const v = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
      if (finiteVector(v)) vecs.set(key, v)
    }
    return { lookup: (text) => vecs.get(embedKey(text)), ids: new Map(Object.entries(file.ids ?? {})), size: vecs.size }
  } catch {
    return null
  }
}

let corpusCache: CorpusVectors | null | undefined
export function getCorpusVectors(): CorpusVectors | null {
  if (corpusCache === undefined) {
    try {
      corpusCache = parseCorpusVectors(readFileSync(CORPUS_VECTORS_PATH, "utf8"))
    } catch {
      corpusCache = null
    }
  }
  return corpusCache
}

/** Every eligible chunk must have a vector whose recorded id->hash matches the live chunk text. Anything else = corpus changed = no semantic. */
export function corpusCovers(vectors: CorpusVectors, items: IndexedKnowledgeChunk[]): boolean {
  return filterEligible(items).every(({ chunk }) => {
    const text = chunkEmbedText(chunk, "titled")
    return vectors.ids.get(chunk.id) === embedKey(text) && vectors.lookup(text) !== undefined
  })
}

const coverage = new WeakMap<CorpusVectors, WeakMap<IndexedKnowledgeChunk[], boolean>>()
const covered = (vectors: CorpusVectors, items: IndexedKnowledgeChunk[]) => {
  const byItems = coverage.get(vectors) ?? coverage.set(vectors, new WeakMap()).get(vectors)!
  let ok = byItems.get(items)
  if (ok === undefined) byItems.set(items, (ok = corpusCovers(vectors, items)))
  return ok
}

// ---------- query embedding ----------

export type EmbedResult = { ok: true; vector: Float32Array } | { ok: false; reason: "timeout" | "network_error" | "api_error" | "invalid_response" }

/** One bounded attempt. Never throws. Sends only `text`. */
export async function embedQuery(text: string, opts: { timeoutMs?: number; fetchImpl?: typeof fetch; apiKey?: string } = {}): Promise<EmbedResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? QUERY_EMBED_TIMEOUT_MS)
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${OPENAI_CHAT_BASE_URL}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey ?? getOpenAiApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIMS }),
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, reason: "api_error" }
    const body = (await res.json()) as { data?: Array<{ embedding?: unknown }> }
    const emb = body?.data?.length === 1 ? body.data[0]?.embedding : undefined
    if (!Array.isArray(emb) || !emb.every((x) => typeof x === "number") || !finiteVector(emb)) return { ok: false, reason: "invalid_response" }
    const norm = Math.sqrt(emb.reduce((s, x) => s + x * x, 0))
    if (Math.abs(norm - 1) > 0.05) return { ok: false, reason: "invalid_response" }
    return { ok: true, vector: Float32Array.from(emb) }
  } catch (error) {
    return { ok: false, reason: controller.signal.aborted || (error instanceof Error && error.name === "AbortError") ? "timeout" : "network_error" }
  } finally {
    clearTimeout(timer)
  }
}

// ---------- activation ----------

export type SemanticDiagnostics = {
  activeRetrievalConfig: "R3" | "R3_H"
  semanticRerankAttempted: boolean
  semanticRerankSucceeded: boolean
  semanticRerankFallbackReason?: string
  embeddingLatencyMs?: number
}

export type SemanticDeps = {
  mode?: RetrievalMode
  configured?: () => boolean
  embed?: (text: string) => Promise<EmbedResult>
  corpus?: CorpusVectors | null
}

/**
 * Returns the config to retrieve with plus (after retrieval) a way to learn whether the rerank really ran.
 * `config` is R3_CONFIG whenever semantic is unavailable. Never throws.
 */
export async function prepareRetrievalConfig(query: NutritionKnowledgeQuery, items: IndexedKnowledgeChunk[], deps: SemanticDeps = {}) {
  const diag: SemanticDiagnostics = { activeRetrievalConfig: "R3", semanticRerankAttempted: false, semanticRerankSucceeded: false }
  const fallback = (reason: string) => ({ config: R3_CONFIG, diag: { ...diag, semanticRerankFallbackReason: reason }, finish: () => undefined })
  try {
    if ((deps.mode ?? retrievalModeFromEnv()) === "R3") return { config: R3_CONFIG, diag, finish: () => undefined }
    if (!(deps.configured ?? isOpenAiConfigured)()) return fallback("not_configured")
    const corpus = deps.corpus === undefined ? getCorpusVectors() : deps.corpus
    if (!corpus) return fallback("corpus_vectors_unavailable")
    if (!covered(corpus, items)) return fallback("corpus_vectors_stale")
    const qText = queryEmbedText(query, "raw")
    if (!qText.trim()) return fallback("empty_query")

    diag.semanticRerankAttempted = true
    const started = performance.now()
    const res = await (deps.embed ?? ((t: string) => embedQuery(t)))(qText)
    diag.embeddingLatencyMs = Math.round(performance.now() - started)
    if (!res.ok) return { config: R3_CONFIG, diag: { ...diag, semanticRerankFallbackReason: res.reason }, finish: () => undefined }

    let skipped = false
    const config = buildR3hConfig((text) => (text === qText ? res.vector : corpus.lookup(text)), () => void (skipped = true))
    diag.activeRetrievalConfig = "R3_H"
    // finish() is called after the synchronous retrieval: a skipped rerank inside it means plain R3 was used.
    const finish = () => {
      diag.semanticRerankSucceeded = !skipped
      if (skipped) {
        diag.activeRetrievalConfig = "R3"
        diag.semanticRerankFallbackReason = "missing_vector"
      }
    }
    return { config, diag, finish }
  } catch {
    return fallback("unexpected_error")
  }
}
