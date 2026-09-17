import { describe, expect, it } from "vitest";

import { checkSafety } from "@/lib/dante-core/safety-layer";
import {
  assessAdaptationStability,
  buildUncertaintyProfile,
  classifyFailure,
  detectAthleteDrift,
  executeShadowControlFlow,
  informationValue,
  scoreContextualStrategies,
} from "@/lib/dante-core/shadow/adaptive-control";
import {
  governConsolidation,
  reevaluateFromRawEpisodes,
} from "@/lib/dante-core/shadow/consolidation-governor";
import {
  linkRecommendationOutcome,
  summarizeCalibration,
  unknownOutcome,
} from "@/lib/dante-core/shadow/outcome-calibration";
import {
  CURRENT_PHASE3_PROMOTION_LEVEL,
  type AdaptationRecord,
  type AthleteDriftSnapshot,
  type DriftAssessment,
  type ShadowControlInput,
  type ShadowStrategyScore,
  type StabilityAssessment,
  type UncertaintyProfile,
} from "@/lib/dante-core/shadow/types";

function uncertainty(overrides: Partial<Record<keyof UncertaintyProfile, number>> = {}): UncertaintyProfile {
  const entry = (name: keyof UncertaintyProfile) => ({ value: overrides[name] ?? 0.2, reasonCodes: [] });
  return {
    epistemic: entry("epistemic"),
    state: entry("state"),
    causal: entry("causal"),
    strategy: entry("strategy"),
    outcome: entry("outcome"),
    tool: entry("tool"),
  };
}

function stableDrift(userId = "user-a"): DriftAssessment {
  return {
    userId,
    status: "NONE",
    magnitude: 0,
    persistence: 0,
    confidence: 1,
    evidence: [],
    reasonCodes: ["NO_MATERIAL_DRIFT"],
  };
}

function stableHistory(userId = "user-a"): StabilityAssessment {
  return {
    userId,
    status: "STABLE",
    risk: 0,
    oscillation: false,
    repeatedReversals: false,
    runaway: false,
    selfCreatedEvidenceLoop: false,
    repeatedWithoutImprovement: false,
    reasonCodes: ["STABLE_ADAPTATION_HISTORY"],
  };
}

function strategy(id: string, score = 0.8, userId = "user-a"): ShadowStrategyScore {
  return {
    strategyId: id,
    userId,
    contextSignature: "poor_sleep",
    score,
    historicalFit: score,
    expectedUtility: score,
    informationGain: 0.1,
    risk: 0.15,
    cost: 0.1,
    instabilityPenalty: 0,
    driftPenalty: 0,
    reasonCodes: [],
  };
}

