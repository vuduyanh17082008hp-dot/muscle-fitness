import { describe, expect, it } from "vitest";
import {
  buildExecutiveWorkspace,
  buildStructuredDecisionRecord,
  createRetrievalState,
  evaluateInformationValue,
  routeEvidenceNeed,
  selectReasoningBudget,
  shouldAskUserForEvidence,
  shouldRetrieveAgain,
  shouldStopReasoning,
  type CoachSignal,
  type EvidenceItem,
  type EvidenceNeed,
  type Hypothesis,
  type StopContext,
  type WorkspaceInput,
} from "../index";

const now = new Date("2026-10-12T12:00:00Z");
const need = (o: Partial<EvidenceNeed> = {}): EvidenceNeed => ({
  id: "n1", type: "CONCEPTUAL_KNOWLEDGE", domain: "nutrition", materiality: "MATERIAL",
  authorityRequired: "ANY", freshness: "ANY", privacyClass: "NORMAL", userScope: "scope-A", ...o,
});
const ev = (id: string, o: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id, origin: "VERIFIED_STATE", verification: "VERIFIED", direction: "FOR", strength: "STRONG",
  hypothesisId: "h1", summary: "s", sourceRefs: [], ...o,
});
const hyp = (o: Partial<Hypothesis> = {}): Hypothesis => ({
  id: "h1", domain: "recovery", question: "q", candidateExplanation: "c", supportingEvidence: [], counterEvidence: [],
  missingEvidence: [], counterEvidenceEvaluated: false, identifiability: "IDENTIFIED", uncertainty: "HIGH_SUPPORT", status: "SUPPORTED", ...o,
});
const sig = (o: Partial<CoachSignal> = {}): CoachSignal => ({
  id: "s1", schemaVersion: 1, idempotencyKey: "k", userScope: "scope-A", privacyClass: "NORMAL", lifecycle: "ACTIVE",
  sourceCoach: "DANTE", sourceDomain: "RECOVERY", signalType: "LOW_RECOVERY", status: "CROSS_COACH_VERIFIED", evidenceRefs: ["e1"],
  uncertainty: "MODERATE_SUPPORT", identifiability: "PARTIALLY_IDENTIFIED", validFrom: "2026-10-12T00:00:00Z", validUntil: "2026-10-13T00:00:00Z",
  implications: [{ targetDomain: "NUTRITION", type: "RECOMMENDATION_CONTEXT", value: "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL" }],
  provenance: ["dante:readiness"], ...o,
});
const ws = (o: Partial<WorkspaceInput> = {}) =>
  buildExecutiveWorkspace({ runId: "r1", userScope: "scope-A", currentGoal: "EXPLAIN_FATIGUE", activeDomain: "nutrition", complexity: "EXPLANATION", ...o }, now);
const stopCtx = (o: Partial<StopContext> = {}): StopContext => ({
  riskLevel: "LOW",
  retrieval: createRetrievalState([], 3),
  budget: selectReasoningBudget({ complexity: "EXPLANATION", risk: "LOW" }),
  informationValue: "MEDIUM", unresolved: [], contradictions: [], ...o,
});

describe("reasoning budget", () => {
  it("1 deterministic lookup → MINIMAL", () => {
    expect(selectReasoningBudget({ complexity: "LOOKUP", risk: "LOW", deterministicResolved: true }).level).toBe("MINIMAL");
  });
  it("2 high-risk uncertain → HIGH", () => {
    const b = selectReasoningBudget({ complexity: "EXPLANATION", risk: "HIGH", uncertain: true });
    expect(b.level).toBe("HIGH");
    expect(b.allowConsensusCheck).toBe(true);
  });
  it("3 contradiction increases depth", () => {
    const base = selectReasoningBudget({ complexity: "EXPLANATION", risk: "LOW" }).level;
    expect(base).toBe("LOW");
    expect(selectReasoningBudget({ complexity: "EXPLANATION", risk: "LOW", contradictionCount: 1 }).level).toBe("MEDIUM");
  });
  it("22 simple request does not escalate on many evidence items", () => {
    const w = ws({ complexity: "LOOKUP", evidence: Array.from({ length: 40 }, (_, i) => ev(`e${i}`, { hypothesisId: undefined })) });
    expect(w.reasoningBudget.level).toBe("MINIMAL");
  });
  it("23 high complexity without risk stays MEDIUM", () => {
    expect(selectReasoningBudget({ complexity: "OPEN_ENDED", risk: "LOW" }).level).toBe("MEDIUM");
  });
});

