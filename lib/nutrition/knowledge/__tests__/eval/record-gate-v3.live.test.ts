import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"

import { decideNutritionKnowledgeNeed } from "../../need"
import { buildSemanticGatePrompt, resolveUncertainNeed } from "../../semantic-gate"
import { CASES_V3_DEV } from "./cases-v3-dev"
import { DEV_RECORDING_PATH, loadHeldout, readRecording, SEALED_DIR } from "./run-eval-v3"

/**
 * LIVE, opt-in. Records the real Layer-2 (semantic gate classifier) reply for every v3 case Layer 1 marks uncertain, so the
 * offline suite replays the layered gate deterministically. Classifier calls only — not the answer-quality batch.
 *
 *   NUTRITION_LIVE_EVAL=1 NUTRITION_LIVE_SPLIT=dev                                   -> semantic-gate-v3-dev.recorded.json (repo)
 *   NUTRITION_LIVE_EVAL=1 NUTRITION_LIVE_SPLIT=heldout NUTRITION_EVAL_V3_SEALED=<dir> -> <dir>/semantic-gate-v3-heldout.recorded.json
 */
const LIVE = process.env.NUTRITION_LIVE_EVAL === "1"
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12)

describe.skipIf(!LIVE)("Layer-2 semantic gate: record live answers (v3)", () => {
  it("records", async () => {
    if (!process.env.OPENAI_API_KEY) {
      const key = readFileSync(".env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "")
      if (key) process.env.OPENAI_API_KEY = key
    }
    expect(process.env.OPENAI_API_KEY).toBeTruthy()
    const heldout = process.env.NUTRITION_LIVE_SPLIT === "heldout"
    const cases = heldout ? loadHeldout()?.cases : CASES_V3_DEV
    expect(cases, "held-out needs NUTRITION_EVAL_V3_SEALED").toBeTruthy()
    const path = heldout ? join(SEALED_DIR!, "semantic-gate-v3-heldout.recorded.json") : DEV_RECORDING_PATH
    const store: Record<string, { promptHash: string; reply: string | null; ms: number }> = readRecording(path) as never
    let calls = 0
    for (const c of cases!) {
      const l1 = decideNutritionKnowledgeNeed({ message: c.message, intent: c.intent })
      if (!l1.uncertain || store[c.message]?.promptHash === hash(buildSemanticGatePrompt(c.message))) continue
      const started = performance.now()
      let reply: string | null = null
      await resolveUncertainNeed(c.message, l1, {
        log: () => {},
        call: async (prompt) => {
          calls++
          const r = await callOpenAiWithFallback(prompt)
          reply = r?.reply ?? null
          return r
        },
      })
      store[c.message] = { promptHash: hash(buildSemanticGatePrompt(c.message)), reply, ms: Math.round(performance.now() - started) }
    }
    writeFileSync(path, JSON.stringify(store, null, 1))
    console.log("RECORDED", heldout ? "heldout" : "dev", "calls", calls)
  }, 600_000)
})
