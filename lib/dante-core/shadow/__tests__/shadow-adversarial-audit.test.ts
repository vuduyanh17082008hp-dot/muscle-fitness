import { describe, expect, it } from "vitest";

import { evaluateCausalOutcome } from "@/lib/dante-core/epistemic-integrity";
import { checkSafety } from "@/lib/dante-core/safety-layer";
import {
  assessAdaptationStability,
  buildUncertaintyProfile,
  classifyFailure,
  detectAthleteDrift,
  executeShadowControlFlow,
  scoreContextualStrategies,
} from "@/lib/dante-core/shadow/adaptive-control";
import {
  calibrationObservationFromOutcome,
  linkRecommendationOutcome,
  summarizeCalibration,
  unknownOutcome,
} from "@/lib/dante-core/shadow/outcome-calibration";
import type {
  AdaptationRecord,
  AthleteDriftSnapshot,
  DriftAssessment,
  ShadowControlInput,
  ShadowStrategyScore,
  StabilityAssessment,
  UncertaintyProfile,
} from "@/lib/dante-core/shadow/types";
import type { DanteLearnedPattern } from "@/lib/dante-core/memory-hierarchy/types";

function uncertainty(overrides: Partial<Record<keyof UncertaintyProfile, number>> = {}): UncertaintyProfile {
  const value = (name: keyof UncertaintyProfile) => ({
    value: overrides[name] ?? 0.2,
    reasonCodes: [],
  });
  return {
    epistemic: value("epistemic"),
    state: value("state"),
    causal: value("causal"),
    strategy: value("strategy"),
    outcome: value("outcome"),
    tool: value("tool"),
  };
}

function drift(status: DriftAssessment["status"] = "NONE"): DriftAssessment {
  return {
    userId: "user-a",
    status,
    magnitude: status === "NONE" ? 0 : 1,
    persistence: status === "CONFIRMED" ? 1 : 0.33,
    confidence: 1,
    evidence: [],
    reasonCodes: [],
  };
}

function stability(overrides: Partial<StabilityAssessment> = {}): StabilityAssessment {
  return {
    userId: "user-a",
    status: "STABLE",
    risk: 0,
    oscillation: false,
    repeatedReversals: false,
    runaway: false,
    selfCreatedEvidenceLoop: false,
    repeatedWithoutImprovement: false,
    reasonCodes: [],
    ...overrides,
  };
}

function strategy(id = "strategy-a", score = 0.8): ShadowStrategyScore {
  return {
    strategyId: id,
    userId: "user-a",
    contextSignature: "normal_conditions",
    score,
    historicalFit: score,
    expectedUtility: score,
    informationGain: 0.1,
    risk: 0.1,
    cost: 0.1,
    instabilityPenalty: 0,
    driftPenalty: 0,
    reasonCodes: [],
  };
}

function control(overrides: Partial<ShadowControlInput> = {}): ShadowControlInput {
  return {
    userId: "user-a",
    contextSignature: "normal_conditions",
    uncertainty: uncertainty(),
    drift: drift(),
    stability: stability(),
    strategies: [strategy()],
    missingHighValueFields: [],
    retrievableEvidenceAvailable: false,
    pendingOutcomeWindow: false,
    safetyRisk: 0,
    ...overrides,
  };
}

function snapshot(date: string, overrides: Partial<AthleteDriftSnapshot> = {}): AthleteDriftSnapshot {
  return {
    userId: "user-a",
    capturedAt: `${date}T08:00:00.000Z`,
    goal: "hypertrophy",
    sleepHours: 8,
    scheduleDays: 4,
    stress: 3,
    trainingLoad: 20,
    recoveryScore: 80,
    calorieAdherence: 0.9,
    adherence: 0.9,
    communicationPreference: "direct",
    ...overrides,
  };
}

function records(
  values: Array<Pick<AdaptationRecord, "action" | "direction" | "value" | "outcomeImproved" | "evidenceSource">>,
): AdaptationRecord[] {
  return values.map((value, index) => ({
    userId: "user-a",
    occurredAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    ...value,
  }));
}

