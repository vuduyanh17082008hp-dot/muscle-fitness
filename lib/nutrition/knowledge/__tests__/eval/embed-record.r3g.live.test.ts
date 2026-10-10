import { describe, expect, it } from "vitest"

import { measureQueryLatency, openStore, recordEmbeddings } from "./embed-store"
import { CASES_V4_DEV } from "./cases-v4-dev"
import { evaluateV4, oracleGateV4 } from "./run-eval-v4"
import { allChunkTexts, fourSuites } from "./semantic-lab"
import { R3_CONFIG } from "../../score"
import type { SemanticConfig } from "../../semantic-rerank"

/**
 * LIVE, opt-in, DEV only (R3-G). Records embeddings for every chunk (both representations) and for every query text the four DEV
 * suites ask for (raw and intent forms), then samples single-query API latency. Embeddings calls only; no chat model.
 *
 *   NUTRITION_LIVE_EVAL=1 -> semantic-embeddings-r3g.recorded.json
 */
describe.skipIf(process.env.NUTRITION_LIVE_EVAL !== "1")("R3-G: record embeddings (DEV)", () => {
  it("records", async () => {
    const asked = new Set<string>()
    for (const query of ["raw", "intent"] as const) {
      const cfg = { ...R3_CONFIG, semantic: { mode: "section", k: 12, query, corpus: "body", embed: (t: string) => (asked.add(t), undefined) } satisfies SemanticConfig }
      fourSuites(cfg)
      evaluateV4(CASES_V4_DEV, oracleGateV4, cfg) // retrieval-isolation runs build different facets (no Layer-2 hints)
    }
    const n = await recordEmbeddings([...allChunkTexts(), ...asked])
    const raw = [...asked].filter((t) => !t.includes("\ntopics: ") && !t.includes("\ngoal: ") && t.length < 400)
    const latency = await measureQueryLatency(raw)
    console.log("RECORDED embeddings", n, "queries asked", asked.size, "latency", JSON.stringify(latency))
    expect(openStore().size).toBeGreaterThan(0)
  }, 900_000)
})
