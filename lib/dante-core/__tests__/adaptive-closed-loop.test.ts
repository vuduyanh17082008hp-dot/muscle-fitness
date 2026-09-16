import { describe, expect, it } from "vitest";

import {
  buildExpectedOutcome,
  computePredictionError,
  evaluateAdaptiveClosedLoop,
  processRecoveryOutcomeForLearning,
} from "@/lib/dante-core/adaptive-closed-loop";

describe("evaluateAdaptiveClosedLoop", () => {
  const recommendation = {
    userId: "user-a",
    contextKey: "poor_sleep",
    interventionType: "reduce_volume" as const,
    expectedMetric: "recovery_score" as const,
    higherIsBetter: true,
    meaningfulChangeThreshold: 5,
    provenance: "dante_action_log",
  };

  it("computes prediction error and improved outcome", () => {
    const evaluation = evaluateAdaptiveClosedLoop({
      recommendation,
      before: 52,
      after: 63,
    });

    expect(evaluation.expected.direction).toBe("improve");
    expect(evaluation.actual.observed).toBe("improved");
    expect(evaluation.predictionError.delta).toBe(11);
    expect(evaluation.strategyAccepted).toBe(true);
    expect(evaluation.blockedReason).toBeNull();
  });

  it("returns unknown outcome when before/after missing", () => {
    const evaluation = evaluateAdaptiveClosedLoop({
      recommendation,
      before: null,
      after: 60,
    });

    expect(evaluation.actual.observed).toBe("unknown");
    expect(evaluation.strategyAccepted).toBe(false);
  });

  it("blocks learning scoped to safety provenance", () => {
    const evaluation = evaluateAdaptiveClosedLoop({
      recommendation: {
        ...recommendation,
        provenance: "safety-layer/chest_pain",
      },
      before: 50,
      after: 70,
    });

    expect(evaluation.blockedReason).toMatch(/safety/i);
    expect(evaluation.memoryUpdated).toBe(false);
  });
});

describe("computePredictionError", () => {
  it("inverts delta when lower is better", () => {
    const error = computePredictionError(8, 6, false);
    expect(error.signedDelta).toBe(2);
  });
});

describe("buildExpectedOutcome", () => {
  it("expects maintain for hold_load", () => {
    expect(
      buildExpectedOutcome({
        userId: "u",
        contextKey: "normal_conditions",
        interventionType: "hold_load",
        expectedMetric: "recovery_score",
        higherIsBetter: true,
        meaningfulChangeThreshold: 5,
        provenance: "test",
      }).direction,
    ).toBe("maintain");
  });
});

describe("processRecoveryOutcomeForLearning", () => {
  it("returns null when no recent intervention exists", async () => {
    const supabase = {
      from(table: string) {
        if (table !== "dante_action_log") throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };

    const result = await processRecoveryOutcomeForLearning(supabase as never, {
      userId: "user-a",
      previousRecoveryScore: 50,
      currentRecoveryScore: 65,
      contextSignals: {
        sleepHours: 5,
        stress: 8,
        soreness: 6,
        recoveryScore: 65,
        trainingLoadState: "amber",
      },
    });

    expect(result).toBeNull();
  });
});