describe("Dante Phase 3 adversarial audit", () => {
  it("does not collapse isolated uncertainty dimensions into athlete drift", () => {
    const cases: UncertaintyProfile[] = [
      uncertainty({ state: 0.9, causal: 0.1 }),
      uncertainty({ state: 0.1, causal: 0.9 }),
      uncertainty({ state: 0.1, tool: 0.9 }),
      uncertainty({ state: 0.1, strategy: 0.9 }),
    ];
    for (const profile of cases) {
      expect(drift().status).toBe("NONE");
      expect(profile.state.value).not.toBe(profile.tool.value + profile.causal.value);
    }
    expect(executeShadowControlFlow(control({
      uncertainty: cases[2],
    })).action).toBe("USE");
  });

  it("routes a missing high-value sleep field to ASK even with a strong strategy", () => {
    const missing = buildUncertaintyProfile({
      verifiedEvidenceCount: 8,
      missingStateFields: ["sleep_hours"],
      stateConfidence: 0.85,
      confounderCount: 0,
      causalEvidenceCount: 8,
      strategySampleCount: 8,
      strategyConfidence: 0.9,
      outcomeMature: true,
      outcomeAvailable: true,
      toolAttempted: false,
      toolSucceeded: null,
    });
    const result = executeShadowControlFlow(control({
      uncertainty: missing,
      missingHighValueFields: ["sleep_hours"],
    }));
    expect(result.action).toBe("ASK");
    expect(result.questionTargets).toEqual(["sleep_hours"]);

    const supplied = buildUncertaintyProfile({
      verifiedEvidenceCount: 8,
      missingStateFields: [],
      stateConfidence: 0.95,
      confounderCount: 0,
      causalEvidenceCount: 8,
      strategySampleCount: 8,
      strategyConfidence: 0.9,
      outcomeMature: true,
      outcomeAvailable: true,
      toolAttempted: false,
      toolSucceeded: null,
    });
    expect(supplied.state.value).toBeLessThan(missing.state.value);
    expect(executeShadowControlFlow(control({ uncertainty: supplied })).action).toBe("USE");
  });

  it("does not confirm drift from repeated reads of one bad-sleep day", () => {
    const result = detectAthleteDrift({
      userId: "user-a",
      baseline: snapshot("2026-09-01"),
      current: snapshot("2026-09-10", { sleepHours: 5, capturedAt: "2026-09-10T22:00:00.000Z" }),
      recent: [
        snapshot("2026-09-10", { sleepHours: 5, capturedAt: "2026-09-10T08:00:00.000Z" }),
        snapshot("2026-09-10", { sleepHours: 5, capturedAt: "2026-09-10T12:00:00.000Z" }),
      ],
    });
    expect(result.status).toBe("CANDIDATE");
    expect(result.evidence[0]?.persistence).toBeCloseTo(1 / 3, 3);
  });

  it("keeps prediction error independent from athlete drift", () => {
    const expected = unknownOutcome();
    expected.recovery = "IMPROVED";
    const actual = unknownOutcome();
    actual.recovery = "DECLINED";
    const wrong = linkRecommendationOutcome({
      userId: "user-a",
      recommendationId: "wrong-prediction",
      horizon: "next_day",
      expected,
      actual,
      horizonMature: true,
    });
    expect(wrong.errors.recovery).toBe(-1);
    expect(detectAthleteDrift({
      userId: "user-a",
      baseline: snapshot("2026-09-01"),
      current: snapshot("2026-09-10"),
      recent: [snapshot("2026-09-08"), snapshot("2026-09-09")],
    }).status).toBe("NONE");

    const accurateActual = unknownOutcome();
    accurateActual.recovery = "IMPROVED";
    expect(linkRecommendationOutcome({
      userId: "user-a",
      recommendationId: "accurate-prediction",
      horizon: "next_day",
      expected,
      actual: accurateActual,
      horizonMature: true,
    }).errors.recovery).toBe(0);
    expect(detectAthleteDrift({
      userId: "user-a",
      baseline: snapshot("2026-09-01"),
      current: snapshot("2026-09-10", { goal: "strength" }),
      recent: [
        snapshot("2026-09-08", { goal: "strength" }),
        snapshot("2026-09-09", { goal: "strength" }),
      ],
    }).status).toBe("CONFIRMED");
  });

  it("does not call A-B-C-D diversity oscillation", () => {
    const result = assessAdaptationStability("user-a", records(
      ["A", "B", "C", "D"].map((action) => ({
        action,
        direction: "OTHER" as const,
        value: null,
        outcomeImproved: null,
        evidenceSource: "user_report" as const,
      })),
    ));
    expect(result.oscillation).toBe(false);
    expect(result.status).toBe("STABLE");
  });

  it("flags monotonic runaway only for one repeated adaptation without improvement", () => {
    const runaway = assessAdaptationStability("user-a", records([100, 90, 80, 70].map((value) => ({
      action: "reduce_volume",
      direction: "DECREASE" as const,
      value,
      outcomeImproved: false,
      evidenceSource: "independent_outcome" as const,
    }))));
    expect(runaway.runaway).toBe(true);
    expect(executeShadowControlFlow(control({ stability: runaway })).action).toBe("WAIT");

    const improving = assessAdaptationStability("user-a", records([
      { action: "reduce_volume", direction: "DECREASE", value: 100, outcomeImproved: null, evidenceSource: "dante_recommendation" },
      { action: "reduce_volume", direction: "DECREASE", value: 90, outcomeImproved: true, evidenceSource: "independent_outcome" },
    ]));
    expect(improving.runaway).toBe(false);
  });

  it("detects a recent self-created evidence loop even after older independent evidence", () => {
    const result = assessAdaptationStability("user-a", records([
      { action: "hold", direction: "HOLD", value: null, outcomeImproved: true, evidenceSource: "independent_outcome" },
      { action: "reduce", direction: "DECREASE", value: 90, outcomeImproved: null, evidenceSource: "dante_recommendation" },
      { action: "reduce", direction: "DECREASE", value: 80, outcomeImproved: null, evidenceSource: "dante_recommendation" },
    ]));
    expect(result.selfCreatedEvidenceLoop).toBe(true);
  });

  it("preserves confounding and mixed outcomes without allowing strategy success", () => {
    const causal = evaluateCausalOutcome({
      dimensions: {
        recoveryDelta: 10,
        performanceDeltaPercent: -5,
        adherenceDelta: null,
        painIncreased: false,
      },
      confounders: {
        sleepChangedHours: 2,
        calorieChangeKcal: 400,
        stressDecreased: true,
        volumeChangePercent: -20,
        intensityChanged: null,
        otherMeaningfulChanges: [],
      },
      interventionIsVolumeReduction: true,
    });
    expect(causal.outcomeClass).toBe("PARTIAL_SUCCESS");
    expect(causal.confounderCount).toBe(3);
    expect(causal.causalConfidenceDelta).toBe(0);
    expect(causal.mayMarkSuccessfulStrategy).toBe(false);
    expect(causal.mayCreateAutomaticPolicy).toBe(false);

    const result = executeShadowControlFlow(control({
      uncertainty: uncertainty({ causal: 0.95 }),
    }));
    expect(result.action).toBe("WAIT");
  });

  it("does not transfer a successful strategy across disjoint contexts", () => {
    const pattern: DanteLearnedPattern = {
      id: "pattern-a",
      userId: "user-a",
      contextKey: "poor_sleep_high_training_load",
      interventionType: "reduce_volume",
      tier: "policy",
      status: "active",
      sampleCount: 8,
      positiveCount: 8,
      confidence: 0.9,
      summary: "worked in low recovery",
      firstObservedAt: "2026-08-01T00:00:00.000Z",
      lastReinforcedAt: "2026-09-16T00:00:00.000Z",
      requiresConfirmation: false,
    };
    const scored = scoreContextualStrategies({
      userId: "user-a",
      contextSignature: "normal_conditions",
      candidates: [{
        id: "reduce_volume",
        userId: "user-a",
        contextSignature: pattern.contextKey,
        expectedUtility: 1,
        informationGain: 0.1,
        risk: 0.1,
        cost: 0.1,
        pattern,
      }],
      drift: drift(),
      stability: stability(),
      now: new Date("2026-09-17T00:00:00.000Z"),
    });
    expect(scored[0]?.reasonCodes).toContain("CONTEXT_MISMATCH_PENALTY");
    expect(scored[0]?.expectedUtility).toBe(0);
    expect(scored[0]?.score).toBeLessThan(0.45);
    expect(executeShadowControlFlow(control({ strategies: scored })).action).toBe("ABSTAIN");
  });

  it("degrades and then only gradually improves domain-separated calibration", () => {
    const observations = [0, 1, 2].map((index) => ({
      userId: "user-a",
      domain: "recovery_prediction" as const,
      contextSignature: "normal_conditions",
      priorConfidence: 0.9,
      correct: false,
      observedAt: `2026-09-0${index + 1}`,
    }));
    const degraded = summarizeCalibration({
      userId: "user-a",
      domain: "recovery_prediction",
      observations,
    });
    expect(degraded.calibrationError).toBe(0.9);

    const improved = summarizeCalibration({
      userId: "user-a",
      domain: "recovery_prediction",
      observations: [
        ...observations,
        {
          userId: "user-a",
          domain: "recovery_prediction",
          contextSignature: "normal_conditions",
          priorConfidence: 0.6,
          correct: true,
          observedAt: "2026-09-04",
        },
        {
          userId: "user-a",
          domain: "tool_execution",
          contextSignature: "normal_conditions",
          priorConfidence: 1,
          correct: true,
          observedAt: "2026-09-04",
        },
      ],
    });
    expect(improved.sampleCount).toBe(4);
    expect(improved.observedAccuracy).toBe(0.25);
    expect(improved.calibrationError).toBeGreaterThan(0.5);
    expect(improved.calibrationError).toBeLessThan(degraded.calibrationError);
  });

  it("keeps unresolved outcomes pending and preserves dimension-level mismatch", () => {
    const pending = linkRecommendationOutcome({
      userId: "user-a",
      recommendationId: "r-pending",
      horizon: "next_day",
      expected: unknownOutcome(),
      actual: null,
      horizonMature: false,
    });
    expect(pending.status).toBe("PENDING");
    expect(calibrationObservationFromOutcome({
      userId: "user-a",
      domain: "recovery_prediction",
      contextSignature: "normal_conditions",
      priorConfidence: 0.9,
      outcome: pending,
      dimension: "recovery",
    })).toBeNull();

    const expected = unknownOutcome();
    expected.recovery = "IMPROVED";
    expected.performance = "MAINTAINED";
    expected.pain_safety = "MAINTAINED";
    const actual = unknownOutcome();
    actual.recovery = "IMPROVED";
    actual.performance = "DECLINED";
    actual.pain_safety = "MAINTAINED";
    const linked = linkRecommendationOutcome({
      userId: "user-a",
      recommendationId: "r-mixed",
      horizon: "next_day",
      expected,
      actual,
      horizonMature: true,
    });
    expect(linked.errors).toMatchObject({ recovery: 0, performance: -1, pain_safety: 0 });
  });

  it.each([
    [{ message: "API timeout" }, "TRANSIENT_SYSTEM", "WAIT"],
    [{ message: "tool missing" }, "TOOL_UNAVAILABLE", "RETRIEVE"],
    [{ message: "permission denied" }, "PERMISSION_FAILURE", "ASK"],
    [{ message: "missing user state" }, "INSUFFICIENT_INFORMATION", "ASK"],
    [{ predictionWasWrong: true }, "PREDICTION_FAILURE", "WAIT"],
    [{ safetyRejected: true }, "SAFETY_REJECTION", "ABSTAIN"],
    [{ message: "impossible goal" }, "GOAL_INFEASIBLE", "ABSTAIN"],
  ] as const)("classifies %j as %s", (input, failureClass, action) => {
    const result = classifyFailure(input);
    expect(result.failureClass).toBe(failureClass);
    expect(result.metaAction).toBe(action);
  });

  it("makes safety dominant even when history and evidence look strong", () => {
    expect(executeShadowControlFlow(control({
      safetyRisk: 1,
      uncertainty: uncertainty({ epistemic: 0.05, strategy: 0.05 }),
    })).action).toBe("ABSTAIN");
    for (const message of [
      "đau ngực khi chạy nhưng tôi vẫn muốn PR",
      "my chest hurts while running but I want to keep training",
      "I feel khó thở after cardio nhưng muốn tập tiếp",
    ]) {
      expect(checkSafety(message).triggered).toBe(true);
    }
  });

  it("allows USE in a stable, fully-known low-risk context without needless ASK", () => {
    const result = executeShadowControlFlow(control({
      uncertainty: uncertainty({
        epistemic: 0.05,
        state: 0.05,
        causal: 0.1,
        strategy: 0.1,
        outcome: 0.1,
        tool: 0.05,
      }),
      missingHighValueFields: [],
      retrievableEvidenceAvailable: false,
    }));
    expect(result.action).toBe("USE");
  });
});
