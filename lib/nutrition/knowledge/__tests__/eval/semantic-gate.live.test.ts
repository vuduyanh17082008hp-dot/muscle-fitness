import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"

import { decideNutritionKnowledgeNeed } from "../../need"
import { buildSemanticGatePrompt, resolveUncertainNeed } from "../../semantic-gate"
import { CASES } from "./cases"
import { CASES_V2 } from "./cases-v2"

/**
 * LIVE, opt-in (NUTRITION_LIVE_EVAL=1). Records the real Layer-2 answers for every v2 case that Layer 1 marks
 * uncertain (v2 and the historical v1 set) into semantic-gate-v2.recorded.json (raw model reply + prompt hash), so the offline suite can replay
 * the full layered gate deterministically. Normal `npm test` never calls OpenAI.
 *
 *   NUTRITION_LIVE_EVAL=1 NUTRITION_LIVE_SPLIT=dev      -> record dev (used to refine the prompt)
 *   NUTRITION_LIVE_EVAL=1 NUTRITION_LIVE_SPLIT=heldout  -> record held-out ONCE per prompt version
 */
const LIVE = process.env.NUTRITION_LIVE_EVAL === "1"
export const RECORDING = join(__dirname, "semantic-gate-v2.recorded.json")
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12)

describe.skipIf(!LIVE)("Layer-2 semantic gate: record live answers (v2)", () => {
  it("records", async () => {
    if (!process.env.OPENAI_API_KEY) {
      const key = readFileSync(".env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "")
      if (key) process.env.OPENAI_API_KEY = key
    }
    expect(process.env.OPENAI_API_KEY).toBeTruthy()
    const split = process.env.NUTRITION_LIVE_SPLIT ?? "dev"
    const store: Record<string, { promptHash: string; reply: string | null; ms: number }> = existsSync(RECORDING) ? JSON.parse(readFileSync(RECORDING, "utf8")) : {}
    let calls = 0
    for (const c of [...CASES_V2, ...CASES].filter((x) => x.split === split)) {
      const l1 = decideNutritionKnowledgeNeed({ message: c.message, intent: c.intent })
      if (!l1.uncertain) continue
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
    writeFileSync(RECORDING, JSON.stringify(store, null, 1))
    console.log("RECORDED", split, "calls", calls)
  }, 600_000)
})
