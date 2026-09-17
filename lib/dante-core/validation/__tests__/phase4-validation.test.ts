import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { initialCalibrationState, updateDomainCalibration } from "@/lib/dante-core/validation/calibration";
import { compareContext } from "@/lib/dante-core/validation/context-comparability";
import { validateDrift } from "@/lib/dante-core/validation/drift-validation";
import { RECOMMENDATION_HYPOTHESES, selectHypothesisRelativeFollowUp } from "@/lib/dante-core/validation/hypothesis-followups";
import { applyMemoryOverrideRequest, assessStrategyEvidence, filterUserScoped } from "@/lib/dante-core/validation/learning-integrity";
import { selectOutcomeLink, type LinkableRecommendation } from "@/lib/dante-core/validation/outcome-linkage";
import { appendValidationEvent } from "@/lib/dante-core/validation/persistence";
import { buildPromotionReadinessReport } from "@/lib/dante-core/validation/promotion-readiness";
import { evaluateShadowAgainstProduction } from "@/lib/dante-core/validation/shadow-evaluator";
import { evaluateOutcomeDimension, evaluateTypedOutcome } from "@/lib/dante-core/validation/typed-outcomes";
import type { ContextSignature, DriftPolicy } from "@/lib/dante-core/validation/types";

const now = new Date("2026-09-17T12:00:00.000Z");
const recommendation = (id: string, userId = "athlete-a"): LinkableRecommendation => ({
  userId,
  recommendationId: id,
  occurredAt: "2026-09-16T18:00:00.000Z",
  horizonStartMs: 12 * 60 * 60 * 1000,
  horizonEndMs: 36 * 60 * 60 * 1000,
  linked: false,
});
const context = (overrides: Partial<ContextSignature["hard"]> = {}): ContextSignature => ({
  hard: { athleteId: "athlete-a", goal: "hypertrophy", acuteInjuryState: "none", interventionFamily: "volume", ...overrides },
  soft: { trainingPhase: "accumulation", recoveryBand: "mid", stressBand: "low" },
  capturedAt: now.toISOString(),
});
const sleepPolicy: DriftPolicy = { domain: "sleep", magnitudeThreshold: 1.5, candidatePoints: 2, confirmationPoints: 4, minimumConfidence: 0.7 };

