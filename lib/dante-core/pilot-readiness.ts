/**
 * Phase 2E — Pilot readiness metrics (lightweight, no analytics stack).
 *
 * Pure aggregations over already-collected recommendation / outcome /
 * memory / fallback signals so a pilot can measure usefulness without
 * a new telemetry product.
 *
 * Distinguishes technical pilot readiness (isolation, traceability,
 * UNKNOWN handling, observability) from sample-size readiness
 * (enough live events to declare a real-user pilot started).
 */

import type {
  OutcomeClass,
  OutcomeHorizon,
  RecommendationRecord,
  RecommendationStatus,
} from "@/lib/dante-core/recommendation-outcome";
import type { StrategyScore } from "@/lib/dante-core/strategy-learner";
import { assertSameClient } from "@/lib/dante-core/memory-hierarchy/memory-foundation";

/** Structured recommendation telemetry — not raw chat duplication. */
export type RecommendationTelemetrySnapshot = {
  userId: string;
  recommendationId: string;
  timestamp: string;
  contextKey: string;
  interventionType: string;
  expectedMetric: string;
  expectedDirection: string;
  confidence: number | null;
  horizon: OutcomeHorizon;
  status: RecommendationStatus;
};

export type PilotRecommendationEvent = {
  recommendation: Pick<RecommendationRecord, "status" | "userId" | "id"> &
    Partial<Pick<RecommendationRecord, "contextKey" | "interventionType" | "horizon" | "createdAt">>;
  /** Acceptance of the recommendation (proposed → accepted/rejected). */
  accepted: boolean | null;
  /**
   * Whether the athlete actually followed the recommendation.
   * Must NOT equal acceptance alone — generation/acceptance ≠ adherence.
   */
  adhered: boolean | null;
  outcomeClass: OutcomeClass | null;
  /** Absolute prediction error magnitude when measurable. */
  predictionErrorMagnitude: number | null;
  memoryCorrected: boolean;
  usedFallback: boolean;
  safetyTriggered: boolean;
  usefulnessFeedback: "helpful" | "neutral" | "unhelpful" | null;
};

export type PilotReadinessReport = {
  recommendationCount: number;
  acceptanceRate: number | null;
  /** Follow-through rate; null when adherence was never recorded. */
  adherenceRate: number | null;
  outcomeAvailabilityRate: number | null;
  unknownOutcomeCount: number;
  measurablePredictionCount: number;
  meanPredictionError: number | null;
  memoryCorrectionCount: number;
  fallbackFrequency: number | null;
  safetyTriggerCount: number;
  safetyTriggerFrequency: number | null;
  strategyOutcomeCounts: Record<OutcomeClass, number>;
  usefulnessFeedbackCounts: {
    helpful: number;
    neutral: number;
    unhelpful: number;
    missing: number;
  };
  /** Enough live events exist to start measuring a real pilot cohort. */
  readyForPilot: boolean;
  blockers: string[];
};

export type TechnicalPilotCapability = {
  clientIsolation: boolean;
  recommendationTraceability: boolean;
  outcomeTraceability: boolean;
  unknownOutcomeHandling: boolean;
  memoryCorrectionObservability: boolean;
  failureObservability: boolean;
  safetyObservability: boolean;
  acceptanceDistinctFromOutcome: boolean;
  acceptanceDistinctFromAdherence: boolean;
  privacyMinimization: boolean;
  metricsComputable: boolean;
  /** Bounded gaps that do not block technical readiness. */
  boundedGaps: string[];
  technicallyReady: boolean;
};

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

export function toRecommendationTelemetry(
  record: RecommendationRecord,
  confidence: number | null = null,
): RecommendationTelemetrySnapshot {
  return {
    userId: record.userId,
    recommendationId: record.id,
    timestamp: record.createdAt,
    contextKey: record.contextKey,
    interventionType: record.interventionType,
    expectedMetric: record.expectedMetric,
    expectedDirection: record.expected.direction,
    confidence,
    horizon: record.horizon,
    status: record.status,
  };
}

/**
 * Verify recommendation/outcome/memory artifacts never cross clients.
 * Throws on leakage — same contract as assertSameClient.
 */
export function assertPilotClientIsolation(input: {
  ownerUserId: string;
  recommendationUserIds: string[];
  outcomeUserIds?: string[];
  memoryUserIds?: string[];
  strategyUserIds?: string[];
  communicationProfileUserIds?: string[];
}): void {
  const buckets = [
    ...input.recommendationUserIds,
    ...(input.outcomeUserIds ?? []),
    ...(input.memoryUserIds ?? []),
    ...(input.strategyUserIds ?? []),
    ...(input.communicationProfileUserIds ?? []),
  ];
  for (const subject of buckets) {
    assertSameClient(input.ownerUserId, subject);
  }
}

