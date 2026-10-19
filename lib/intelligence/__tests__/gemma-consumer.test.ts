import { describe, expect, it } from "vitest"

import type { SupabaseClient } from "@supabase/supabase-js"

import { COORDINATION_SCHEMA_VERSION, type CoachSignal } from "../coordination"
import { toUserScopeRef } from "../dante-runtime"
import { permittedPrivacyClasses } from "../coach-signal-store"
import { EMPTY_COORDINATION, asksForMealSuggestion, coordinationNote, interpretSignalsForGemma, loadGemmaCoordination, LOW_BUDGET_KCAL } from "../gemma-consumer"

const NOW = new Date("2026-10-12T08:00:00Z")
const USER = "user-1"
const scope = toUserScopeRef(USER)

const sig = (o: Partial<CoachSignal> & { value?: string; target?: "NUTRITION" | "TRAINING" } = {}): CoachSignal => ({
  id: o.id ?? "sig:t:1", schemaVersion: COORDINATION_SCHEMA_VERSION, idempotencyKey: o.idempotencyKey ?? "k:1", userScope: o.userScope ?? scope,
  privacyClass: o.privacyClass ?? "NORMAL", lifecycle: o.lifecycle ?? "ACTIVE", sourceCoach: "DANTE", sourceDomain: o.sourceDomain ?? "RECOVERY",
  signalType: o.signalType ?? "LOW_RECOVERY", status: "CROSS_COACH_VERIFIED", evidenceRefs: ["ev:x"], uncertainty: "MODERATE_SUPPORT",
  identifiability: "PARTIALLY_IDENTIFIED", provenance: ["p"], validFrom: o.validFrom ?? "2026-10-12T07:00:00Z", validUntil: o.validUntil ?? "2026-10-12T12:00:00Z",
  implications: [{ targetDomain: o.target ?? "NUTRITION", type: "RECOMMENDATION_CONTEXT", value: o.value ?? "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL", strength: "SOFT" }],
  ...(o.supersededBy && { supersededBy: o.supersededBy }), ...(o.riskFlag && { riskFlag: o.riskFlag }),
});

describe("interpretSignalsForGemma (R1E.2)", () => {
  it("consumes a same-user ACTIVE NUTRITION-targeted signal and maps the three Dante signals", () => {
    for (const [type, value] of [["LOW_RECOVERY", "AVOID_AGGRESSIVE_DEFICIT"], ["HIGH_TRAINING_LOAD", "SUPPORT_RECOVERY_NUTRITION"], ["UPCOMING_HEAVY_SESSION", "REVIEW_PRE_TRAINING_FUEL"]] as const) {
      const c = interpretSignalsForGemma([sig({ signalType: type, value })], USER, NOW);
      expect(c).toMatchObject({ signalLoaded: true, signalTypes: [type], directives: [value] });
      expect(c.signalRefs).toEqual(["sig:t:1"]); // refs only, not the payload
      expect(c.promptContext[0].kind).toBe("DANTE_CONTEXT");
    }
  });
  it("a material signal raises the reasoning budget (ESC_MATERIAL_SIGNAL)", () => {
    expect(interpretSignalsForGemma([sig()], USER, NOW).reasonCodes).toContain("ESC_MATERIAL_SIGNAL");
  });
  it("GLOBAL source + NUTRITION target is consumable (target ownership != source ownership)", () => {
    expect(interpretSignalsForGemma([sig({ sourceDomain: "GLOBAL" })], USER, NOW).signalLoaded).toBe(true);
  });
  it.each([
    ["expired", sig({ validUntil: "2026-10-12T07:30:00Z" })],
    ["not yet valid", sig({ validFrom: "2026-10-12T09:00:00Z", validUntil: "2026-10-12T12:00:00Z" })],
    ["withdrawn", sig({ lifecycle: "WITHDRAWN" })],
    ["superseded (lifecycle)", sig({ lifecycle: "SUPERSEDED" })],
    ["superseded (supersededBy)", sig({ supersededBy: "sig:new" })],
    ["consumed", sig({ lifecycle: "CONSUMED" })],
    ["foreign user", sig({ userScope: toUserScopeRef("user-2") })],
    ["no NUTRITION target", sig({ target: "TRAINING" })],
    ["unknown directive value", sig({ value: "SOMETHING_NEW" })],
    ["risk-flagged (coordination gate)", sig({ riskFlag: "MEDICAL_RISK" })],
  ])("ignores %s", (_n, s) => {
    expect(interpretSignalsForGemma([s], USER, NOW)).toEqual(EMPTY_COORDINATION);
  });
  it("privacy by explicit rank: NORMAL → NORMAL only; SENSITIVE → +SENSITIVE; MEDICAL → all; never a lexical compare", () => {
    const all = [sig({ id: "n", privacyClass: "NORMAL" }), sig({ id: "s", privacyClass: "SENSITIVE" }), sig({ id: "m", privacyClass: "MEDICAL" })];
    const refs = (c: "NORMAL" | "SENSITIVE" | "MEDICAL") => interpretSignalsForGemma(all, USER, NOW, c).signalRefs.sort();
    expect(refs("NORMAL")).toEqual(["n"]);
    expect(refs("SENSITIVE")).toEqual(["n", "s"]);
    expect(refs("MEDICAL")).toEqual(["m", "n", "s"]);
    expect(permittedPrivacyClasses("NORMAL")).toEqual(["NORMAL"]);
    expect(permittedPrivacyClasses("SENSITIVE")).toEqual(["NORMAL", "SENSITIVE"]);
    expect(permittedPrivacyClasses("MEDICAL")).toEqual(["NORMAL", "SENSITIVE", "MEDICAL"]); // MEDICAL never downgrades
    // the default Gemma clearance never reaches MEDICAL
    expect(interpretSignalsForGemma([all[2]], USER, NOW)).toEqual(EMPTY_COORDINATION);
  });
  it("read does not consume or mutate the signal", () => {
    const s = sig();
    const frozen = JSON.stringify(s);
    interpretSignalsForGemma([s], USER, NOW);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(s.lifecycle).toBe("ACTIVE");
  });
});