describe("risk", () => {
  it("declared CRITICAL without trusted safety is capped to HIGH", () => {
    expect(ws({ declaredRisk: "CRITICAL" }).riskLevel).toBe("HIGH");
  });
  it("11 CRITICAL safety input blocks normal reasoning", () => {
    const w = ws({ trustedSafetyCritical: true, needs: [need()] });
    expect(w.riskLevel).toBe("CRITICAL");
    expect(w.nextDecision.action).toBe("ESCALATE_SAFETY");
    expect(w.nextDecision.stop.status).toBe("BLOCKED");
    expect(w.blockedBy[0].code).toBe("SAFETY_BLOCK");
  });
  it("active riskFlag signal is trusted safety input", () => {
    expect(ws({ signals: [sig({ riskFlag: "MEDICAL_RISK" })] }).nextDecision.action).toBe("ESCALATE_SAFETY");
  });
});

describe("evidence router", () => {
  it("5 exact deterministic result avoids retrieval", () => {
    const w = ws({ complexity: "LOOKUP", deterministicResolved: true, needs: [need({ id: "n2", type: "EXACT_COMPUTATION", authorityRequired: "DETERMINISTIC" })], retrieval: createRetrievalState([], 3) });
    expect(w.nextDecision.stop.stopReason).toBe("DETERMINISTIC_RESOLUTION");
    expect(w.nextDecision.action).toBe("RESPOND");
  });
  it("exact arithmetic routes to DETERMINISTIC_TOOL", () => {
    expect(routeEvidenceNeed(need({ type: "EXACT_COMPUTATION", authorityRequired: "DETERMINISTIC" }), { userScope: "scope-A" }).source).toBe("DETERMINISTIC_TOOL");
  });
  it("6 athlete state preferred over generic knowledge for current state", () => {
    const d = routeEvidenceNeed(need({ type: "CURRENT_STATE", freshness: "CURRENT" }), { userScope: "scope-A" });
    expect(d.source).toBe("CURRENT_ATHLETE_STATE");
    const noState = routeEvidenceNeed(need({ type: "CURRENT_STATE" }), { userScope: "scope-A", availability: { CURRENT_ATHLETE_STATE: { available: false }, CANONICAL_DB: { available: false } } });
    expect(noState.source).toBe("USER_CLARIFICATION"); // never generic knowledge
  });
  it("logged data routes to CANONICAL_DB; past intervention to COACHING_EPISODE", () => {
    expect(routeEvidenceNeed(need({ type: "LOGGED_DATA" }), { userScope: "scope-A" }).source).toBe("CANONICAL_DB");
    expect(routeEvidenceNeed(need({ type: "PAST_INTERVENTION" }), { userScope: "scope-A" }).source).toBe("COACHING_EPISODE");
  });
  it("7 conceptual knowledge → CURATED_KNOWLEDGE", () => {
    expect(routeEvidenceNeed(need(), { userScope: "scope-A" }).source).toBe("CURATED_KNOWLEDGE");
  });
  it("8 unknown material user fact → USER_CLARIFICATION", () => {
    const d = routeEvidenceNeed(need({ type: "USER_FACT" }), { userScope: "scope-A" });
    expect(d.source).toBe("USER_CLARIFICATION");
    expect(d.outcome).toBe("ASK_USER");
  });
  it("does not ask for immaterial facts", () => {
    const n = need({ type: "USER_FACT", materiality: "MINOR" });
    expect(shouldAskUserForEvidence(n).ask).toBe(false);
    expect(routeEvidenceNeed(n, { userScope: "scope-A" }).outcome).toBe("SKIP");
    expect(shouldAskUserForEvidence({ ...n, affectsPersistentState: true }).ask).toBe(true);
  });
  it("18 foreign user scope is never routed", () => {
    const d = routeEvidenceNeed(need({ userScope: "scope-B" }), { userScope: "scope-A" });
    expect(d.outcome).toBe("BLOCKED");
    expect(d.blockedBy?.code).toBe("CROSS_USER_SCOPE");
    const w = ws({ needs: [need({ userScope: "scope-B" })] });
    expect(w.evidenceNeeds).toHaveLength(0);
    expect(w.blockedBy.some((b) => b.code === "CROSS_USER_SCOPE")).toBe(true);
  });
  it("19 MEDICAL privacy cannot be downgraded", () => {
    expect(routeEvidenceNeed(need({ privacyClass: "MEDICAL" }), { userScope: "scope-A", privacyFloor: "NORMAL" }).privacyClass).toBe("MEDICAL");
    expect(routeEvidenceNeed(need(), { userScope: "scope-A", privacyFloor: "MEDICAL" }).privacyClass).toBe("MEDICAL");
    const ext = routeEvidenceNeed(need({ type: "EXTERNAL_CURRENT", privacyClass: "MEDICAL", materiality: "MATERIAL" }), { userScope: "scope-A" });
    expect(ext.source).toBe("CURATED_KNOWLEDGE"); // external source dropped for medical
    expect(ws({ needs: [need({ privacyClass: "MEDICAL" })] }).privacyClass).toBe("MEDICAL");
  });
  it("missing deterministic tool → blocked, not generic fallback", () => {
    const d = routeEvidenceNeed(need({ type: "EXACT_COMPUTATION", authorityRequired: "DETERMINISTIC" }), { userScope: "scope-A", availability: { DETERMINISTIC_TOOL: { available: false } } });
    expect(d.blockedBy?.code).toBe("TOOL_UNAVAILABLE");
  });
  it("24 deterministic truth outranks retrieved generic knowledge", () => {
    // a DETERMINISTIC-authority need can never be answered by knowledge, even when it is the only thing available
    const d = routeEvidenceNeed(need({ type: "CONCEPTUAL_KNOWLEDGE", authorityRequired: "DETERMINISTIC" }), { userScope: "scope-A" });
    expect(d.source).toBeUndefined();
    expect(d.outcome).toBe("BLOCKED");
    expect(d.blockedBy?.code).toBe("MISSING_DETERMINISTIC_FACT");
  });
});