export function computePilotReadiness(events: PilotRecommendationEvent[]): PilotReadinessReport {
  const recommendationCount = events.length;
  const accepted = events.filter((event) => {
    if (event.accepted !== null) return event.accepted;
    return event.recommendation.status === "accepted" || event.recommendation.status === "evaluated";
  }).length;
  const adherenceKnown = events.filter((event) => event.adhered !== null);
  const adhered = adherenceKnown.filter((event) => event.adhered === true).length;
  const withOutcome = events.filter(
    (event) => event.outcomeClass !== null && event.outcomeClass !== "UNKNOWN",
  ).length;
  const unknownOutcomeCount = events.filter((event) => event.outcomeClass === "UNKNOWN").length;
  const measurable = events.filter((event) => event.predictionErrorMagnitude !== null);
  const memoryCorrectionCount = events.filter((event) => event.memoryCorrected).length;
  const fallbackCount = events.filter((event) => event.usedFallback).length;
  const safetyTriggerCount = events.filter((event) => event.safetyTriggered).length;

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

  return {
    recommendationCount,
    acceptanceRate: rate(accepted, recommendationCount),
    adherenceRate: rate(adhered, adherenceKnown.length),
    outcomeAvailabilityRate: rate(withOutcome, recommendationCount),
    unknownOutcomeCount,
    measurablePredictionCount: measurable.length,
    meanPredictionError,
    memoryCorrectionCount,
    fallbackFrequency: rate(fallbackCount, recommendationCount),
    safetyTriggerCount,
    safetyTriggerFrequency: rate(safetyTriggerCount, recommendationCount),
    strategyOutcomeCounts,
    usefulnessFeedbackCounts,
    readyForPilot: blockers.length === 0,
    blockers,
  };
}

/**
 * Technical capability gate for a controlled pilot — independent of
 * whether a real longitudinal cohort has already produced 5+ outcomes.
 */
export function assessTechnicalPilotCapability(input: {
  canIsolateClients: boolean;
  canTraceRecommendation: boolean;
  canTraceOutcome: boolean;
  supportsUnknownOutcome: boolean;
  canObserveMemoryCorrection: boolean;
  canObserveFallback: boolean;
  canObserveSafety: boolean;
  acceptanceDistinctFromOutcome: boolean;
  acceptanceDistinctFromAdherence: boolean;
  avoidsRawChatDuplication: boolean;
  /** e.g. in-product thumbs / accept-reject / correction path exists */
  hasSomeFeedbackPath: boolean;
}): TechnicalPilotCapability {
  const boundedGaps: string[] = [];
  if (!input.hasSomeFeedbackPath) {
    boundedGaps.push(
      "No dedicated in-chat helpful/unhelpful UI — accept/reject actions and corrections remain available as feedback proxies.",
    );
  }

  const technicallyReady =
    input.canIsolateClients &&
    input.canTraceRecommendation &&
    input.canTraceOutcome &&
    input.supportsUnknownOutcome &&
    input.canObserveMemoryCorrection &&
    input.canObserveFallback &&
    input.canObserveSafety &&
    input.acceptanceDistinctFromOutcome &&
    input.acceptanceDistinctFromAdherence &&
    input.avoidsRawChatDuplication;

  return {
    clientIsolation: input.canIsolateClients,
    recommendationTraceability: input.canTraceRecommendation,
    outcomeTraceability: input.canTraceOutcome,
    unknownOutcomeHandling: input.supportsUnknownOutcome,
    memoryCorrectionObservability: input.canObserveMemoryCorrection,
    failureObservability: input.canObserveFallback,
    safetyObservability: input.canObserveSafety,
    acceptanceDistinctFromOutcome: input.acceptanceDistinctFromOutcome,
    acceptanceDistinctFromAdherence: input.acceptanceDistinctFromAdherence,
    privacyMinimization: input.avoidsRawChatDuplication,
    metricsComputable: technicallyReady,
    boundedGaps,
    technicallyReady,
  };
}

/** Optional helper: surface top strategy scores for pilot review. */
export function summarizeTopStrategies(scores: StrategyScore[], limit = 3): StrategyScore[] {
  return [...scores].sort((a, b) => b.score - a.score).slice(0, limit);
}
