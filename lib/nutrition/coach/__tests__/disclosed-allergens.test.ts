import { describe, expect, it, vi } from "vitest"

import { buildDisclosureSignals, toUserScopeRef } from "@/lib/intelligence/dante-runtime"
import { buildContextWorkingSet } from "@/lib/intelligence/performance-core"
import type { CoachSignal } from "@/lib/intelligence/coordination"
import { runCoachAction } from "../service"
import { makeCtx } from "./fixtures"

// test/setup.ts mocks this module for every other test (their fakes have no coach_signals table).
vi.unmock("@/lib/nutrition/coach/disclosed-allergens")
const { loadDisclosedAllergens } = await import("../disclosed-allergens")

const USER = "00000000-0000-4000-8000-0000000000f1"
const NOW = new Date("2026-10-18T10:00:00.000Z")

const disclosed = (message: string, source: "DANTE" | "GEMMA" = "DANTE") =>
  buildDisclosureSignals({ userScope: toUserScopeRef(USER), context: buildContextWorkingSet({ message }), source }, NOW)

/** The PostgREST row shape coach_signals returns for a signal. */
const row = (s: CoachSignal) => ({
  signal_id: s.id, schema_version: s.schemaVersion, idempotency_key: s.idempotencyKey, producer: s.sourceCoach, source_domain: s.sourceDomain,
  signal_type: s.signalType, status: s.status, lifecycle: s.lifecycle, uncertainty: s.uncertainty, identifiability: s.identifiability,
  privacy_class: s.privacyClass, risk_flag: null, evidence_refs: s.evidenceRefs, provenance: s.provenance, implications: s.implications,
  supersedes: [], superseded_by: null, valid_from: s.validFrom, valid_until: s.validUntil,
})

function client(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const method of ["select", "eq", "contains", "in", "lte", "gt"]) chain[method] = () => chain
  chain.order = async () => result
  return { from: (table: string) => (table === "coach_signals" ? chain : null) } as never
}

describe("chat-disclosed allergies reach the deterministic meal surfaces (hackathon repair F-01)", () => {
  it("maps active allergy disclosures from either coach to engine guard terms; other disclosures add nothing", async () => {
    const rows = [...disclosed("I'm allergic to fish, my throat swelled up"), ...disclosed("I'm allergic to peanuts", "GEMMA"), ...disclosed("I eat 700 calories a day")].map(row)
    expect((await loadDisclosedAllergens(client({ data: rows, error: null }), USER, NOW))?.sort()).toEqual(["fish", "nuts"])
  })

  it("fails closed: a failed read is null, never 'no allergies'", async () => {
    expect(await loadDisclosedAllergens(client({ data: null, error: { message: "boom" } }), USER, NOW)).toBeNull()
  })

  it("Suggested for you never offers fish once fish is a guard term (cards, not just chat)", () => {
    const names = (allergies: string[]) => {
      const result = runCoachAction(makeCtx({ allergies, caloriesRemaining: 800, proteinRemaining: 70 }), { action: "suggest" })
      if (!("drafts" in result) || !result.drafts) return []
      return result.drafts.flatMap((draft) => [draft.name, ...draft.ingredients.map((item) => item.ingredientId)]).join(" ").toLowerCase()
    }
    expect(names(["fish"])).not.toMatch(/tuna|white_fish|fish/)
    expect(names(["nuts"])).not.toMatch(/peanut|almond/)
  })
})
