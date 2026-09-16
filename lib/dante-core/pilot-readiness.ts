/**
 * Phase 2E — Pilot readiness metrics (lightweight, no analytics stack).
 *
 * Pure aggregations over already-collected recommendation / outcome /
 * memory / fallback signals so a pilot can measure usefulness without
 * a new telemetry product.
 */

import type { OutcomeClass, RecommendationRecord } from "@/lib/dante-core/recommendation-outcome";
import type { StrategyScore } from "@/lib/dante-core/strategy-learner";

export type PilotRecommendationEvent = {
  recommendation: Pick<RecommendationRecord, "status" | "userId">;
  outcomeClass: OutcomeClass | null;
  /** Absolute prediction error magnitude when measurable. */
  predictionErrorMagnitude: number | null;
  memoryCorrected: boolean;
  usedFallback: boolean;
  usefulnessFeedback: "helpful" | "neutral" | "unhelpful" | null;
};

export type PilotReadinessReport = {
  recommendationCount: number;
  acceptanceRate: number | null;
  outcomeAvailabilityRate: number | null;
  measurablePredictionCount: number;
  meanPredictionError: number | null;
  memoryCorrectionCount: number;
  fallbackFrequency: number | null;
  strategyOutcomeCounts: Record<OutcomeClass, number>;
  usefulnessFeedbackCounts: {
    helpful: number;
    neutral: number;
    unhelpful: number;
    missing: number;
  };
  readyForPilot: boolean;
  blockers: string[];
};

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

export function computePilotReadiness(events: PilotRecommendationEvent[]): PilotReadinessReport {
  const recommendationCount = events.length;
  const accepted = events.filter((event) => event.recommendation.status === "accepted" || event.recommendation.status === "evaluated").length;
  const withOutcome = events.filter((event) => event.outcomeClass !== null && event.outcomeClass !== "UNKNOWN").length;
  const measurable = events.filter((event) => event.predictionErrorMagnitude !== null);
  const memoryCorrectionCount = events.filter((event) => event.memoryCorrected).length;
  const fallbackCount = events.filter((event) => event.usedFallback).length;

  const strategyOutcomeCounts: Record<OutcomeClass, number> = {
    SUCCESS: 0,
    PARTIAL_SUCCESS: 0,
    NEUTRAL: 0,
    FAILURE: 0,
    UNCERTAIN: 0,
    UNKNOWN: 0,
  };

  for (const event of events) {
    if (event.outcomeClass) {
      strategyOutcomeCounts[event.outcomeClass] += 1;
    }
  }

  const usefulnessFeedbackCounts = {
    helpful: 0,
    neutral: 0,
    unhelpful: 0,
    missing: 0,
  };

  for (const event of events) {
    if (event.usefulnessFeedback === null) usefulnessFeedbackCounts.missing += 1;
    else usefulnessFeedbackCounts[event.usefulnessFeedback] += 1;
  }

  const meanPredictionError =
    measurable.length === 0
      ? null
      : Math.round(
          (measurable.reduce((sum, event) => sum + (event.predictionErrorMagnitude ?? 0), 0) /
            measurable.length) *
            1000,
        ) / 1000;

  const blockers: string[] = [];
  if (recommendationCount < 5) {
    blockers.push("Need at least 5 recommendation events before declaring pilot readiness.");
  }
  if (withOutcome === 0 && recommendationCount > 0) {
    blockers.push("No measurable outcomes available yet.");
  }

  const acceptanceRate = rate(accepted, recommendationCount);
  const outcomeAvailabilityRate = rate(withOutcome, recommendationCount);
  const fallbackFrequency = rate(fallbackCount, recommendationCount);

  return {
    recommendationCount,
    acceptanceRate,
    outcomeAvailabilityRate,
    measurablePredictionCount: measurable.length,
    meanPredictionError,
    memoryCorrectionCount,
    fallbackFrequency,
    strategyOutcomeCounts,
    usefulnessFeedbackCounts,
    readyForPilot: blockers.length === 0,
    blockers,
  };
}

/** Optional helper: surface top strategy scores for pilot review. */
export function summarizeTopStrategies(scores: StrategyScore[], limit = 3): StrategyScore[] {
  return [...scores].sort((a, b) => b.score - a.score).slice(0, limit);
}
