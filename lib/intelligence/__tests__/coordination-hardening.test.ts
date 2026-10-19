import { describe, expect, it } from "vitest";
import {
  acknowledgeHandoff,
  applySupersession,
  buildCoordinationTrace,
  canImplicationAuthorizeMutation,
  coachSignalAuthority,
  createCoachHandoff,
  dedupeCoachSignals,
  effectiveImplicationStrength,
  evaluateCoordinationGate,
  evaluateCrossDomainRelevance,
  isDuplicateHandoff,
  isDuplicateSignal,
  isSignalActive,
  maxPrivacyClass,
  projectSignalForTarget,
  resolveCoordinationConflict,
  type CoachImplication,
  type CoachSignal,
} from "../index";

const now = new Date("2026-10-12T12:00:00Z");
const sig = (o: Partial<CoachSignal> = {}): CoachSignal => ({
  id: "s1",
  schemaVersion: 1,
  idempotencyKey: "k-s1",
  userScope: "scope-A",
  privacyClass: "NORMAL",
  lifecycle: "ACTIVE",
  sourceCoach: "DANTE",
  sourceDomain: "RECOVERY",
  signalType: "LOW_RECOVERY",
  status: "CROSS_COACH_VERIFIED",
  evidenceRefs: ["e1"],
  uncertainty: "MODERATE_SUPPORT",
  identifiability: "PARTIALLY_IDENTIFIED",
  validFrom: "2026-10-12T00:00:00Z",
  validUntil: "2026-10-13T00:00:00Z",
  implications: [{ targetDomain: "NUTRITION", type: "RECOMMENDATION_CONTEXT", value: "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL" }],
  provenance: ["dante:readiness"],
  ...o,
});
const hargs = { id: "h1", idempotencyKey: "k-h1", userScope: "scope-A", fromCoach: "DANTE", toCoach: "GEMMA", reason: "LOW_RECOVERY", requestedCapability: "ADAPT_MEAL_STRATEGY" } as const;
const handoff = (signals = [sig()]) => createCoachHandoff({ ...hargs, signals }, now)!;
const risk = sig({ id: "r1", signalType: "CHEST_PAIN", riskFlag: "MEDICAL_RISK", privacyClass: "MEDICAL" });

describe("AI-R1B.2 lifecycle + idempotency", () => {
  it("duplicate signal / handoff idempotency", () => {
    expect(isDuplicateSignal(sig({ id: "a" }), sig({ id: "b" }))).toBe(true);
    expect(isDuplicateSignal(sig(), sig({ userScope: "scope-B" }))).toBe(false);
    expect(dedupeCoachSignals([sig({ id: "a" }), sig({ id: "b" }), sig({ id: "c", idempotencyKey: "k2" })]).map((s) => s.id)).toEqual(["a", "c"]);
    expect(isDuplicateHandoff(handoff(), handoff())).toBe(true);
  });

  it.each(["SUPERSEDED", "WITHDRAWN", "EXPIRED", "CONSUMED"] as const)("%s signal is inactive", (lifecycle) => {
    expect(isSignalActive(sig({ lifecycle }), now)).toBe(false);
    expect(evaluateCrossDomainRelevance(sig({ lifecycle }), "GEMMA", now)).toBe("IRRELEVANT");
    expect(createCoachHandoff({ ...hargs, signals: [sig({ lifecycle })] }, now)).toBeNull();
  });

  it("supersession keeps provenance and only active signals participate", () => {
    const next = sig({ id: "s2", idempotencyKey: "k2", signalType: "RECOVERY_NORMALIZED", supersedes: ["s1"] });
    const [old, fresh] = applySupersession([sig(), next]);
    expect(old).toMatchObject({ lifecycle: "SUPERSEDED", supersededBy: "s2", provenance: ["dante:readiness"], evidenceRefs: ["e1"], status: "CROSS_COACH_VERIFIED" });
    expect(fresh.lifecycle).toBe("ACTIVE");
    expect(isSignalActive(old, now)).toBe(false);
  });

  it("supersession never crosses users", () => {
    const other = sig({ id: "s2", userScope: "scope-B", supersedes: ["s1"] });
    expect(applySupersession([sig(), other])[0].lifecycle).toBe("ACTIVE");
  });
});

