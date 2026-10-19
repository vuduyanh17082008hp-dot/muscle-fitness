import { writeFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { filterEligible } from "../../filter"
import { CORPUS_VECTORS_PATH, EMBED_DIMS, EMBED_MODEL, embedKey } from "../../runtime-semantic"
import { chunkEmbedText } from "../../semantic-rerank"
import { readStore } from "./embed-store"
import { index } from "./run-eval-v4"

/** Offline, opt-in: copies the already-recorded titled-chunk vectors of the CURRENT corpus into the runtime file (no API call). R3H_EXPORT=1 */
describe.skipIf(process.env.R3H_EXPORT !== "1")("export runtime corpus vectors", () => {
  it("exports", () => {
    const store = readStore()
    const ids: Record<string, string> = {}
    const vectors: Record<string, string> = {}
    for (const { chunk } of filterEligible(index.items)) {
      const key = embedKey(chunkEmbedText(chunk, "titled"))
      expect(store.vectors[key], chunk.id).toBeDefined()
      ids[chunk.id] = key
      vectors[key] = store.vectors[key]
    }
    writeFileSync(CORPUS_VECTORS_PATH, JSON.stringify({ meta: { model: EMBED_MODEL, dims: EMBED_DIMS }, ids, vectors }))
    console.log("EXPORTED", Object.keys(ids).length)
  })
})
