import { describe, expect, it } from "vitest";

import {
  createRecommendationRecord,
  evaluateRecommendationOutcome,
  mapObservedToOutcomeClass,
  outcomeClassIsPositive,
  outcomeClassToObserved,
} from "@/lib/dante-core/recommendation-outcome";

const baseRecommendation = {
  userId: "user-a",
  contextKey: "poor_sleep",
  interventionType: "reduce_volume" as const,
  expectedMetric: "recovery_score" as const,
  higherIsBetter: true,
  meaningfulChangeThreshold: 5,
  provenance: "dante_action_log",
};

describe("Phase 2B recommendation → outcome", () => {
  it("creates a recommendation with expected outcome and horizon", () => {
    const record = createRecommendationRecord({
      id: "rec-1",
      recommendation: baseRecommendation,
      horizon: "next_day",
    });

    expect(record.expected.direction).toBe("improve");
    expect(record.horizon).toBe("next_day");
    expect(record.status).toBe("proposed");
  });

  it("maps improve/maintain/worsen onto SUCCESS-class outcomes", () => {
    expect(mapObservedToOutcomeClass({ metric: "recovery_score", direction: "improve" }, "improved")).toBe(
      "SUCCESS",
    );
    expect(mapObservedToOutcomeClass({ metric: "recovery_score", direction: "improve" }, "maintained")).toBe(
      "PARTIAL_SUCCESS",
    );
    expect(mapObservedToOutcomeClass({ metric: "recovery_score", direction: "improve" }, "worsened")).toBe(
      "FAILURE",
    );
    expect(mapObservedToOutcomeClass({ metric: "recovery_score", direction: "improve" }, "unknown")).toBe(
      "UNKNOWN",
    );
    expect(mapObservedToOutcomeClass({ metric: "recovery_score", direction: "maintain" }, "maintained")).toBe(
      "SUCCESS",
    );
  });

  it("evaluates prediction error and learning eligibility", () => {
    const record = createRecommendationRecord({
      id: "rec-2",
      recommendation: baseRecommendation,
      now: new Date("2026-09-15T08:00:00.000Z"),
    });

    const evaluation = evaluateRecommendationOutcome({
      recommendation: record,
      before: 52,
      after: 64,
      observedAt: new Date("2026-09-16T08:00:00.000Z"),
    });

    expect(evaluation.outcomeClass).toBe("SUCCESS");
    expect(evaluation.predictionError.delta).toBe(12);
    expect(evaluation.learningAllowed).toBe(true);
    expect(evaluation.recommendation.status).toBe("evaluated");
    expect(outcomeClassIsPositive(evaluation.outcomeClass)).toBe(true);
    expect(outcomeClassToObserved("PARTIAL_SUCCESS")).toBe("maintained");
  });

  it("blocks learning from safety provenance", () => {
    const record = createRecommendationRecord({
      id: "rec-3",
      recommendation: {
        ...baseRecommendation,
        provenance: "safety-layer/chest_pain",
      },
    });

    const evaluation = evaluateRecommendationOutcome({
      recommendation: record,
      before: 50,
      after: 70,
    });

    expect(evaluation.learningAllowed).toBe(false);
    expect(evaluation.blockedReason).toMatch(/safety/i);
  });

  it("returns UNKNOWN when before/after are incomplete", () => {
    const record = createRecommendationRecord({
      id: "rec-4",
      recommendation: baseRecommendation,
    });

    const evaluation = evaluateRecommendationOutcome({
      recommendation: record,
      before: null,
      after: 60,
    });

    expect(evaluation.outcomeClass).toBe("UNKNOWN");
    expect(evaluation.learningAllowed).toBe(false);
  });
});