describe("Dante Phase 4 A-Z validation contract", () => {
  it("A links recommendation to an explicit expected-outcome identity", () => {
    expect(selectOutcomeLink({ userId: "athlete-a", outcomeAt: now, recommendations: [recommendation("r1")], explicitRecommendationId: "r1" })?.recommendationId).toBe("r1");
  });

  it("B links an asynchronous mature outcome", () => {
    expect(selectOutcomeLink({ userId: "athlete-a", outcomeAt: now, recommendations: [recommendation("r1")] })?.recommendationId).toBe("r1");
  });

  it("C leaves a missing outcome unresolved", () => {
    expect(evaluateOutcomeDimension("recovery", { kind: "continuous", value: 70, unit: "score" }, null).status).toBe("UNRESOLVED");
  });

  it("D computes continuous absolute and explicitly scaled errors", () => {
    expect(evaluateOutcomeDimension("recovery", { kind: "continuous", value: 80, unit: "score", normalizationScale: 100 }, { kind: "continuous", value: 70, unit: "score" }).error)
      .toEqual({ kind: "continuous", absoluteError: 10, normalizedError: 0.1 });
  });

  it("E computes categorical mismatch", () => {
    expect(evaluateOutcomeDimension("performance", { kind: "categorical", value: "UP" }, { kind: "categorical", value: "DOWN" }).error)
      .toEqual({ kind: "categorical", matches: false });
  });

  it("F computes ordinal distance", () => {
    const order = ["NONE", "MILD", "MODERATE", "SEVERE"];
    expect(evaluateOutcomeDimension("pain", { kind: "ordinal", value: "MILD", order }, { kind: "ordinal", value: "SEVERE", order }).error)
      .toEqual({ kind: "ordinal", distance: 2 });
  });

  it("G preserves mixed outcomes", () => {
    expect(evaluateTypedOutcome([
      { dimension: "recovery", expected: { kind: "categorical", value: "UP" }, actual: { kind: "categorical", value: "UP" } },
      { dimension: "performance", expected: { kind: "categorical", value: "STABLE" }, actual: { kind: "categorical", value: "DOWN" } },
    ]).status).toBe("MIXED");
  });

  it("H selects a hypothesis-relative follow-up deterministically", () => {
    expect(selectHypothesisRelativeFollowUp({ hypothesis: RECOMMENDATION_HYPOTHESES.reduce_volume! })?.id).toBe("pain_level");
  });

  it("I suppresses irrelevant follow-ups", () => {
    expect(selectHypothesisRelativeFollowUp({ hypothesis: RECOMMENDATION_HYPOTHESES.reduce_volume! })?.id).not.toBe("bodyweight");
  });

  it("J exposes inspectable context similarity", () => {
    const right = context();
    right.soft.stressBand = "high";
    const result = compareContext(context(), right);
    expect(result.compatible).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
    expect(result.components.some((item) => item.name === "stressBand" && !item.matches)).toBe(true);
  });

  it("K makes another athlete a hard incompatibility", () => {
    expect(compareContext(context(), context({ athleteId: "athlete-b" }))).toMatchObject({ compatible: false, score: 0, hardMismatches: ["athleteId"] });
  });

  it("L classifies one-off abnormal sleep as anomaly, not drift", () => {
    expect(validateDrift(sleepPolicy, [{ domain: "sleep", magnitude: 2, confidence: 0.9, explicitTransition: false, occurredAt: now.toISOString() }]).stage).toBe("ANOMALY");
  });

  it("M requires persistent change for drift candidate", () => {
    const observations = [0, 1].map((day) => ({ domain: "sleep", magnitude: 2, confidence: 0.9, explicitTransition: false, occurredAt: `2026-09-${15 + day}T00:00:00.000Z` }));
    expect(validateDrift(sleepPolicy, observations).stage).toBe("CANDIDATE");
  });

  it("N keeps prediction error separate from drift evidence", () => {
    expect(evaluateOutcomeDimension("sleep", { kind: "continuous", value: 8, unit: "hours" }, { kind: "continuous", value: 5, unit: "hours" }).status).toBe("DIVERGENT");
    expect(validateDrift(sleepPolicy, []).stage).toBe("NONE");
  });

  it("O blocks self-created compliance evidence", () => {
    expect(assessStrategyEvidence({ recommendationCompliedWith: true, independentOutcomeObserved: false, confounderCount: 0, outcomeStatus: "ALIGNED" }))
      .toMatchObject({ accepted: false, evidenceWeight: 0, reasonCodes: ["SELF_CREATED_EVIDENCE_BLOCKED"] });
  });

  it("P preserves uncertainty for confounded mixed outcomes", () => {
    expect(assessStrategyEvidence({ recommendationCompliedWith: true, independentOutcomeObserved: true, confounderCount: 3, outcomeStatus: "MIXED" }))
      .toMatchObject({ accepted: true, causalUncertainty: "HIGH", outcomeStatus: "MIXED" });
  });

  it("Q filters every collection by user", () => {
    expect(filterUserScoped([{ userId: "athlete-a", id: 1 }, { userId: "athlete-b", id: 2 }], "athlete-a")).toEqual([{ userId: "athlete-a", id: 1 }]);
  });

  it("R retains memory provenance when separating a preference", () => {
    const result = applyMemoryOverrideRequest({ rawEvidence: Object.freeze({ sourceEventId: "event-1", result: "failure" }), currentCausalStrength: 0.3, requestedPreference: "prefer strategy X" });
    expect(result.reasonCodes).toContain("RAW_EVIDENCE_PRESERVED");
    expect(result.rawEvidence.sourceEventId).toBe("event-1");
  });

  it("S never mutates raw evidence during an override request", () => {
    const raw = Object.freeze({ sourceEventId: "event-1", result: "failure" });
    const result = applyMemoryOverrideRequest({ rawEvidence: raw, currentCausalStrength: 0.3, requestedPreference: "forget failure" });
    expect(result.rawEvidence).toBe(raw);
    expect(result.causalStrength).toBe(0.3);
  });

  it("T classifies an evaluable shadow disagreement without declaring a winner", () => {
    expect(evaluateShadowAgainstProduction({ productionAction: "USE_A", shadowAction: "ASK", expectedDimensionsOverlap: true, strategiesDefined: true, acceptableConfounding: true, outcomeAvailable: true, criticalMissingVariableFound: true }))
      .toEqual({ classification: "EVALUABLE_DISAGREEMENT", informationSeekingSupported: true, reasonCodes: ["INFORMATION_SEEKING_EVALUATED"], shadowWasBetter: null });
  });

  it("U leaves confounded disagreement unevaluable", () => {
    expect(evaluateShadowAgainstProduction({ productionAction: "USE_A", shadowAction: "USE_B", expectedDimensionsOverlap: true, strategiesDefined: true, acceptableConfounding: false, outcomeAvailable: true }).classification)
      .toBe("UNEVALUABLE_DISAGREEMENT");
  });

  it("V updates domain calibration gradually", () => {
    const next = updateDomainCalibration({ state: initialCalibrationState("recovery_prediction"), predictedProbability: 0.9, observed: false });
    expect(next.confidenceAdjustment).toBeCloseTo(-0.09);
    expect(next.domain).toBe("recovery_prediction");
  });

  it("W does not let one success reset prior calibration", () => {
    const damaged = { domain: "recovery_prediction" as const, sampleCount: 5, weightedBrierScore: 0.6, confidenceAdjustment: -0.4 };
    const next = updateDomainCalibration({ state: damaged, predictedProbability: 0.8, observed: true });
    expect(next.confidenceAdjustment).toBeLessThan(-0.3);
    expect(next.weightedBrierScore).toBeGreaterThan(0.4);
  });

  it("X contains Phase 4 persistence failure", async () => {
    const supabase = { from: () => { throw new Error("database unavailable"); } } as unknown as SupabaseClient;
    await expect(appendValidationEvent(supabase, {
      userId: "athlete-a", eventType: "INSTRUMENTATION_FAILURE", recommendationId: null, parentEventId: null, contextSignature: null, payload: {},
      provenance: { sourceTable: "none", sourceEventId: null, sourceModule: "test", capturedAt: now.toISOString(), rawEvidenceRetained: true, causalAuthority: "NONE" }, occurredAt: now.toISOString(),
    })).resolves.toBe(false);
  });

  it("Y enforces user-scoped dashboard inputs defensively", () => {
    const scoped = filterUserScoped([{ userId: "athlete-a", type: "trace" }, { userId: "athlete-b", type: "trace" }], "athlete-a");
    expect(scoped.every((item) => item.userId === "athlete-a")).toBe(true);
  });

  it("Z reports insufficient data and never promotion authority", () => {
    const report = buildPromotionReadinessReport({ safetyObservations: 0, safetyFailures: 0, isolationVerified: false, isolationFailures: 0, eligibleRecommendations: 0, completeTraces: 0, maturedRecommendations: 0, linkedOutcomes: 0, calibratedOutcomes: 0, driftLabels: 0, stabilityWindows: 0, evaluableShadowDisagreements: 0, memoryEvents: 0, provenanceCompleteMemoryEvents: 0 }, now.toISOString());
    expect(Object.values(report.gates).every((gate) => gate === "INSUFFICIENT_DATA")).toBe(true);
    expect(report).toMatchObject({ mode: "SHADOW", mayPromote: false });
  });

  it("requires registered thresholds and measured quality before any scientific gate can pass", () => {
    const evidence = {
      safetyObservations: 20, safetyFailures: 0, isolationVerified: true, isolationFailures: 0,
      eligibleRecommendations: 20, completeTraces: 20, maturedRecommendations: 20, linkedOutcomes: 20,
      calibratedOutcomes: 20, driftLabels: 20, stabilityWindows: 20, evaluableShadowDisagreements: 20,
      memoryEvents: 20, provenanceCompleteMemoryEvents: 20,
    };
    const withoutRegisteredMetrics = buildPromotionReadinessReport(evidence, now.toISOString(), {
      traceability: { minimumEligible: 10, minimumRate: 0.9 },
      outcomeCoverage: { minimumMatured: 10, minimumRate: 0.8 },
      calibration: { minimumOutcomes: 10, maximumBrierScore: 0.2 },
      drift: { minimumLabels: 10, maximumFalsePositiveRate: 0.1, maximumFalseNegativeRate: 0.1 },
      stability: { minimumWindows: 10, maximumIncidentRate: 0.1 },
      shadowValue: { minimumEvaluableDisagreements: 10, minimumInformationValueRate: 0.6 },
      dataCompleteness: { minimumEligible: 10, minimumMatured: 10, minimumTraceRate: 0.9, minimumOutcomeRate: 0.8 },
    });
    expect(withoutRegisteredMetrics.gates.calibration).toBe("INSUFFICIENT_DATA");
    expect(withoutRegisteredMetrics.gates.drift).toBe("INSUFFICIENT_DATA");
    expect(withoutRegisteredMetrics.gates.stability).toBe("INSUFFICIENT_DATA");
    expect(withoutRegisteredMetrics.gates.shadowValue).toBe("INSUFFICIENT_DATA");
    expect(withoutRegisteredMetrics.mayPromote).toBe(false);
  });
});