describe("workspace + coordination", () => {
  it("9 expired cross-coach signal does not affect workspace", () => {
    const expired = sig({ validUntil: "2026-10-12T06:00:00Z" });
    const w = ws({ signals: [expired], viewer: "GEMMA" });
    expect(w.reasoningBudget.level).toBe("LOW");
    expect(w.reasoningBudget.reasonCodes).not.toContain("ESC_MATERIAL_SIGNAL");
  });
  it("10 active MATERIAL signal increases reasoning", () => {
    const w = ws({ signals: [sig()], viewer: "GEMMA" });
    expect(w.reasoningBudget.level).toBe("MEDIUM");
    expect(w.signalRefs).toEqual(["s1"]);
  });
  it("foreign-scope signals are ignored", () => {
    expect(ws({ signals: [sig({ userScope: "scope-B" })], viewer: "GEMMA" }).reasoningBudget.level).toBe("LOW");
  });
  it("25 contradiction remains represented in workspace", () => {
    const w = ws({ evidence: [ev("e1"), ev("e2", { direction: "AGAINST", strength: "MODERATE" })], hypotheses: [hyp()] });
    expect(w.contradictions).toEqual([{ hypothesisId: "h1", forRefs: ["e1"], againstRefs: ["e2"], severity: "MATERIAL" }]);
    expect(w.knownEvidence).toEqual(["e1", "e2"]);
    expect(w.reasoningBudget.reasonCodes).toContain("ESC_CONTRADICTION");
  });
  it("critical contradiction is blocked, not a normal stop", () => {
    const w = ws({ evidence: [ev("e1"), ev("e2", { direction: "AGAINST" })], goalSatisfied: true });
    expect(w.nextDecision.stop.status).toBe("BLOCKED");
    expect(w.blockedBy[0].code).toBe("CONTRADICTORY_EVIDENCE");
  });
  it("USER_DECISION_REQUIRED conflict requires confirmation", () => {
    const w = ws({ conflicts: [{ schemaVersion: 1, conflictId: "c1", signalRefs: [], sharedGoalRefs: [], hardConstraintRefs: [], resolution: "USER_DECISION_REQUIRED", explanationCode: "X" }] });
    expect(w.nextDecision.stop.stopReason).toBe("CONFIRMATION_REQUIRED");
    expect(w.conflictRefs).toEqual(["c1"]);
  });
  it("workspace is bounded", () => {
    const w = ws({ evidence: Array.from({ length: 200 }, (_, i) => ev(`e${i}`, { hypothesisId: undefined })) });
    expect(w.knownEvidence).toHaveLength(64);
    expect(w.truncated).toBe(true);
  });
});