describe("coordinationNote: deterministic nutrition truth outranks the signal", () => {
  const c = interpretSignalsForGemma([sig()], USER, NOW);
  it("plenty of budget: contextual note, no numbers invented", () => {
    const n = coordinationNote(c, 1500)!;
    expect(n).toMatch(/recovery looks low/i);
    expect(n).not.toMatch(/\d/);
  });
  it("250 kcal remain: names the real number and leaves going over to the user", () => {
    const n = coordinationNote(c, 250)!;
    expect(n).toContain("250 kcal");
    expect(n).toMatch(/decision/i);
    expect(LOW_BUDGET_KCAL).toBeGreaterThan(250);
  });
  it("nothing remains: target untouched, user decides", () => {
    expect(coordinationNote(c, 0)).toMatch(/haven't changed your target/i);
  });
  it("no signal → no note (baseline behaviour)", () => {
    expect(coordinationNote(EMPTY_COORDINATION, 1500)).toBeNull();
  });
});

describe("loadGemmaCoordination failure degradation", () => {
  const failing = (impl: () => unknown) => ({ from: impl }) as unknown as SupabaseClient;
  it("a throwing client degrades to the empty (pre-R1E.2) context", async () => {
    expect(await loadGemmaCoordination(failing(() => { throw new Error("boom"); }), USER, NOW)).toEqual(EMPTY_COORDINATION);
  });
  it("a query error degrades to the empty context", async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "contains", "in", "lte", "gt"]) chain[m] = () => chain;
    chain.order = async () => ({ data: null, error: { code: "42501" } });
    expect(await loadGemmaCoordination(failing(() => chain), USER, NOW)).toEqual(EMPTY_COORDINATION);
  });
  it("a hung query times out instead of blocking the chat", async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "contains", "in", "lte", "gt"]) chain[m] = () => chain;
    chain.order = () => new Promise(() => {});
    const t = Date.now();
    expect(await loadGemmaCoordination(failing(() => chain), USER, NOW)).toEqual(EMPTY_COORDINATION);
    expect(Date.now() - t).toBeLessThan(4000);
  });
});

describe("asksForMealSuggestion (R1E.2b: the note rides on every mode that answers 'what should I eat')", () => {
  it.each(["What should I eat tonight?", "Any dinner ideas for tonight?", "Something light for dinner please", "I'm hungry, what do you suggest for dinner?", "Give me a high protein dinner", "What's for dinner?"])("matches: %s", (m) => {
    expect(asksForMealSuggestion(m)).toBe(true);
  });
  it.each(["Is rice good for recovery?", "Log my lunch", "Make it cheaper", "How much protein is in 200 g chicken?", "yes", "remove the bread"])("does not match: %s", (m) => {
    expect(asksForMealSuggestion(m)).toBe(false);
  });
});