describe("AI-R1B.2 acknowledgement + consumption", () => {
  it("consumed handoff is acknowledged, keeps decision refs, and leaves the signal ACTIVE", () => {
    const s = sig();
    const h = handoff([s]);
    const r = acknowledgeHandoff(h, { receivedBy: "GEMMA", userScope: "scope-A", status: "CONSUMED", resultingDecisionRefs: ["d1"] }, now);
    expect(r.ok && r.ack).toMatchObject({ status: "CONSUMED", handoffId: "h1", resultingDecisionRefs: ["d1"], schemaVersion: 1 });
    expect(isSignalActive(s, now)).toBe(true);
    expect(h.signalIds).toEqual(["s1"]);
  });

  it("rejection preserves reason and requires one", () => {
    const h = handoff();
    const ok = acknowledgeHandoff(h, { receivedBy: "GEMMA", userScope: "scope-A", status: "REJECTED", rejectionReason: "NOT_APPLICABLE" }, now);
    expect(ok.ok && ok.ack.rejectionReason).toBe("NOT_APPLICABLE");
    expect(acknowledgeHandoff(h, { receivedBy: "GEMMA", userScope: "scope-A", status: "REJECTED" }, now)).toEqual({ ok: false, reason: "REJECTION_REASON_REQUIRED" });
  });

  it("wrong recipient / cross-user / expired-consume are refused", () => {
    const h = handoff();
    expect(acknowledgeHandoff(h, { receivedBy: "DANTE", userScope: "scope-A", status: "RECEIVED" }, now).ok).toBe(false);
    expect(acknowledgeHandoff(h, { receivedBy: "GEMMA", userScope: "scope-B", status: "RECEIVED" }, now)).toEqual({ ok: false, reason: "CROSS_USER_SCOPE" });
    expect(acknowledgeHandoff(h, { receivedBy: "GEMMA", userScope: "scope-A", status: "CONSUMED" }, new Date("2026-10-14T00:00:00Z")).ok).toBe(false);
    expect(acknowledgeHandoff(h, { receivedBy: "GEMMA", userScope: "scope-A", status: "EXPIRED" }, new Date("2026-10-14T00:00:00Z")).ok).toBe(true);
  });
});

describe("AI-R1B.2 conflict resolution", () => {
  const coach = { ref: "s1", authority: coachSignalAuthority(sig()) };
  const resolve = (a: Parameters<typeof resolveCoordinationConflict>[0]["parties"], x = {}) =>
    resolveCoordinationConflict({ conflictId: "c1", parties: a, ...x });

  it("deterministic truth overrides coach suggestion", () => {
    expect(resolve([coach, { ref: "d", authority: "DETERMINISTIC_TRUTH" }]).resolution).toBe("DETERMINISTIC_STATE_OVERRIDES");
    expect(resolve([coach, { ref: "a", authority: "CURRENT_VERIFIED_ATHLETE_STATE" }]).resolution).toBe("DETERMINISTIC_STATE_OVERRIDES");
  });

  it("safety overrides every coach signal and the user", () => {
    for (const status of ["CROSS_COACH_VERIFIED", "SUPPORTED_HYPOTHESIS", "INFERENCE", "HEURISTIC"] as const) {
      const c = { ref: "s", authority: coachSignalAuthority(sig({ status })) };
      expect(resolve([c, { ref: "x", authority: "SAFETY" }]).resolution).toBe("SAFETY_OVERRIDES");
    }
    const c = resolve([{ ref: "u", authority: "USER_EXPLICIT" }, { ref: "x", authority: "SAFETY" }]);
    expect(c.resolution).toBe("SAFETY_OVERRIDES");
    expect(c.explanationCode).toBe("SAFETY_BLOCK_PRESENT");
  });

  it("user explicit wins over inference / hypothesis (no silent override)", () => {
    const inf = { ref: "i", authority: coachSignalAuthority(sig({ status: "INFERENCE" })) };
    const hyp = { ref: "h", authority: coachSignalAuthority(sig({ status: "SUPPORTED_HYPOTHESIS" })) };
    for (const p of [inf, hyp]) expect(resolve([p, { ref: "u", authority: "USER_EXPLICIT" }], { requiresPersistentChange: true })).toMatchObject({ resolution: "NO_ACTION", explanationCode: "USER_EXPLICIT_PREVAILS" });
  });

  it("soft tradeoff needing persistent change requires user decision; compromise stays representable", () => {
    const two = [coach, { ref: "g", authority: "SUPPORTED_HYPOTHESIS" as const }];
    expect(resolve(two, { requiresPersistentChange: true }).resolution).toBe("USER_DECISION_REQUIRED");
    const c = resolve(two, { compromiseWithinConstraints: true, hardConstraintRefs: ["allergy"], sharedGoalRefs: ["goal1"] });
    expect(c).toMatchObject({ resolution: "COMPROMISE_WITHIN_CONSTRAINTS", hardConstraintRefs: ["allergy"], sharedGoalRefs: ["goal1"], schemaVersion: 1 });
  });

  it("conflicts are auditable: refs + explanation code, no winner text", () => {
    const c = resolve([coach, { ref: "d", authority: "DETERMINISTIC_TRUTH" }], { outcomeRef: "o1" });
    expect(c).toMatchObject({ conflictId: "c1", signalRefs: ["s1", "d"], outcomeRef: "o1" });
    expect(c.explanationCode).toMatch(/^[A-Z_]+$/);
  });
});

