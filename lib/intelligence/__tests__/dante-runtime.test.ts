import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkSafety } from "@/lib/dante-core/safety-layer";
import { canImplicationAuthorizeMutation, coachSignalToClaim } from "../coordination";
import { buildDanteIntelligence, EXPLANATION_REQUEST, extractDanteStateSnapshot, toUserScopeRef, validateProducedSignal, type DanteStateSnapshot, type DanteTurnInput } from "../dante-runtime";

const NOW = new Date("2026-10-12T08:00:00Z");
const scope = toUserScopeRef("user-1");
const base: DanteTurnInput = {
  runId: "run:t1", userScope: scope, causal: false, explanation: false, agentToolIntent: false, safetyActive: false,
  intent: { training: true, nutrition: false, recovery: false, health: false, supplement: false },
  timezone: "Asia/Singapore",
};
const state = (status: string | null, load: string | null, painIllness = false): DanteStateSnapshot => ({
  recovery: status ? { hasCheckin: true, statusLabel: status, painIllness } : null,
  trainingLoad: load ? { state: load, sessionsLast7Days: 4 } : null,
});
const ok = (i: Partial<DanteTurnInput>) => {
  const r = buildDanteIntelligence({ ...base, ...i }, NOW);
  if (r.status === "FAILED") throw new Error(r.reason);
  return r;
};

