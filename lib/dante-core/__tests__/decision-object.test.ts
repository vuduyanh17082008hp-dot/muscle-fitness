import { describe, expect, it } from "vitest";
import { buildAutoregulationTraceableDecision } from "@/lib/dante-core/decision-object";
import type { AutoregulationDecision, ReadinessResult } from "@/lib/dante-core/types";

const decision: AutoregulationDecision = {
  exercise: "Bench Press",
  plannedLoadKg: 80,
  recommendedLoadKg: 76,
  plannedSets: 4,
  recommendedSets: 4,
  loadAdjustmentPercent: -0.05,
  volumeAdjustmentPercent: null,
  decision: "reduce_load",
  sessionRecommendation: "modified",
  reasons: ["Systemic fatigue is high.", "Chest recovery is below 60%."],
  confidence: "moderate",
  gated: false,
};

const readiness: ReadinessResult = {
  readinessScore: 63,
  systemicFatigue: "high",
  muscleRecovery: [],
  limitingFactors: ["chest_recovery_low"],
  confidence: 0.8,
  method: "recovery_score_and_training_load",
};

describe("buildAutoregulationTraceableDecision", () => {
  it("preserves the existing traceability fields unchanged", () => {
    const result = buildAutoregulationTraceableDecision(decision, readiness, []);

    expect(result.recommendation).toContain("Reduce Bench Press load");
    expect(result.why).toEqual(decision.reasons);
    expect(result.dataUsed.readinessScore).toBe(63);
    expect(result.confidence).toBe("moderate");
    expect(result.sources).toEqual([]);
  });

  it("assigns a stable decisionId and createdAt from the injected clock", () => {
    const now = new Date("2026-01-15T09:30:00.000Z");
    const result = buildAutoregulationTraceableDecision(decision, readiness, [], now);

    expect(result.decisionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.createdAt).toBe("2026-01-15T09:30:00.000Z");
  });

  it("assigns a different decisionId on each call", () => {
    const first = buildAutoregulationTraceableDecision(decision, readiness, []);
    const second = buildAutoregulationTraceableDecision(decision, readiness, []);

    expect(first.decisionId).not.toBe(second.decisionId);
  });
});