describe("AI-R1B.2 implication strength + safety gate + mutation", () => {
  const imp = (o: Partial<CoachImplication>): CoachImplication => ({ targetDomain: "NUTRITION", type: "CONSTRAINT", value: "ALLERGY_BLOCK", relevance: "CRITICAL", ...o });

  it("model hypothesis cannot self-declare HARD", () => {
    const hyp = sig({ status: "SUPPORTED_HYPOTHESIS" });
    expect(effectiveImplicationStrength(hyp, imp({ strength: "HARD", hardBasis: "SAFETY" }))).toBe("STRONG");
    expect(effectiveImplicationStrength(sig(), imp({ strength: "HARD" }))).toBe("STRONG");
  });

  it("HARD from trusted authority is allowed; defaults are CONTEXTUAL", () => {
    expect(effectiveImplicationStrength(sig(), imp({ strength: "HARD", hardBasis: "ALLERGY_EXCLUSION" }))).toBe("HARD");
    expect(effectiveImplicationStrength(sig(), imp({}))).toBe("CONTEXTUAL");
  });

  it("active medical risk blocks normal coordination and handoff of ordinary signals", () => {
    expect(evaluateCoordinationGate([sig()], "scope-A", now)).toBe("PROCEED");
    expect(evaluateCoordinationGate([sig(), risk], "scope-A", now)).toBe("BLOCK_NORMAL_COORDINATION");
    expect(evaluateCoordinationGate([risk], "scope-B", now)).toBe("PROCEED");
    expect(evaluateCoordinationGate([{ ...risk, lifecycle: "WITHDRAWN" }], "scope-A", now)).toBe("PROCEED");
    const riskWithImplication = { ...risk, implications: sig().implications };
    expect(createCoachHandoff({ ...hargs, signals: [sig(), riskWithImplication] }, now)?.signalIds).toEqual(["r1"]);
  });

  it("no mutation authority", () => {
    expect(canImplicationAuthorizeMutation(imp({ strength: "HARD", hardBasis: "SAFETY" })).allowed).toBe(false);
  });
});

describe("AI-R1B.2 user scope + privacy", () => {
  it("same-user scope succeeds; cross-user signals are never handed off", () => {
    expect(createCoachHandoff({ ...hargs, signals: [sig()] }, now)?.userScope).toBe("scope-A");
    expect(createCoachHandoff({ ...hargs, signals: [sig({ userScope: "scope-B" })] }, now)).toBeNull();
    expect(handoff([sig(), sig({ id: "sB", userScope: "scope-B" })]).signalIds).toEqual(["s1"]);
  });

  it("privacy class survives projection and handoff; MEDICAL cannot be downgraded", () => {
    const med = sig({ privacyClass: "MEDICAL" });
    expect(projectSignalForTarget(med, "GEMMA").privacyClass).toBe("MEDICAL");
    expect(projectSignalForTarget(med, "GEMMA", { privacyClass: "NORMAL" }).privacyClass).toBe("MEDICAL");
    expect(projectSignalForTarget(sig(), "GEMMA", { privacyClass: "SENSITIVE" }).privacyClass).toBe("SENSITIVE");
    expect(handoff([sig({ privacyClass: "SENSITIVE" }), med]).privacyClass).toBe("MEDICAL");
    expect(maxPrivacyClass("MEDICAL", "NORMAL")).toBe("MEDICAL");
  });
});

describe("AI-R1B.2 replay trace", () => {
  it("reconstructs signal → handoff → acknowledgement → decision (+ privacy)", () => {
    const s = sig({ privacyClass: "SENSITIVE" });
    const h = handoff([s]);
    const a = acknowledgeHandoff(h, { receivedBy: "GEMMA", userScope: "scope-A", status: "CONSUMED", resultingDecisionRefs: ["d1"] }, now);
    const conflict = resolveCoordinationConflict({ conflictId: "c1", parties: [{ ref: "s1", authority: "CROSS_COACH_VERIFIED_SIGNAL" }, { ref: "d", authority: "DETERMINISTIC_TRUTH" }] });
    const r = buildCoordinationTrace({ traceId: "t1", target: "GEMMA", signals: [s], handoff: h, acknowledgement: a.ok ? a.ack : undefined, conflict, outcomeRef: "o1" }, now);
    expect(r.ok && r.trace).toMatchObject({
      schemaVersion: 1,
      privacyClass: "SENSITIVE",
      signals: [{ signalId: "s1", relevance: "MATERIAL", reasonCode: "LOW_RECOVERY", lifecycle: "ACTIVE" }],
      handoffId: "h1",
      acknowledgement: { handoffId: "h1", status: "CONSUMED" },
      conflictId: "c1",
      decisionRefs: ["d1"],
      outcomeRef: "o1",
    });
  });

  it("rejects raw conversation text and mixed user scopes", () => {
    const bad = buildCoordinationTrace({ traceId: "t1", target: "GEMMA", signals: [sig()], decisionRefs: ["I felt dizzy when I ate lunch"] }, now);
    expect(bad).toEqual({ ok: false, reason: "NON_STRUCTURED_REF" });
    const mixed = buildCoordinationTrace({ traceId: "t1", target: "GEMMA", signals: [sig(), sig({ id: "sB", userScope: "scope-B" })] }, now);
    expect(mixed).toEqual({ ok: false, reason: "CROSS_USER_SCOPE" });
  });
});
