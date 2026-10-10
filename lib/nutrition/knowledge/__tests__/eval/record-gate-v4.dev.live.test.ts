import { describe, expect, it } from "vitest"

import { CASES_V4_DEV } from "./cases-v4-dev"
import { DEV_RECORDING_PATH_V4, recordLayer2V4 } from "./run-eval-v4"

/**
 * LIVE, opt-in, DEV only. Records the real Layer-2 (semantic gate classifier) reply for every v4 DEV case Layer 1 marks
 * uncertain, so the offline suite replays the layered gate deterministically. Classifier calls only.
 *
 *   NUTRITION_LIVE_EVAL=1 -> semantic-gate-v4-dev.recorded.json
 */
describe.skipIf(process.env.NUTRITION_LIVE_EVAL !== "1")("Layer-2 semantic gate: record live answers (v4 dev)", () => {
  it("records", async () => {
    const calls = await recordLayer2V4(CASES_V4_DEV, DEV_RECORDING_PATH_V4)
    expect(calls).toBeGreaterThanOrEqual(0)
    console.log("RECORDED v4 dev, calls", calls)
  }, 900_000)
})