function control(overrides: Partial<ShadowControlInput> = {}): ShadowControlInput {
  return {
    userId: "user-a",
    contextSignature: "poor_sleep",
    uncertainty: uncertainty(),
    drift: stableDrift(),
    stability: stableHistory(),
    strategies: [strategy("reduce_volume")],
    missingHighValueFields: [],
    retrievableEvidenceAvailable: false,
    pendingOutcomeWindow: false,
    safetyRisk: 0,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AthleteDriftSnapshot> = {}): AthleteDriftSnapshot {
  return {
    userId: "user-a",
    capturedAt: "2026-09-01T00:00:00.000Z",
    goal: "hypertrophy",
    sleepHours: 8,
    scheduleDays: 4,
    stress: 3,
    trainingLoad: 20,
    recoveryScore: 80,
    calorieAdherence: 0.9,
    adherence: 0.9,
    communicationPreference: "coach",
    ...overrides,
  };
}

function adaptations(values: Array<Pick<AdaptationRecord, "action" | "direction" | "value" | "outcomeImproved" | "evidenceSource">>): AdaptationRecord[] {
  return values.map((value, index) => ({
    userId: "user-a",
    occurredAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    ...value,
  }));
}

describe("Dante Phase 3 shadow adaptive control", () => {
  it("A: chooses USE for low uncertainty in a stable context", () => {
    const result = executeShadowControlFlow(control());
    expect(result.action).toBe("USE");
    expect(result.selectedStrategyId).toBe("reduce_volume");
  });

  it("B: chooses ASK and returns the high-value missing fields", () => {
    const result = executeShadowControlFlow(control({
      uncertainty: uncertainty({ state: 0.8 }),
      missingHighValueFields: ["sleep_hours", "stress"],
    }));
    expect(result.action).toBe("ASK");
    expect(result.questionTargets).toEqual(["sleep_hours", "stress"]);
  });

  it("C: chooses RETRIEVE when missing evidence is retrievable", () => {
    const result = executeShadowControlFlow(control({
      uncertainty: uncertainty({ epistemic: 0.8 }),
      retrievableEvidenceAvailable: true,
    }));
    expect(result.action).toBe("RETRIEVE");
    expect(result.retrievalContext).toBe("poor_sleep");
  });

  it("D: explores multiple plausible safe strategies only as alternatives", () => {
    const result = executeShadowControlFlow(control({
      uncertainty: uncertainty({ strategy: 0.6 }),
      strategies: [strategy("a", 0.7), strategy("b", 0.65)],
    }));
    expect(result.action).toBe("EXPLORE");
    expect(result.selectedStrategyId).toBeNull();
    expect(result.alternativeStrategyIds).toEqual(["a", "b"]);
  });

  it("E: waits for an immature prior outcome window", () => {
    expect(executeShadowControlFlow(control({ pendingOutcomeWindow: true })).action).toBe("WAIT");
  });

  it("F: abstains under high risk and weak evidence", () => {
    const result = executeShadowControlFlow(control({
      safetyRisk: 0.9,
      uncertainty: uncertainty({ epistemic: 0.9 }),
    }));
    expect(result.action).toBe("ABSTAIN");
    expect(result.selectedStrategyId).toBeNull();
  });

  it("keeps uncertainty dimensions independent", () => {
    const profile = buildUncertaintyProfile({
      verifiedEvidenceCount: 5,
      missingStateFields: ["sleep"],
      stateConfidence: 0.2,
      confounderCount: 3,
      causalEvidenceCount: 3,
      strategySampleCount: 8,
      strategyConfidence: 0.9,
      outcomeMature: true,
      outcomeAvailable: true,
      toolAttempted: true,
      toolSucceeded: false,
    });
    expect(profile.state.value).toBeGreaterThan(profile.epistemic.value);
    expect(profile.causal.reasonCodes).toContain("CONFOUNDED_OUTCOME");
    expect(profile.tool.reasonCodes).toContain("TOOL_EXECUTION_FAILED");
    expect(profile.tool.value).not.toBe(profile.causal.value);
  });

  it("G: treats one abnormal day as a drift candidate, not confirmed drift", () => {
    const result = detectAthleteDrift({
      userId: "user-a",
      baseline: snapshot(),
      current: snapshot({ capturedAt: "2026-09-10T00:00:00.000Z", sleepHours: 5 }),
      recent: [],
    });
    expect(result.status).toBe("CANDIDATE");
    expect(result.evidence[0]?.confirmed).toBe(false);
  });

  it("H: confirms persistent multi-day athlete-state drift", () => {
    const result = detectAthleteDrift({
      userId: "user-a",
      baseline: snapshot(),
      current: snapshot({ capturedAt: "2026-09-12T00:00:00.000Z", sleepHours: 5 }),
      recent: [
        snapshot({ capturedAt: "2026-09-10T00:00:00.000Z", sleepHours: 5.2 }),
        snapshot({ capturedAt: "2026-09-11T00:00:00.000Z", sleepHours: 5.1 }),
      ],
    });
    expect(result.status).toBe("CONFIRMED");
    expect(result.reasonCodes).toContain("DRIFT_CONFIRMED_SLEEPHOURS");
  });

  it("I: detects A-B-A-B oscillation", () => {
    const result = assessAdaptationStability("user-a", adaptations([
      { action: "A", direction: "INCREASE", value: null, outcomeImproved: null, evidenceSource: "user_report" },
      { action: "B", direction: "DECREASE", value: null, outcomeImproved: null, evidenceSource: "user_report" },
      { action: "A", direction: "INCREASE", value: null, outcomeImproved: null, evidenceSource: "user_report" },
      { action: "B", direction: "DECREASE", value: null, outcomeImproved: null, evidenceSource: "user_report" },
    ]));
    expect(result.oscillation).toBe(true);
    expect(result.status).toBe("UNSTABLE");
  });

  it("J: does not call diverse USE-ASK-RETRIEVE-WAIT actions oscillation", () => {
    const result = assessAdaptationStability("user-a", adaptations([
      { action: "USE", direction: "OTHER", value: null, outcomeImproved: null, evidenceSource: "user_report" },
      { action: "ASK", direction: "OTHER", value: null, outcomeImproved: null, evidenceSource: "user_report" },
      { action: "RETRIEVE", direction: "OTHER", value: null, outcomeImproved: null, evidenceSource: "user_report" },
      { action: "WAIT", direction: "OTHER", value: null, outcomeImproved: null, evidenceSource: "user_report" },
    ]));
    expect(result.oscillation).toBe(false);
  });

  it("K: flags self-created evidence without independent confirmation", () => {
    const result = assessAdaptationStability("user-a", adaptations([
      { action: "reduce", direction: "DECREASE", value: 90, outcomeImproved: null, evidenceSource: "dante_recommendation" },
      { action: "reduce", direction: "DECREASE", value: 80, outcomeImproved: null, evidenceSource: "dante_recommendation" },
    ]));
    expect(result.selfCreatedEvidenceLoop).toBe(true);
    expect(result.reasonCodes).toContain("SELF_CREATED_EVIDENCE_LOOP");
  });

  it("detects runaway repeated reductions without improvement", () => {
    const result = assessAdaptationStability("user-a", adaptations([100, 90, 80, 70].map((value) => ({
      action: "reduce_volume",
      direction: "DECREASE" as const,
      value,
      outcomeImproved: false,
      evidenceSource: "independent_outcome" as const,
    }))));
    expect(result.runaway).toBe(true);
  });

  it("L: preserves recovery improvement plus performance decline as mixed dimensions", () => {
    const expected = unknownOutcome();
    expected.recovery = "IMPROVED";
    expected.performance = "IMPROVED";
    const actual = unknownOutcome();
    actual.recovery = "IMPROVED";
    actual.performance = "DECLINED";
    const linked = linkRecommendationOutcome({
      userId: "user-a",
      recommendationId: "r1",
      horizon: "next_day",
      expected,
      actual,
      horizonMature: true,
    });
    expect(linked.actual?.recovery).toBe("IMPROVED");
    expect(linked.actual?.performance).toBe("DECLINED");
    expect(linked.errors.recovery).toBe(0);
    expect(linked.errors.performance).toBe(-1);
  });

  it("M: leaves a missing future outcome UNKNOWN", () => {
    const linked = linkRecommendationOutcome({
      userId: "user-a",
      recommendationId: "r1",
      horizon: "next_day",
      expected: unknownOutcome(),
      actual: null,
      horizonMature: true,
    });
    expect(linked.status).toBe("UNKNOWN");
    expect(linked.actual).toBeNull();
  });

  it("N: links a mature future outcome to its earlier recommendation", () => {
    const linked = linkRecommendationOutcome({
      userId: "user-a",
      recommendationId: "recommendation-42",
      horizon: "next_day",
      expected: unknownOutcome(),
      actual: unknownOutcome(),
      horizonMature: true,
    });
    expect(linked.status).toBe("EVALUATED");
    expect(linked.recommendationId).toBe("recommendation-42");
  });

  it("O: excludes Client A calibration history from Client B", () => {
    const summary = summarizeCalibration({
      userId: "user-b",
      domain: "strategy_selection",
      observations: [
        { userId: "user-a", domain: "strategy_selection", contextSignature: "x", priorConfidence: 1, correct: true, observedAt: "2026-09-01" },
        { userId: "user-b", domain: "strategy_selection", contextSignature: "x", priorConfidence: 0.4, correct: false, observedAt: "2026-09-01" },
      ],
    });
    expect(summary.sampleCount).toBe(1);
    expect(summary.meanConfidence).toBe(0.4);
    expect(summary.observedAccuracy).toBe(0);
  });

  it("P: quarantines one anomalous outcome", () => {
    expect(governConsolidation({
      userId: "user-a", candidateId: "c", provenanceEpisodeIds: ["e1"], evidenceCount: 5,
      confidence: 0.8, contradictionCount: 1, cleanContradictionCount: 1, stale: false,
      supported: true, anomalousOutcomeCount: 1,
    }).action).toBe("QUARANTINE");
  });

  it("Q: revises after repeated clean contradiction", () => {
    expect(governConsolidation({
      userId: "user-a", candidateId: "c", provenanceEpisodeIds: ["e1", "e2"], evidenceCount: 5,
      confidence: 0.6, contradictionCount: 2, cleanContradictionCount: 2, stale: false,
      supported: true, anomalousOutcomeCount: 0,
    }).action).toBe("REVISE");
  });

  it("R: rejects an unsupported candidate without deleting provenance", () => {
    const result = governConsolidation({
      userId: "user-a", candidateId: "c", provenanceEpisodeIds: ["e1"], evidenceCount: 1,
      confidence: 0.2, contradictionCount: 0, cleanContradictionCount: 0, stale: false,
      supported: false, anomalousOutcomeCount: 0,
    });
    expect(result.action).toBe("REJECT");
    expect(result.preservedEpisodeIds).toEqual(["e1"]);
  });

  it("S: keeps raw episodes immutable while reevaluating copied evidence", () => {
    const episode = { userId: "user-a", id: "e1", outcome: "improved" };
    const result = reevaluateFromRawEpisodes({
      userId: "user-a",
      episodes: [episode],
      evaluate: (copies) => {
        copies[0]!.outcome = "changed-only-in-copy";
        return {
          userId: "user-a", candidateId: "c", provenanceEpisodeIds: ["e1"], evidenceCount: 1,
          confidence: 0.4, contradictionCount: 0, cleanContradictionCount: 0, stale: false,
          supported: true, anomalousOutcomeCount: 0,
        };
      },
    });
    expect(result.episodesIntact).toBe(true);
    expect(episode.outcome).toBe("improved");
  });

  it.each([
    ["T", "đau ngực khi chạy nhưng vẫn muốn PR"],
    ["U", "my chest hurts but I want to keep training"],
    ["V", "I feel khó thở after cardio"],
  ])("%s: preserves dominant Phase 1 multilingual safety", (_case, message) => {
    expect(checkSafety(message).triggered).toBe(true);
  });

  it("maps failures to distinct reactions instead of strategy failure", () => {
    expect(classifyFailure({ message: "connector unavailable" }).failureClass).toBe("TOOL_UNAVAILABLE");
    expect(classifyFailure({ message: "missing data" }).metaAction).toBe("ASK");
    expect(classifyFailure({ predictionWasWrong: true }).behavior).toBe("UPDATE_CALIBRATION");
  });

  it("penalizes stale strategies under confirmed drift and rejects cross-user scoring", () => {
    const drift = { ...stableDrift(), status: "CONFIRMED" as const, magnitude: 1, confidence: 1 };
    const scored = scoreContextualStrategies({
      userId: "user-a",
      contextSignature: "poor_sleep",
      drift,
      stability: stableHistory(),
      candidates: [{
        id: "a", userId: "user-a", contextSignature: "poor_sleep",
        expectedUtility: 0.8, informationGain: 0.1, risk: 0.1, cost: 0.1,
      }],
    });
    expect(scored[0]?.driftPenalty).toBeGreaterThan(0);
    expect(() => scoreContextualStrategies({
      userId: "user-b",
      contextSignature: "poor_sleep",
      drift: stableDrift("user-b"),
      stability: stableHistory("user-b"),
      candidates: [{
        id: "a", userId: "user-a", contextSignature: "poor_sleep",
        expectedUtility: 0.8, informationGain: 0.1, risk: 0.1, cost: 0.1,
      }],
    })).toThrow(/Cross-client/);
  });

  it("uses information gain without treating random exploration as free", () => {
    expect(informationValue({ expectedUtility: 0.3, informationGain: 0.7, risk: 0.1, cost: 0.1, instability: 0 })).toBe(0.8);
    expect(informationValue({ expectedUtility: 0.7, informationGain: 0, risk: 0.4, cost: 0.2, instability: 0.5 })).toBeLessThan(0);
  });

  it("hard-codes the current promotion level to SHADOW", () => {
    expect(CURRENT_PHASE3_PROMOTION_LEVEL).toBe("SHADOW");
  });
});
