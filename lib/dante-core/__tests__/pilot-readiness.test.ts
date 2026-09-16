import { describe, expect, it } from "vitest";

import { computePilotReadiness, summarizeTopStrategies } from "@/lib/dante-core/pilot-readiness";
import type { StrategyScore } from "@/lib/dante-core/strategy-learner";

describe("Phase 2E pilot readiness", () => {
  it("measures acceptance, outcome availability, prediction error, fallbacks, and feedback", () => {
    const report = computePilotReadiness([
      {
        recommendation: { status: "accepted", userId: "user-a" },
        outcomeClass: "SUCCESS",
        predictionErrorMagnitude: 4,
        memoryCorrected: false,
        usedFallback: false,
        usefulnessFeedback: "helpful",
      },
      {
        recommendation: { status: "evaluated", userId: "user-a" },
        outcomeClass: "PARTIAL_SUCCESS",
        predictionErrorMagnitude: 2,
        memoryCorrected: true,
        usedFallback: true,
        usefulnessFeedback: null,
      },
      {
        recommendation: { status: "rejected", userId: "user-a" },
        outcomeClass: null,
        predictionErrorMagnitude: null,
        memoryCorrected: false,
        usedFallback: false,
        usefulnessFeedback: "unhelpful",
      },
      {
        recommendation: { status: "accepted", userId: "user-a" },
        outcomeClass: "FAILURE",
        predictionErrorMagnitude: 10,
        memoryCorrected: false,
        usedFallback: false,
        usefulnessFeedback: "neutral",
      },
      {
        recommendation: { status: "accepted", userId: "user-a" },
        outcomeClass: "SUCCESS",
        predictionErrorMagnitude: 1,
        memoryCorrected: false,
        usedFallback: false,
        usefulnessFeedback: "helpful",
      },
    ]);

    expect(report.recommendationCount).toBe(5);
    expect(report.acceptanceRate).toBe(0.8);
    expect(report.outcomeAvailabilityRate).toBe(0.8);
    expect(report.measurablePredictionCount).toBe(4);
    expect(report.meanPredictionError).toBe(4.25);
    expect(report.memoryCorrectionCount).toBe(1);
    expect(report.fallbackFrequency).toBe(0.2);
    expect(report.strategyOutcomeCounts.SUCCESS).toBe(2);
    expect(report.usefulnessFeedbackCounts.helpful).toBe(2);
    expect(report.usefulnessFeedbackCounts.missing).toBe(1);
    expect(report.readyForPilot).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  it("blocks pilot readiness when too few events exist", () => {
    const report = computePilotReadiness([
      {
        recommendation: { status: "proposed", userId: "user-a" },
        outcomeClass: "UNKNOWN",
        predictionErrorMagnitude: null,
        memoryCorrected: false,
        usedFallback: true,
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
