import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { decideNutritionKnowledgeNeed } from "../need"
import { getOptionalNutritionKnowledgeContext } from "../retrieve"
import { embedQuery, type EmbedResult } from "../runtime-semantic"
import { index } from "./helpers"

/** LIVE, opt-in (R3H_LIVE=1): real OpenAI embeddings calls only (no chat model, no hosted data). Prints latency / token figures. */
const key = () => process.env.OPENAI_API_KEY ?? readFileSync(".env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)![1].trim().replace(/^["']|["']$/g, "")
const MESSAGES = [
  "I keep craving something crunchy and salty but I am cutting",
  "how do I make chicken rice fit my fat loss goal",
  "my salad is so bland, how do I fix it",
  "should I cut sugar out completely?",
  "do I eat more on leg day?",
  "ăn gì để no lâu khi đang giảm mỡ",
  "can't recall what was in that wrap",
  "I feel guilty after a big dinner",
]
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(0.95 * xs.length) - 1)]
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe.skipIf(process.env.R3H_LIVE !== "1")("R3-H2 live smoke", () => {
  it("retrieval query -> embedding -> R3-H; bad key -> R3 fallback; non-retrieval -> no call", { timeout: 120_000 }, async () => {
    const apiKey = key()
    let calls = 0
    const counted = (k: string) => async (t: string): Promise<EmbedResult> => (calls++, embedQuery(t, { apiKey: k }))
    const run = async (message: string, embed: (t: string) => Promise<EmbedResult>) => {
      const logs: Array<Record<string, unknown>> = []
      const t0 = performance.now()
      const context = await getOptionalNutritionKnowledgeContext({ message, need: decideNutritionKnowledgeNeed({ message }), goal: "fat_loss", timezone: "Asia/Singapore" }, { index, log: () => undefined, semantic: { mode: "R3_H", configured: () => true, embed }, logSemantic: (d) => void logs.push(d) })
      return { context, diag: logs[0], totalMs: performance.now() - t0 }
    }

    const emb: number[] = [], total: number[] = [], rerank: number[] = []
    let succeeded = 0, attempted = 0, tokens = 0
    for (const m of MESSAGES) {
      calls = 0
      const r = await run(m, counted(apiKey))
      if (!r.diag) continue
      attempted++
      expect(calls).toBe(1)
      console.log("DIAG", m.slice(0, 30), JSON.stringify(r.diag))
      if (r.diag.semanticRerankSucceeded) succeeded++
      emb.push(r.diag.embeddingLatencyMs as number)
      rerank.push(r.diag.rerankLatencyMs as number)
      total.push(r.totalMs)
      tokens += Math.ceil(m.length / 4)
    }
    expect(attempted).toBeGreaterThan(3)
    expect(succeeded).toBe(attempted)

    // simulated failure: invalid key -> API error -> R3 fallback, chat continues
    const bad = await run(MESSAGES[0], counted("sk-invalid"))
    expect(bad.diag).toMatchObject({ semanticRerankSucceeded: false, semanticRerankFallbackReason: "api_error", activeRetrievalConfig: "R3" })
    expect(bad.context?.chunks.length).toBeGreaterThan(0)

    // non-retrieval message -> no call
    calls = 0
    const none = await run("log 150g grilled chicken breast for lunch", counted(apiKey))
    expect(none.context).toBeNull()
    expect(calls).toBe(0)

    console.log("R3H2_LIVE", JSON.stringify({ attempted, succeeded, embeddingMs: { avg: Math.round(avg(emb)), p95: p95(emb) }, rerankMs: { avg: +avg(rerank).toFixed(2), p95: p95(rerank) }, totalMs: { avg: Math.round(avg(total)), p95: Math.round(p95(total)) }, approxTokensPerCall: Math.round(tokens / attempted), failureFallbackMs: Math.round(bad.totalMs) }))
  })
})
