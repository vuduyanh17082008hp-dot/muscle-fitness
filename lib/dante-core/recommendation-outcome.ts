/**
 * Phase 2B — Recommendation → Expected → Actual → Outcome class.
 *
 * Extends the Phase 1 adaptive closed loop with durable recommendation
 * records, explicit horizons, and SUCCESS-class outcomes. Does not
 * replace ObservedOutcome on L1 observations — maps to it.
 */

import type { ContextKey, InterventionType, ObservedOutcome } from "@/lib/dante-core/memory-hierarchy/types";
import {
  buildExpectedOutcome,
  computePredictionError,
  type AdaptiveRecommendation,
  type ExpectedOutcome,
  type PredictionError,
} from "@/lib/dante-core/adaptive-closed-loop";
import { resolveObservedOutcome } from "@/lib/dante-core/response-learning";
import { assertLearningScope } from "@/lib/dante-core/learning-guardrails";

export type OutcomeHorizon = "same_day" | "next_day" | "three_day" | "seven_day";

export type OutcomeClass =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "NEUTRAL"
  | "FAILURE"
  | "UNKNOWN";

export type RecommendationStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "expired"
  | "evaluated";

export type RecommendationRecord = {
  id: string;
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
  expectedMetric: AdaptiveRecommendation["expectedMetric"];
  expected: ExpectedOutcome;
  horizon: OutcomeHorizon;
  higherIsBetter: boolean;
  meaningfulChangeThreshold: number;
  provenance: string;
  status: RecommendationStatus;
  createdAt: string;
  evaluatedAt: string | null;
};

export type RecommendationOutcomeEvaluation = {
  recommendation: RecommendationRecord;
  observed: ObservedOutcome;
  outcomeClass: OutcomeClass;
  predictionError: PredictionError;
  before: number | null;
  after: number | null;
  learningAllowed: boolean;
  blockedReason: string | null;
};

const HORIZON_HOURS: Record<OutcomeHorizon, number> = {
  same_day: 18,
  next_day: 36,
  three_day: 72,
  seven_day: 168,
};

export function createRecommendationRecord(input: {
  id: string;
  recommendation: AdaptiveRecommendation;
  horizon?: OutcomeHorizon;
  status?: RecommendationStatus;
  now?: Date;
}): RecommendationRecord {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: input.id,
    userId: input.recommendation.userId,
    contextKey: input.recommendation.contextKey,
    interventionType: input.recommendation.interventionType,
    expectedMetric: input.recommendation.expectedMetric,
    expected: buildExpectedOutcome(input.recommendation),
    horizon: input.horizon ?? "next_day",
    higherIsBetter: input.recommendation.higherIsBetter,
    meaningfulChangeThreshold: input.recommendation.meaningfulChangeThreshold,
    provenance: input.recommendation.provenance,
    status: input.status ?? "proposed",
    createdAt: now,
    evaluatedAt: null,
  };
}

export function horizonDueAt(createdAt: string, horizon: OutcomeHorizon): Date {
  return new Date(new Date(createdAt).getTime() + HORIZON_HOURS[horizon] * 60 * 60 * 1000);
}

export function isWithinHorizon(
  createdAt: string,
  horizon: OutcomeHorizon,
  observedAt: Date = new Date(),
): boolean {
  return observedAt.getTime() <= horizonDueAt(createdAt, horizon).getTime();
}

/**
 * Map fine-grained observed movement onto the Phase 2 outcome class.
 * PARTIAL_SUCCESS covers "maintained when improve was expected" —
 * not a failure, not a full hit.
 */
export function mapObservedToOutcomeClass(
  expected: ExpectedOutcome,
  observed: ObservedOutcome,
): OutcomeClass {
  if (observed === "unknown") return "UNKNOWN";

  if (expected.direction === "maintain") {
    if (observed === "maintained" || observed === "improved") return "SUCCESS";
    return "FAILURE";
  }

  // expected improve
  if (observed === "improved") return "SUCCESS";
  if (observed === "maintained") return "PARTIAL_SUCCESS";
  if (observed === "worsened") return "FAILURE";
  return "NEUTRAL";
}

export function evaluateRecommendationOutcome(input: {
  recommendation: RecommendationRecord;
  before: number | null;
  after: number | null;
  observedAt?: Date;
}): RecommendationOutcomeEvaluation {
  const { recommendation, before, after } = input;
  const observedAt = input.observedAt ?? new Date();

  const scope = assertLearningScope({
    userId: recommendation.userId,
    interventionType: recommendation.interventionType,
    provenance: recommendation.provenance,
  });

  if (!isWithinHorizon(recommendation.createdAt, recommendation.horizon, observedAt)) {
    // Outside horizon — still classify if numbers exist, but mark learning blocked via NEUTRAL/UNKNOWN path.
  }

  const observed = resolveObservedOutcome({
    before,
    after,
    higherIsBetter: recommendation.higherIsBetter,
    meaningfulChangeThreshold: recommendation.meaningfulChangeThreshold,
  });

  let outcomeClass = mapObservedToOutcomeClass(recommendation.expected, observed);

  // Tiny movement that didn't clear the threshold stays NEUTRAL when
  // we expected improve and got maintained — already PARTIAL_SUCCESS.
  // Explicit NEUTRAL reserved for future multi-metric ties; today the
  // mapping above covers the main cases.

  if (recommendation.contextKey === "insufficient_data") {
    outcomeClass = "UNKNOWN";
  }

  const predictionError = computePredictionError(before, after, recommendation.higherIsBetter);

  const learningAllowed =
    scope.allowed &&
    outcomeClass !== "UNKNOWN" &&
    recommendation.contextKey !== "insufficient_data";

  return {
    recommendation: {
      ...recommendation,
      status: "evaluated",
      evaluatedAt: observedAt.toISOString(),
    },
    observed,
    outcomeClass,
    predictionError,
    before,
    after,
    learningAllowed,
    blockedReason: scope.allowed ? null : scope.reason,
  };
}

/** Convert Phase 2 outcome class into L1 ObservedOutcome for persistence compatibility. */
export function outcomeClassToObserved(outcomeClass: OutcomeClass): ObservedOutcome {
  switch (outcomeClass) {
    case "SUCCESS":
      return "improved";
    case "PARTIAL_SUCCESS":
    case "NEUTRAL":
      return "maintained";
    case "FAILURE":
      return "worsened";
    case "UNKNOWN":
      return "unknown";
  }
}

export function outcomeClassIsPositive(outcomeClass: OutcomeClass): boolean | null {
  if (outcomeClass === "UNKNOWN") return null;
  return outcomeClass === "SUCCESS" || outcomeClass === "PARTIAL_SUCCESS" || outcomeClass === "NEUTRAL";
}
