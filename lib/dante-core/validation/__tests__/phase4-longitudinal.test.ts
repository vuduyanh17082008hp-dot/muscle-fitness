import { describe, expect, it } from "vitest";

import { initialCalibrationState, updateDomainCalibration } from "@/lib/dante-core/validation/calibration";
import { compareContext } from "@/lib/dante-core/validation/context-comparability";
import { validateDrift } from "@/lib/dante-core/validation/drift-validation";
import { applyMemoryOverrideRequest, assessStrategyEvidence, filterUserScoped, updateStrategyEvidence } from "@/lib/dante-core/validation/learning-integrity";
import { selectOutcomeLink } from "@/lib/dante-core/validation/outcome-linkage";
import { evaluateTypedOutcome } from "@/lib/dante-core/validation/typed-outcomes";
import type { ContextSignature } from "@/lib/dante-core/validation/types";

const baseContext: ContextSignature = {
  hard: { athleteId: "a", goal: "hypertrophy", acuteInjuryState: "none", interventionFamily: "volume" },
  soft: { trainingPhase: "accumulation", recoveryBand: "mid", sleepBand: "mid", stressBand: "mid" },
  capturedAt: "2026-09-01T00:00:00.000Z",
};

describe("Dante Phase 4 multi-week learning-integrity timelines", () => {
  it("Case A clean repeated success increases evidence gradually", () => {
    let strength = 0.3;
    const assessment = assessStrategyEvidence({ recommendationCompliedWith: true, independentOutcomeObserved: true, confounderCount: 0, outcomeStatus: "ALIGNED" });
    for (let week = 0; week < 4; week += 1) strength = updateStrategyEvidence({ currentStrength: strength, assessment, context: compareContext(baseContext, baseContext) });
    expect(strength).toBeCloseTo(0.62);
    expect(strength).toBeLessThan(1);
  });

  it("Case B material context shift keeps old evidence but reduces relevance", () => {
    const shifted = structuredClone(baseContext);
    shifted.soft.trainingPhase = "deload";
    shifted.soft.recoveryBand = "low";
    const comparison = compareContext(baseContext, shifted);
    expect(comparison.compatible).toBe(true);
    expect(comparison.score).toBeLessThan(1);
  });

  it("Case C confounded recovery gain and performance loss stays mixed", () => {
    const result = evaluateTypedOutcome([
      { dimension: "recovery", expected: { kind: "categorical", value: "UP" }, actual: { kind: "categorical", value: "UP" } },
      { dimension: "performance", expected: { kind: "categorical", value: "STABLE" }, actual: { kind: "categorical", value: "DOWN" } },
    ]);
    const evidence = assessStrategyEvidence({ recommendationCompliedWith: true, independentOutcomeObserved: true, confounderCount: 3, outcomeStatus: result.status === "MIXED" ? "MIXED" : "UNRESOLVED" });
    expect(result.status).toBe("MIXED");
    expect(evidence.causalUncertainty).toBe("HIGH");
  });

  it("Case D compliance alone does not become strategy evidence", () => {
    const assessment = assessStrategyEvidence({ recommendationCompliedWith: true, independentOutcomeObserved: false, confounderCount: 0, outcomeStatus: "ALIGNED" });
    expect(updateStrategyEvidence({ currentStrength: 0.4, assessment, context: compareContext(baseContext, baseContext) })).toBe(0.4);
  });

  it("Case E user memory poisoning preserves failures and causal state", () => {
    const raw = Object.freeze({ failures: ["week-2", "week-3"] });
    const result = applyMemoryOverrideRequest({ rawEvidence: raw, currentCausalStrength: 0.35, requestedPreference: "prefer X" });
    expect(result.rawEvidence).toBe(raw);
    expect(result.causalStrength).toBe(0.35);
    expect(result.preference).toBe("prefer X");
  });

  it("Case F one-off noise does not revise strategy or confirm drift", () => {
    const drift = validateDrift({ domain: "sleep", magnitudeThreshold: 2, candidatePoints: 2, confirmationPoints: 4, minimumConfidence: 0.8 }, [
      { domain: "sleep", magnitude: 3, confidence: 0.9, explicitTransition: false, occurredAt: "2026-09-08T00:00:00.000Z" },
    ]);
    expect(drift.stage).toBe("ANOMALY");
  });

  it("Case G persistent supported drift moves candidate then confirmed", () => {
    const policy = { domain: "schedule", magnitudeThreshold: 2, candidatePoints: 2, confirmationPoints: 3, minimumConfidence: 0.8 };
    const observations = [1, 2, 3].map((week) => ({ domain: "schedule", magnitude: 2, confidence: 0.9, explicitTransition: false, occurredAt: `2026-09-${week * 7}T00:00:00.000Z` }));
    expect(validateDrift(policy, observations.slice(0, 2)).stage).toBe("CANDIDATE");
    expect(validateDrift(policy, observations).stage).toBe("CONFIRMED");
  });

  it("Case H overlapping outcome horizons never guess recommendation A", () => {
    const recommendations = ["A", "B"].map((id) => ({ userId: "a", recommendationId: id, occurredAt: "2026-09-10T00:00:00.000Z", horizonStartMs: 0, horizonEndMs: 14 * 86_400_000, linked: false }));
    expect(selectOutcomeLink({ userId: "a", outcomeAt: new Date("2026-09-12T00:00:00.000Z"), recommendations })).toBeNull();
    expect(selectOutcomeLink({ userId: "a", outcomeAt: new Date("2026-09-12T00:00:00.000Z"), recommendations, explicitRecommendationId: "B" })?.recommendationId).toBe("B");
  });

  it("Case I user A history never enters user B timeline or calibration", () => {
    const records = filterUserScoped([{ userId: "a", outcome: true }, { userId: "b", outcome: false }], "b");
    let state = initialCalibrationState("recovery_prediction");
    for (const record of records) state = updateDomainCalibration({ state, predictedProbability: 0.8, observed: record.outcome });
    expect(records).toHaveLength(1);
    expect(state.sampleCount).toBe(1);
    expect(state.weightedBrierScore).toBeCloseTo(0.64);
  });

  it("runs a six-week deterministic trace without instant confidence recovery", () => {
    const outcomes = [false, false, true, false, true, true];
    let state = initialCalibrationState("performance_prediction");
    for (const observed of outcomes) state = updateDomainCalibration({ state, predictedProbability: 0.8, observed });
    expect(state.sampleCount).toBe(6);
    expect(state.weightedBrierScore).toBeCloseTo(0.34);
    expect(state.confidenceAdjustment).toBeLessThan(0);
  });
});
