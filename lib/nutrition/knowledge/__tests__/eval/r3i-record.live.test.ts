import { describe, expect, it } from "vitest"

import { chunkEmbedText } from "../../semantic-rerank"
import { openStore, recordEmbeddings } from "./embed-store"
import { index } from "./run-eval-v4"

/** LIVE, opt-in (R3I_RECORD=1): embeds the titled and body chunk texts of the CURRENT corpus that are not yet in the recorded store (R3-I corpus edits). Embeddings API only. */
describe.skipIf(process.env.R3I_RECORD !== "1")("R3-I: record changed corpus chunk vectors", () => {
  it("records", async () => {
    const n = await recordEmbeddings(index.items.flatMap((i) => [chunkEmbedText(i.chunk, "titled"), chunkEmbedText(i.chunk, "body")]))
    console.log("RECORDED new chunk vectors:", n)
    expect(openStore().size).toBeGreaterThan(0)
  }, 300_000)
})
