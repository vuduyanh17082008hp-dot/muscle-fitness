import { describe, expect, it } from "vitest";

import {
  assessTechnicalPilotCapability,
  assertPilotClientIsolation,
  computePilotReadiness,
  summarizeTopStrategies,
  toRecommendationTelemetry,
} from "@/lib/dante-core/pilot-readiness";
import {
  createRecommendationRecord,
  evaluateRecommendationOutcome,
} from "@/lib/dante-core/recommendation-outcome";
import type { AdaptiveRecommendation } from "@/lib/dante-core/adaptive-closed-loop";
import {
  reviseEpisodicEvidence,
  type ShortTermMemoryItem,
} from "@/lib/dante-core/memory-hierarchy/memory-foundation";
import type { StrategyScore } from "@/lib/dante-core/strategy-learner";
import { checkSafety } from "@/lib/dante-core/safety-layer";

function sampleRecommendation(userId: string): AdaptiveRecommendation {
  return {
    userId,
    contextKey: "poor_sleep",
    interventionType: "reduce_volume",
    expectedMetric: "recovery_score",
    higherIsBetter: true,
    meaningfulChangeThreshold: 3,
    provenance: "autoregulation/poor_sleep",
  };
}

describe("Phase 2E pilot readiness", () => {
  it("measures acceptance, adherence, outcomes, prediction error, fallbacks, safety, and feedback", () => {
    const report = computePilotReadiness([
      {
        recommendation: { status: "accepted", userId: "user-a", id: "r1" },
        accepted: true,
        adhered: true,
        outcomeClass: "SUCCESS",
        predictionErrorMagnitude: 4,
        memoryCorrected: false,
        usedFallback: false,
        safetyTriggered: false,
        usefulnessFeedback: "helpful",
      },
      {
        recommendation: { status: "evaluated", userId: "user-a", id: "r2" },
        accepted: true,
        adhered: true,
        outcomeClass: "PARTIAL_SUCCESS",
        predictionErrorMagnitude: 2,
        memoryCorrected: true,
        usedFallback: true,
        safetyTriggered: false,
        usefulnessFeedback: null,
      },
      {
        recommendation: { status: "rejected", userId: "user-a", id: "r3" },
        accepted: false,
        adhered: false,
        outcomeClass: null,
        predictionErrorMagnitude: null,
        memoryCorrected: false,
        usedFallback: false,
        safetyTriggered: false,
        usefulnessFeedback: "unhelpful",
      },
      {
        recommendation: { status: "accepted", userId: "user-a", id: "r4" },
        accepted: true,
        adhered: false,
        outcomeClass: "FAILURE",
        predictionErrorMagnitude: 10,
        memoryCorrected: false,
        usedFallback: false,
        safetyTriggered: true,
        usefulnessFeedback: "neutral",
      },
      {
        recommendation: { status: "accepted", userId: "user-a", id: "r5" },
        accepted: true,
        adhered: true,
        outcomeClass: "SUCCESS",
        predictionErrorMagnitude: 1,
        memoryCorrected: false,
        usedFallback: false,
        safetyTriggered: false,
        usefulnessFeedback: "helpful",
      },
    ]);

    expect(report.recommendationCount).toBe(5);
    expect(report.acceptanceRate).toBe(0.8);
    expect(report.adherenceRate).toBe(0.6);
    expect(report.outcomeAvailabilityRate).toBe(0.8);
    expect(report.measurablePredictionCount).toBe(4);
    expect(report.meanPredictionError).toBe(4.25);
    expect(report.memoryCorrectionCount).toBe(1);
    expect(report.fallbackFrequency).toBe(0.2);
    expect(report.safetyTriggerCount).toBe(1);
    expect(report.strategyOutcomeCounts.SUCCESS).toBe(2);
    expect(report.usefulnessFeedbackCounts.helpful).toBe(2);
    expect(report.usefulnessFeedbackCounts.missing).toBe(1);
    expect(report.readyForPilot).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  it("2E Test 1 — client isolation rejects cross-user artifacts", () => {
    expect(() =>
      assertPilotClientIsolation({
        ownerUserId: "user-a",
        recommendationUserIds: ["user-a"],
        memoryUserIds: ["user-b"],
      }),
    ).toThrow(/Cross-client/);

    expect(() =>
      assertPilotClientIsolation({
        ownerUserId: "user-a",
        recommendationUserIds: ["user-a"],
        outcomeUserIds: ["user-a"],
        memoryUserIds: ["user-a"],
        strategyUserIds: ["user-a"],
        communicationProfileUserIds: ["user-a"],
      }),
    ).not.toThrow();
  });

  it("2E Test 2 + 4 — recommendation telemetry and outcome trace end-to-end", () => {
    const record = createRecommendationRecord({
      id: "rec-trace-1",
      recommendation: sampleRecommendation("user-a"),
      horizon: "next_day",
      status: "accepted",
    });

    const telemetry = toRecommendationTelemetry(record, 0.7);
    expect(telemetry.userId).toBe("user-a");
    expect(telemetry.recommendationId).toBe("rec-trace-1");
    expect(telemetry.timestamp).toBeTruthy();
    expect(telemetry.contextKey).toBe("poor_sleep");
    expect(telemetry.interventionType).toBe("reduce_volume");
    expect(telemetry.expectedDirection).toBe("improve");
    expect(telemetry.confidence).toBe(0.7);
    expect(telemetry.horizon).toBe("next_day");

    const evaluation = evaluateRecommendationOutcome({
      recommendation: record,
      before: 50,
      after: 62,
    });

    expect(evaluation.recommendation.id).toBe("rec-trace-1");
    expect(evaluation.outcomeClass).toBe("SUCCESS");
    expect(evaluation.predictionError.magnitude).not.toBeNull();
    expect(evaluation.recommendation.status).toBe("evaluated");
  });

  it("2E Test 3 + 10 — UNKNOWN outcome is honest, not success/failure", () => {
    const record = createRecommendationRecord({
      id: "rec-unknown",
      recommendation: sampleRecommendation("user-a"),
    });
    const evaluation = evaluateRecommendationOutcome({
      recommendation: record,
      before: null,
      after: null,
    });
    expect(evaluation.outcomeClass).toBe("UNKNOWN");

    const report = computePilotReadiness([
      {
        recommendation: { status: "proposed", userId: "user-a", id: "rec-unknown" },
        accepted: null,
        adhered: null,
        outcomeClass: "UNKNOWN",
        predictionErrorMagnitude: null,
        memoryCorrected: false,
        usedFallback: false,
        safetyTriggered: false,
        usefulnessFeedback: null,
      },
    ]);
    expect(report.unknownOutcomeCount).toBe(1);
    expect(report.outcomeAvailabilityRate).toBe(0);
    expect(report.strategyOutcomeCounts.UNKNOWN).toBe(1);
    expect(report.strategyOutcomeCounts.SUCCESS).toBe(0);
    expect(report.strategyOutcomeCounts.FAILURE).toBe(0);
  });

  it("2E Test 5 — memory correction is observable", () => {
    const original: ShortTermMemoryItem = {
      scope: "short_term",
      observationId: "obs-1",
      userId: "user-a",
      contextKey: "poor_sleep",
      interventionType: "reduce_volume",
      outcome: "unknown",
      confidence: 0.4,
      provenance: {
        source: "dante_observations",
        recordedAt: new Date().toISOString(),
        producer: "user_stated",
      },
      immutable: true,
      observedAt: new Date().toISOString(),
    };
    const revised = reviseEpisodicEvidence(original, {
      note: "User corrected: prefers autoregulated volume",
      producer: "pilot-test",
    });
    expect(revised.revisionNote.key).toBe("revision:obs-1");
    expect(String(revised.revisionNote.value)).toMatch(/corrected/i);

    const report = computePilotReadiness([
      {
        recommendation: { status: "accepted", userId: "user-a", id: "r-mem" },
        accepted: true,
        adhered: true,
        outcomeClass: "NEUTRAL",
        predictionErrorMagnitude: null,
        memoryCorrected: true,
        usedFallback: false,
        safetyTriggered: false,
        usefulnessFeedback: null,
      },
    ]);
    expect(report.memoryCorrectionCount).toBe(1);
  });

  it("2E Test 6 + 7 — fallback and safety observability fields are countable", () => {
    const safety = checkSafety("my chest hurts when I run");
    expect(safety.triggered).toBe(true);

    const report = computePilotReadiness([
      {
        recommendation: { status: "proposed", userId: "user-a", id: "r-safe" },
        accepted: null,
        adhered: null,
        outcomeClass: "UNKNOWN",
        predictionErrorMagnitude: null,
        memoryCorrected: false,
        usedFallback: true,
        safetyTriggered: safety.triggered,
        usefulnessFeedback: null,
      },
    ]);
    expect(report.fallbackFrequency).toBe(1);
    expect(report.safetyTriggerCount).toBe(1);
    expect(report.safetyTriggerFrequency).toBe(1);
  });

  it("2E Test 9 — acceptance ≠ adherence ≠ outcome", () => {
    const report = computePilotReadiness([
      {
        recommendation: { status: "accepted", userId: "user-a", id: "r-a" },
        accepted: true,
        adhered: false,
        outcomeClass: "UNKNOWN",
        predictionErrorMagnitude: null,
        memoryCorrected: false,
        usedFallback: false,
        safetyTriggered: false,
        usefulnessFeedback: null,
      },
      {
        recommendation: { status: "accepted", userId: "user-a", id: "r-b" },
        accepted: true,
        adhered: true,
        outcomeClass: "FAILURE",
        predictionErrorMagnitude: 9,
        memoryCorrected: false,
        usedFallback: false,
        safetyTriggered: false,
        usefulnessFeedback: null,
      },
    ]);

    expect(report.acceptanceRate).toBe(1);
    expect(report.adherenceRate).toBe(0.5);
    expect(report.strategyOutcomeCounts.FAILURE).toBe(1);
    expect(report.strategyOutcomeCounts.SUCCESS).toBe(0);
  });

  it("2E technical capability gate — ready with bounded feedback UI gap", () => {
    const capability = assessTechnicalPilotCapability({
      canIsolateClients: true,
      canTraceRecommendation: true,
      canTraceOutcome: true,
      supportsUnknownOutcome: true,
      canObserveMemoryCorrection: true,
      canObserveFallback: true,
      canObserveSafety: true,
      acceptanceDistinctFromOutcome: true,
      acceptanceDistinctFromAdherence: true,
      avoidsRawChatDuplication: true,
      hasSomeFeedbackPath: false,
    });

    expect(capability.technicallyReady).toBe(true);
    expect(capability.boundedGaps.length).toBeGreaterThan(0);
    expect(capability.metricsComputable).toBe(true);
  });

  it("blocks sample-size pilot readiness when too few events exist", () => {
    const report = computePilotReadiness([
      {
        recommendation: { status: "proposed", userId: "user-a", id: "only" },
        accepted: null,
        adhered: null,
        outcomeClass: "UNKNOWN",
        predictionErrorMagnitude: null,
        memoryCorrected: false,
        usedFallback: true,
        safetyTriggered: false,
        usefulnessFeedback: null,
      },
    ]);

    expect(report.readyForPilot).toBe(false);
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  it("summarizes top strategies without requiring analytics infra", () => {
    const scores: StrategyScore[] = [
      {
        userId: "user-a",
        contextKey: "poor_sleep",
        interventionType: "reduce_volume",
        score: 0.7,
        confidence: 0.6,
        sampleCount: 6,
        successRate: 0.8,
        contextSimilarity: 1,
        recencyWeight: 0.9,
        actionable: true,
        reasons: [],
      },
      {
        userId: "user-a",
        contextKey: "poor_sleep",
        interventionType: "hold_load",
        score: 0.4,
        confidence: 0.3,
        sampleCount: 3,
        successRate: 0.5,
        contextSimilarity: 1,
        recencyWeight: 0.5,
        actionable: false,
        reasons: [],
      },
    ];

    expect(summarizeTopStrategies(scores, 1)[0]?.interventionType).toBe("reduce_volume");
  });
});
