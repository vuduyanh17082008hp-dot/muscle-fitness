import { describe, expect, it, vi } from "vitest";

/**
 * Covers Test D: "Should I increase bench?" -> AdaptiveRecommendation
 * is authoritative. This tool is the ONLY way progression questions
 * are ever answered (Part 4) — it must return the Adaptive Program
 * Engine's own decision verbatim, including a non-INCREASE_LOAD
 * decision, and never substitute a different action.
 */

vi.mock("@/lib/athlete-state/build-athlete-state", () => ({
  buildAthleteState: vi.fn(async () => ({ fake: "athlete-state" })),
}));

vi.mock("@/lib/training/load-training-context", () => ({
  loadTrainingContext: vi.fn(async () => ({ fake: "training-context" })),
}));

vi.mock("@/lib/dante-core/adaptive-program-engine", () => ({
  buildAdaptiveProgram: vi.fn(() => [
    {
      decision: { exerciseName: "Barbell Bench Press", action: "HOLD", suggestedWeightKg: null },
      why: ["Recovery priority is active — progression is paused."],
      confidence: "high",
    },
    {
      decision: { exerciseName: "Leg Press", action: "INCREASE_LOAD", suggestedWeightKg: 120 },
      why: ["Hit the top of the rep range for 3 sessions."],
      confidence: "moderate",
    },
  ]),
}));

import { getAdaptiveRecommendationTool } from "@/lib/dante-core/tools/read/get-adaptive-recommendation";

const context = { supabase: {} as never, userId: "user-1", now: new Date() };

describe("get_adaptive_recommendation tool", () => {
  it("returns the engine's own HOLD decision for bench verbatim — never upgrades it to an increase", async () => {
    const result = await getAdaptiveRecommendationTool.execute(context, { exerciseName: "bench" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.recommendations).toHaveLength(1);
    expect(result.data.recommendations[0]).toEqual({
      exerciseName: "Barbell Bench Press",
      action: "HOLD",
      nextTargetWeightKg: null,
      reason: "Recovery priority is active — progression is paused.",
      confidence: "high",
    });
  });

  it("returns every exercise's decision unfiltered when no exerciseName is given", async () => {
    const result = await getAdaptiveRecommendationTool.execute(context, {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.recommendations.map((r) => r.action)).toEqual(["HOLD", "INCREASE_LOAD"]);
  });

  it("rejects an out-of-schema call before reaching the engine", () => {
    const parsed = getAdaptiveRecommendationTool.inputSchema.safeParse({ exerciseName: 123 });
    expect(parsed.success).toBe(false);
  });
});
