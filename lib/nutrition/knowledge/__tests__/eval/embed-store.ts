import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * N1.6.3-R3-G embedding store (test-only). Vectors are precomputed from the real embeddings API and recorded, so every
 * experiment replays offline and deterministically. Key = sha1(model:dims:exact input text): any change to a chunk's text
 * (corpus edit) or to the query/corpus representation produces a different key, so a stale vector can never be returned,
 * only a miss. Vectors are stored as base64 float32.
 */
export const EMBED_MODEL = "text-embedding-3-small"
export const EMBED_DIMS = 512
export const EMBED_STORE_PATH = join(__dirname, "semantic-embeddings-r3g.recorded.json")

type Stored = { meta: { model: string; dims: number; latencyMs?: { n: number; avg: number; p95: number; max: number; tokensApprox: number } }; vectors: Record<string, string> }
export const embedKey = (text: string) => createHash("sha1").update(`${EMBED_MODEL}:${EMBED_DIMS}:${text}`).digest("hex").slice(0, 20)

const decode = (b64: string) => {
  const buf = Buffer.from(b64, "base64")
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}
const encode = (v: ArrayLike<number>) => Buffer.from(Float32Array.from(v).buffer).toString("base64")

export function readStore(): Stored {
  return existsSync(EMBED_STORE_PATH) ? JSON.parse(readFileSync(EMBED_STORE_PATH, "utf8")) : { meta: { model: EMBED_MODEL, dims: EMBED_DIMS }, vectors: {} }
}

/** Lookup over the recorded store. `missing` collects every text asked for and not stored (used by the recorder and as a "no silent misses" check). */
export function openStore() {
  const started = performance.now()
  const store = readStore()
  const cache = new Map<string, Float32Array>()
  const missing = new Set<string>()
  const loadMs = performance.now() - started
  return {
    loadMs,
    size: Object.keys(store.vectors).length,
    meta: store.meta,
    missing,
    lookup(text: string): Float32Array | undefined {
      const key = embedKey(text)
      const hit = cache.get(key)
      if (hit) return hit
      const raw = store.vectors[key]
      if (!raw) {
        missing.add(text)
        return undefined
      }
      const v = decode(raw)
      cache.set(key, v)
      return v
    },
  }
}

function loadKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  const key = readFileSync(".env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "")
  if (!key) throw new Error("OPENAI_API_KEY missing")
  return key
}

async function callEmbeddings(input: string[], apiKey: string): Promise<{ vectors: number[][]; ms: number }> {
  const started = performance.now()
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input, dimensions: EMBED_DIMS }),
  })
  const body = (await res.json()) as { data?: Array<{ embedding: number[]; index: number }>; error?: { message?: string } }
  if (!res.ok || !body.data) throw new Error(`embeddings ${res.status}: ${body.error?.message ?? "no body"}`)
  return { vectors: [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding), ms: performance.now() - started }
}

/** LIVE: embeds every text not already stored (batches of 96), merges into the store file. Returns the number of texts embedded. */
export async function recordEmbeddings(texts: Iterable<string>): Promise<number> {
  const store = readStore()
  const todo = [...new Set(texts)].filter((t) => !store.vectors[embedKey(t)])
  const apiKey = loadKey()
  for (let i = 0; i < todo.length; i += 96) {
    const batch = todo.slice(i, i + 96)
    const { vectors } = await callEmbeddings(batch, apiKey)
    batch.forEach((t, n) => (store.vectors[embedKey(t)] = encode(vectors[n])))
  }
  writeFileSync(EMBED_STORE_PATH, JSON.stringify(store))
  return todo.length
}

/** LIVE: single-query call latency (the per-request cost of embedding the user query), `n` sequential calls over `queries`. */
export async function measureQueryLatency(queries: string[], n = 30) {
  const apiKey = loadKey()
  const ms: number[] = []
  for (const q of queries.slice(0, n)) ms.push((await callEmbeddings([q], apiKey)).ms)
  const s = [...ms].sort((a, b) => a - b)
  const latency = { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p95: s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)], max: s[s.length - 1], tokensApprox: Math.round(queries.slice(0, n).reduce((a, q) => a + q.length / 4, 0) / ms.length) }
  const store = readStore()
  store.meta.latencyMs = latency
  writeFileSync(EMBED_STORE_PATH, JSON.stringify(store))
  return latency
}