describe("AI-R1D Dante runtime integration", () => {
  it("1 simple turn builds a workspace", () => expect(ok({}).workspace.runId).toBe("run:t1"));

  it("2 simple lookup stays low reasoning", () => expect(["MINIMAL", "LOW"]).toContain(ok({}).workspace.reasoningBudget.level));

  it("3 performance attribution escalates reasoning", () => {
    const r = ok({ causal: true, explanation: true, state: state("Moderate", "amber") });
    expect(["MEDIUM", "HIGH"]).toContain(r.workspace.reasoningBudget.level);
    expect(r.workspace.activeDomain).toBe("performance");
  });

  it("4/17/24 safety-blocked turn skips normal flow; chest-pain regression", () => {
    const safety = checkSafety("I have chest pain and shortness of breath", {} as never);
    expect(safety.triggered).toBe(true);
    const r = ok({ safetyActive: safety.triggered, causal: true, state: state("Recovery Priority", "red") });
    expect(r.status).toBe("SAFETY_BLOCKED");
    expect(r.workspace.nextDecision.action).toBe("ESCALATE_SAFETY");
    expect(r.signals).toEqual([]);
    expect(r.hypotheses).toEqual([]);
    expect(r.observability.blockedReason).toBe("SAFETY_BLOCK");
  });

  it("5 foreign-scope needs are ignored", () => {
    const r = ok({ state: state("Good", "green") });
    expect(r.workspace.blockedBy.some((b) => b.code === "CROSS_USER_SCOPE")).toBe(false);
    expect(r.workspace.evidenceNeeds.every((n) => n.userScope === scope)).toBe(true);
  });

  it("6 Athlete State maps to deterministic shared evidence", () => {
    const r = ok({ state: state("Recovery Priority", "red") });
    expect(r.evidence.map((e) => e.id)).toEqual(["ev:recovery_status", "ev:training_load"]);
    expect(r.evidence.every((e) => e.origin === "DETERMINISTIC_RESULT" && e.verification === "VERIFIED")).toBe(true);
    expect(r.workspace.retrievalState.retrievedEvidenceRefs).toEqual(["ev:recovery_status", "ev:training_load"]);
    // phase A (no state yet): the open current-state need routes to CURRENT_ATHLETE_STATE
    expect(ok({}).workspace.routeDecisions[0]).toMatchObject({ outcome: "ROUTE", source: "CURRENT_ATHLETE_STATE" });
  });

  it("7 hypothesis preserves counter-evidence", () => {
    const h = ok({ causal: true, state: state("Recovery Priority", "green") }).hypotheses[0];
    expect(h.counterEvidenceEvaluated).toBe(true);
    expect(h.counterEvidence.map((e) => e.id)).toEqual(["ev:training_load"]);
    expect(h.missingEvidence.some((m) => m.id === "missing:unmodeled_alternative_causes")).toBe(true);
  });

  it("8 conflicting hypothesis is not promoted; no verified claim; never IDENTIFIED", () => {
    const r = ok({ causal: true, state: state("Recovery Priority", "green") });
    const h = r.hypotheses[0];
    expect(["CONFLICTING", "UNDERDETERMINED"]).toContain(h.identifiability);
    expect(["SUPPORTED", "IDENTIFIED", "PARTIALLY_IDENTIFIED"]).not.toContain(h.status);
    expect(r.claims.filter((c) => c.id.startsWith("claim:hyp:")).every((c) => c.claimType === "HYPOTHESIS" && c.verification === "UNRESOLVED")).toBe(true);
    expect(ok({ causal: true, state: state("Recovery Priority", "red") }).hypotheses[0].identifiability).not.toBe("IDENTIFIED");
  });

  it("9/11/12/13/14 material recovery context emits a valid signal", () => {
    const r = ok({ state: state("Recovery Priority", "green") });
    const [s] = r.signals;
    expect(s.signalType).toBe("LOW_RECOVERY");
    expect(s.evidenceRefs.length).toBeGreaterThan(0);
    expect(s.provenance.length).toBeGreaterThan(0);
    expect(s.uncertainty).toBeTruthy();
    expect(Date.parse(s.validUntil)).toBeGreaterThan(NOW.getTime());
    expect(Date.parse(s.validUntil) - NOW.getTime()).toBeLessThanOrEqual(12 * 3600_000);
    expect(s.userScope).toBe(scope);
    expect(s.sourceCoach).toBe("DANTE");
    expect(s.riskFlag).toBeUndefined();
    expect(s.implications[0]).toMatchObject({ targetDomain: "NUTRITION", value: "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL", strength: "SOFT" });
    expect(r.handoffs[0]).toMatchObject({ fromCoach: "DANTE", toCoach: "GEMMA" });
    expect(r.trace?.signals[0].reasonCode).toBe("LOW_RECOVERY");
    expect(r.observability).toMatchObject({ signalEmitted: true, signalType: "LOW_RECOVERY", relevance: "MATERIAL" });
  });

  it("10 trivial / healthy / stateless turns emit no signal and no trace", () => {
    const r = ok({ state: state("Good", "green") });
    expect(r.signals).toEqual([]);
    expect(r.trace).toBeNull();
    expect(ok({ state: state("Moderate", "amber") }).signals).toEqual([]);
    expect(ok({}).signals).toEqual([]);
  });

  it("high training load and scheduled heavy session map to nutrition context only", () => {
    const r = ok({ state: state("Good", "red"), scheduledHeavySessionToday: true });
    expect(r.signals.map((s) => s.signalType).sort()).toEqual(["HIGH_TRAINING_LOAD", "UPCOMING_HEAVY_SESSION"]);
    expect(r.signals.flatMap((s) => s.implications).map((i) => i.value).sort()).toEqual(["REVIEW_PRE_TRAINING_FUEL", "SUPPORT_RECOVERY_NUTRITION"]);
  });

  it("15/16 signals carry no mutation authority and never become a verified fact", () => {
    const r = ok({ state: state("Recovery Priority", "red") });
    expect(r.signals.length).toBeGreaterThan(0);
    for (const s of r.signals) {
      for (const i of s.implications) {
        expect(canImplicationAuthorizeMutation(i).allowed).toBe(false);
        expect(i.strength).not.toBe("HARD");
        expect(["RECOMMENDATION_CONTEXT", "REASSESSMENT_REQUEST"]).toContain(i.type);
      }
      expect(coachSignalToClaim(s).verification).toBe("UNRESOLVED");
    }
    expect(readFileSync("lib/intelligence/dante-runtime.ts", "utf8")).not.toMatch(/\.from\(|\.insert\(|createPendingAction|supabase/i);
  });

  it("18 expired / invalid candidates are rejected", () => {
    const s = ok({ state: state("Recovery Priority", null) }).signals[0];
    expect(validateProducedSignal({ ...s, validUntil: NOW.toISOString() }, scope, NOW)).toContain("NOT_VALID_NOW");
    expect(validateProducedSignal({ ...s, evidenceRefs: [] }, scope, NOW)).toContain("NO_EVIDENCE_REFS");
    expect(validateProducedSignal({ ...s, userScope: "u:other" }, scope, NOW)).toContain("USER_SCOPE_MISMATCH");
    expect(validateProducedSignal({ ...s, riskFlag: "MEDICAL_RISK" }, scope, NOW)).toContain("PRODUCER_MAY_NOT_SET_RISK_FLAG");
    const lateNight = new Date("2026-10-12T15:59:59.999Z");
    const late = buildDanteIntelligence({ ...base, state: state("Recovery Priority", "red") }, lateNight);
    expect(late.status === "OK" && late.signals.every((x) => Date.parse(x.validUntil) > lateNight.getTime())).toBe(true);
  });

  it("19 construction failure degrades safely", () => {
    const bad = { ...base, get state(): never { throw new Error("boom"); } } as unknown as DanteTurnInput;
    expect(buildDanteIntelligence(bad, NOW)).toEqual({ status: "FAILED", reason: "INTELLIGENCE_CONSTRUCTION_FAILED" });
    expect(extractDanteStateSnapshot({ recovery: 7 })).toEqual({ recovery: null, trainingLoad: null });
    expect(extractDanteStateSnapshot(undefined)).toEqual({ recovery: null, trainingLoad: null });
  });

  it("pain/illness raises signal privacy; observability holds no values or ids", () => {
    const r = ok({ state: state("Recovery Priority", null, true) });
    expect(r.signals[0].privacyClass).toBe("SENSITIVE");
    const dump = JSON.stringify(r.observability);
    expect(dump).not.toContain("user-1");
    expect(dump).not.toContain(scope);
  });

  it("20/21/22/23 wrapping only: providers, Gemma, verifier and both paths untouched", () => {
    const route = readFileSync("app/api/chatbot/route.ts", "utf8");
    expect(route).toContain('runDanteIntelligence({ phase: "pre-route"');
    expect(route).toContain('runDanteIntelligence({ phase: "post-context"');
    expect(route).toContain("verifyFinalResponse({");
    expect(route).toContain("await runVerifiedGeneration(");
    expect(route).toContain("await runDanteAgentTurn(");
    expect(route).toContain("enforceEpistemicReplyBoundaries({");
    expect(readFileSync("lib/intelligence/dante-runtime.ts", "utf8")).not.toMatch(/from "@\/lib\/(ai|nutrition|dante-core)/);
  });
});

describe("extractDanteStateSnapshot pain/illness (found by R1E.1a live gate)", () => {
  const ctx = (painIllness: unknown) => ({ recovery: { today: { hasCheckin: true, status: "Recovery Priority", painIllness } } });
  it('the real check-in value "no" is NOT pain/illness (it is a truthy string)', () => {
    expect(extractDanteStateSnapshot(ctx("no")).recovery?.painIllness).toBe(false);
  });
  it('"minor" and "yes" are pain/illness', () => {
    expect(extractDanteStateSnapshot(ctx("minor")).recovery?.painIllness).toBe(true);
    expect(extractDanteStateSnapshot(ctx("yes")).recovery?.painIllness).toBe(true);
  });
});

describe("explanation-request cue", () => {
  it.each(["why does this hurt", "How do I progress?", "explain RIR", "should I deload", "tại sao tôi mệt", "giải thích giúp"])("matches %s", (text) => {
    expect(EXPLANATION_REQUEST.test(text)).toBe(true);
  });
  it.each(["my shoulder is sore", "however it went fine", "somehow I hit a PR", "showed up late", "whyte bread"])("does not match %s", (text) => {
    expect(EXPLANATION_REQUEST.test(text)).toBe(false);
  });
});