describe("VoI + retrieve-again", () => {
  const budget = selectReasoningBudget({ complexity: "MULTI_CONSTRAINT", risk: "MODERATE" });
  const st = createRetrievalState(["n1"], 3);
  it("VoI is NONE when nothing could change the decision", () => {
    expect(evaluateInformationValue({ materiality: "CRITICAL", changesDecision: "UNLIKELY", riskReduction: "NONE", uncertaintyReduction: "HIGH", cost: "LOW" })).toBe("NONE");
    expect(evaluateInformationValue({ materiality: "CRITICAL", changesDecision: "LIKELY", riskReduction: "HIGH", uncertaintyReduction: "HIGH", cost: "LOW" })).toBe("HIGH");
  });
  it("12 no retrieval after budget exhausted", () => {
    const r = shouldRetrieveAgain({ state: { ...st, round: 2 }, budget, informationValue: "HIGH" });
    expect(r).toEqual({ retrieve: false, reasonCodes: ["RETRIEVAL_BUDGET_EXHAUSTED"] });
  });
  it("13 no retrieval when VoI = NONE", () => {
    expect(shouldRetrieveAgain({ state: st, budget, informationValue: "NONE" }).retrieve).toBe(false);
  });
  it("14 retrieval continues with material uncertainty + HIGH VoI + budget", () => {
    expect(shouldRetrieveAgain({ state: st, budget, informationValue: "HIGH" }).retrieve).toBe(true);
  });
  it("no retrieval while confirmation required or safety blocked", () => {
    expect(shouldRetrieveAgain({ state: st, budget, informationValue: "HIGH", confirmationRequired: true }).retrieve).toBe(false);
    expect(shouldRetrieveAgain({ state: st, budget, informationValue: "HIGH", safetyBlocked: true }).retrieve).toBe(false);
  });
});

