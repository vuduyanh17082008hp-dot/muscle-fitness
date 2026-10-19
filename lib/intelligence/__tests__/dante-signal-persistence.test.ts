import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

import { permittedPrivacyClasses } from "../coach-signal-store"
import { persistDanteSignals } from "../dante-signal-persistence"

describe("AI-R1E.1 wiring + privacy rank (no DB)", () => {
  const route = readFileSync(join(process.cwd(), "app/api/chatbot/route.ts"), "utf8")

  it("persists only from the post-context pass; the pre-route pass result is discarded", () => {
    // R1E.2a: post-context, and the early-exit helper (buildEarlyExitSignals only). User disclosures (and their withdrawal)
    // go through syncDisclosureSignals from this turn's working set, never the pre-route pass.
    expect(route.match(/persistDanteSignals\(/g)).toHaveLength(2)
    expect(route.match(/syncDisclosureSignals\(/g)).toHaveLength(1)
    expect(route).toMatch(/syncDisclosureSignals\(\{ userId: user\.id, source: "DANTE", context: intelligenceBrief\.context, message: userMessage,/)
    expect(route).toMatch(/persistDanteSignals\(\{[\s\S]{0,200}signals: buildEarlyExitSignals\(/)
    expect(route.match(/publishEarlyExitSignals\("/g)).toHaveLength(3)
    expect(route).toMatch(/persistDanteSignals\(\{[\s\S]{0,200}signals: runDanteIntelligence\(\{ phase: "post-context"/)
    expect(route).toContain('runDanteIntelligence({ phase: "pre-route"')
    expect(route).not.toMatch(/persistDanteSignals\([\s\S]{0,200}phase: "pre-route"/)
  })

  it("permitted privacy classes follow explicit rank, not string order", () => {
    expect(permittedPrivacyClasses("NORMAL")).toEqual(["NORMAL"])
    expect(permittedPrivacyClasses("SENSITIVE")).toEqual(["NORMAL", "SENSITIVE"])
    expect(permittedPrivacyClasses("MEDICAL")).toEqual(["NORMAL", "SENSITIVE", "MEDICAL"])
  })

  it("writes nothing and never touches the client when there are no valid ACTIVE signals", async () => {
    const getClient = vi.fn()
    await persistDanteSignals({ userId: "u", signals: [], getClient })
    expect(getClient).not.toHaveBeenCalled()
  })
})
