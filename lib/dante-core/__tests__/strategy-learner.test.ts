import { describe, expect, it } from "vitest";

import {
  contextSimilarity,
  rankStrategies,
  scoreStrategy,
  summarizeStrategyHistory,
} from "@/lib/dante-core/strategy-learner";
import type { DanteLearnedPattern } from "@/lib/dante-core/memory-hierarchy/types";

function pattern(overrides: Partial<DanteLearnedPattern> = {}): DanteLearnedPattern {
  return {
    id: "p1",
    userId: "user-a",
    contextKey: "poor_sleep",
    interventionType: "reduce_volume",
    tier: "pattern",
    status: "active",
    sampleCount: 1,
    positiveCount: 1,
    confidence: 0.125,
    summary: "test",
    firstObservedAt: "2026-09-01T00:00:00.000Z",
    lastReinforcedAt: "2026-09-14T00:00:00.000Z",
    requiresConfirmation: false,
    ...overrides,
  };
}

describe("Phase 2C strategy learner", () => {
  it("scores context similarity without inventing matches", () => {
    expect(contextSimilarity("poor_sleep", "poor_sleep")).toBe(1);
    expect(contextSimilarity("poor_sleep_high_stress", "poor_sleep")).toBeGreaterThan(0);
    expect(contextSimilarity("poor_sleep", "high_training_load")).toBe(0);
  });

  it("refuses one-shot certainty even with a perfect first outcome", () => {
    const scored = scoreStrategy({
      userId: "user-a",
      currentContext: "poor_sleep",
      pattern: pattern({ sampleCount: 1, positiveCount: 1, confidence: 0.125 }),
    });

    expect(scored.sampleCount).toBe(1);
    expect(scored.actionable).toBe(false);
    expect(scored.score).toBeLessThan(0.5);
    expect(scored.reasons.some((reason) => /sample/i.test(reason))).toBe(true);
  });

  it("never ranks another client's patterns", () => {
    const ranked = rankStrategies({
      userId: "user-a",
      currentContext: "poor_sleep",
      patterns: [
        pattern({ id: "mine", userId: "user-a", sampleCount: 6, positiveCount: 5, confidence: 0.625 }),
        pattern({ id: "theirs", userId: "user-b", sampleCount: 20, positiveCount: 20, confidence: 0.95 }),
      ],
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.userId).toBe("user-a");
  });

  it("throws on cross-client score attempts", () => {
    expect(() =>
      scoreStrategy({
        userId: "user-a",
        currentContext: "poor_sleep",
        pattern: pattern({ userId: "user-b" }),
      }),
    ).toThrow(/Cross-client/);
  });

  it("summarizes SUCCESS/FAILURE history per intervention for one athlete", () => {
    const summary = summarizeStrategyHistory("user-a", [
      {
        userId: "user-a",
        contextKey: "poor_sleep",
        interventionType: "reduce_volume",
        outcomeClass: "SUCCESS",
        evaluatedAt: "2026-09-16T00:00:00.000Z",
      },
      {
        userId: "user-a",
        contextKey: "poor_sleep",
        interventionType: "reduce_volume",
        outcomeClass: "FAILURE",
        evaluatedAt: "2026-09-15T00:00:00.000Z",
      },
      {
        userId: "user-b",
        contextKey: "poor_sleep",
        interventionType: "reduce_volume",
        outcomeClass: "SUCCESS",
        evaluatedAt: "2026-09-16T00:00:00.000Z",
      },
    ]);

    expect(summary.reduce_volume.trials).toBe(2);
    expect(summary.reduce_volume.successes).toBe(1);
    expect(summary.reduce_volume.failures).toBe(1);
  });
});
