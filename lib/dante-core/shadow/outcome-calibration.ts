import { assertSameClient } from "@/lib/dante-core/memory-hierarchy/memory-foundation";
import type {
  CalibrationDomain,
  CalibrationObservation,
  CalibrationSummary,
  MultiDimensionalOutcome,
  OutcomeDimensionName,
  OutcomeLink,
  OutcomeValue,
} from "@/lib/dante-core/shadow/types";

const OUTCOME_DIMENSIONS: OutcomeDimensionName[] = [
  "recovery",
  "performance",
  "adherence",
  "pain_safety",
  "sleep",
  "subjective_response",
];

const OUTCOME_RANK: Record<Exclude<OutcomeValue, "UNKNOWN">, number> = {
  IMPROVED: 1,
  MAINTAINED: 0,
  DECLINED: -1,
};

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function unknownOutcome(): MultiDimensionalOutcome {
  return {
    recovery: "UNKNOWN",
    performance: "UNKNOWN",
    adherence: "UNKNOWN",
    pain_safety: "UNKNOWN",
    sleep: "UNKNOWN",
    subjective_response: "UNKNOWN",
  };
}

/**
 * Links a later observation to its original recommendation. No outcome
 * is inferred at T0: a missing or immature T1 remains UNKNOWN.
 */
export function linkRecommendationOutcome(input: {
  userId: string;
  recommendationId: string;
  horizon: string;
  expected: MultiDimensionalOutcome;
  actual?: MultiDimensionalOutcome | null;
  horizonMature: boolean;
  evaluatedAt?: string;
}): OutcomeLink {
  if (!input.horizonMature || !input.actual) {
    return {
      userId: input.userId,
      recommendationId: input.recommendationId,
      horizon: input.horizon,
      expected: input.expected,
      actual: null,
      status: input.horizonMature ? "UNKNOWN" : "PENDING",
      errors: Object.fromEntries(OUTCOME_DIMENSIONS.map((name) => [name, null])),
      evaluatedAt: null,
    };
  }

  const errors: OutcomeLink["errors"] = {};
  for (const name of OUTCOME_DIMENSIONS) {
    const expected = input.expected[name];
    const actual = input.actual[name];
    errors[name] = expected === "UNKNOWN" || actual === "UNKNOWN"
      ? null
      : Math.sign(OUTCOME_RANK[actual] - OUTCOME_RANK[expected]) as -1 | 0 | 1;
  }

  return {
    userId: input.userId,
    recommendationId: input.recommendationId,
    horizon: input.horizon,
    expected: input.expected,
    actual: input.actual,
    status: "EVALUATED",
    errors,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
  };
}

export function summarizeCalibration(input: {
  userId: string;
  domain: CalibrationDomain;
  observations: CalibrationObservation[];
}): CalibrationSummary {
  const own = input.observations.filter((observation) => {
    if (observation.userId !== input.userId) return false;
    return observation.domain === input.domain;
  });

  if (own.length === 0) {
    return {
      userId: input.userId,
      domain: input.domain,
      sampleCount: 0,
      meanConfidence: 0,
      observedAccuracy: 0,
      calibrationError: 0,
    };
  }

  own.forEach((observation) => assertSameClient(input.userId, observation.userId));
  const meanConfidence = own.reduce((sum, observation) => sum + observation.priorConfidence, 0) / own.length;
  const observedAccuracy = own.filter((observation) => observation.correct).length / own.length;

  return {
    userId: input.userId,
    domain: input.domain,
    sampleCount: own.length,
    meanConfidence: round(meanConfidence),
    observedAccuracy: round(observedAccuracy),
    calibrationError: round(Math.abs(meanConfidence - observedAccuracy)),
  };
}

export function calibrationObservationFromOutcome(input: {
  userId: string;
  domain: CalibrationDomain;
  contextSignature: string;
  priorConfidence: number;
  outcome: OutcomeLink;
  dimension: OutcomeDimensionName;
}): CalibrationObservation | null {
  assertSameClient(input.userId, input.outcome.userId);
  const error = input.outcome.errors[input.dimension];
  if (input.outcome.status !== "EVALUATED" || error === null || error === undefined) return null;
  return {
    userId: input.userId,
    domain: input.domain,
    contextSignature: input.contextSignature,
    priorConfidence: Math.max(0, Math.min(1, input.priorConfidence)),
    correct: error === 0,
    observedAt: input.outcome.evaluatedAt ?? new Date().toISOString(),
  };
}