describe("stop policy", () => {
  const unresolvedCritical = [{ id: "n1", materiality: "CRITICAL" as const, type: "CURRENT_STATE" as const, authorityRequired: "ANY" as const }];
  it("4 missing critical evidence prevents normal stop", () => {
    const d = shouldStopReasoning(stopCtx({ unresolved: unresolvedCritical, goalSatisfied: true, informationValue: "LOW" }));
    expect(d.status).toBe("CONTINUE");
    const exhausted = shouldStopReasoning(stopCtx({ unresolved: unresolvedCritical, retrieval: { ...createRetrievalState(["n1"], 3), round: 3 } }));
    expect(exhausted.status).toBe("BLOCKED");
    expect(exhausted.blockedBy[0].code).toBe("RETRIEVAL_BUDGET_EXHAUSTED");
  });
  it("15 stops when evidence sufficient", () => {
    expect(shouldStopReasoning(stopCtx()).stopReason).toBe("EVIDENCE_SUFFICIENT");
  });
  it("16 stops when confirmation required", () => {
    expect(shouldStopReasoning(stopCtx({ confirmationRequired: true, unresolved: unresolvedCritical })).stopReason).toBe("CONFIRMATION_REQUIRED");
  });
  it("17 safety unresolved is never a successful stop", () => {
    const d = shouldStopReasoning(stopCtx({ safetyBlock: true, goalSatisfied: true, deterministicResolved: true }));
    expect(d.status).toBe("BLOCKED");
    expect(d.stopReason).toBeUndefined();
  });
  it("missing material deterministic fact is blocked once retrieval cannot continue", () => {
    const u = [{ id: "n1", materiality: "MATERIAL" as const, type: "EXACT_COMPUTATION" as const, authorityRequired: "DETERMINISTIC" as const }];
    expect(shouldStopReasoning(stopCtx({ unresolved: u, goalSatisfied: true })).status).toBe("CONTINUE");
    const d = shouldStopReasoning(stopCtx({ unresolved: u, routeBlocks: [{ code: "TOOL_UNAVAILABLE", refs: ["n1"] }] }));
    expect(d.status).toBe("BLOCKED");
    expect(d.blockedBy[0].code).toBe("TOOL_UNAVAILABLE");
  });
  it("low VoI / safe budget exhaustion stop only for non-critical gaps", () => {
    const minor = [{ id: "n1", materiality: "MATERIAL" as const, type: "CONCEPTUAL_KNOWLEDGE" as const, authorityRequired: "ANY" as const }];
    expect(shouldStopReasoning(stopCtx({ unresolved: minor, informationValue: "NONE" })).stopReason).toBe("LOW_INFORMATION_VALUE");
    expect(shouldStopReasoning(stopCtx({ unresolved: minor, retrieval: { ...createRetrievalState(["n1"], 3), round: 3 } })).stopReason).toBe("SAFE_BUDGET_EXHAUSTED");
  });
  it("user input required stops with ASK_USER", () => {
    const w = ws({ needs: [need({ id: "u1", type: "USER_FACT" })] });
    expect(w.nextDecision.stop.stopReason).toBe("USER_INPUT_REQUIRED");
    expect(w.nextDecision.action).toBe("ASK_USER");
    expect(w.reasoningBudget.shouldAskUser).toBe(true);
  });
});

describe("structured decision record", () => {
  const w = ws({ needs: [need()], evidence: [ev("e1")], hypotheses: [hyp()] });
  it("20 contains refs / reason codes only", () => {
    const r = buildStructuredDecisionRecord(w);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.evidenceRefs).toEqual(["e1"]);
    expect(r.record.selectedEvidenceRoute).toEqual([{ needId: "n1", source: "CURATED_KNOWLEDGE" }]);
    expect(r.record.reasonCodes.length).toBeGreaterThan(0);
  });
  it("21 has no chain-of-thought / chat field", () => {
    const r = buildStructuredDecisionRecord(w);
    if (!r.ok) throw new Error("expected ok");
    const keys = Object.keys(r.record).join(" ").toLowerCase();
    expect(keys).not.toMatch(/thought|reasoning(?!level)|chat|message|transcript|prompt/);
  });
  it("rejects free-text goal", () => {
    expect(buildStructuredDecisionRecord(ws({ currentGoal: "why am I tired today?" }))).toEqual({ ok: false, reason: "NON_STRUCTURED_REF" });
  });
});
