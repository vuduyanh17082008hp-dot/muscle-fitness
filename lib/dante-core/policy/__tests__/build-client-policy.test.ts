import { describe, expect, it } from "vitest";

import { buildClientPolicy } from "@/lib/dante-core/policy/build-client-policy";
import { EMPTY_DANTE_MEMORY } from "@/lib/dante-core/memory";
import type { DanteLearnedPattern } from "@/lib/dante-core/memory-hierarchy/types";

const USER_ID = "user-1";

function policyPattern(overrides: Partial<DanteLearnedPattern> = {}): DanteLearnedPattern {
  return {
    id: "p1",
    userId: USER_ID,
    contextKey: "poor_sleep_high_stress",
    interventionType: "reduce_volume",
    tier: "policy",
    status: "active",
    sampleCount: 8,
    positiveCount: 7,
    confidence: 0.85,
    summary: "During poor sleep high stress, reduce volume is historically associated with a better outcome.",
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastReinforcedAt: "2026-02-01T00:00:00.000Z",
    requiresConfirmation: false,
    ...overrides,
  };
}

describe("buildClientPolicy", () => {
  it("returns an honest 'unknown' policy for a brand-new athlete with no patterns", () => {
    const policy = buildClientPolicy(USER_ID, [], EMPTY_DANTE_MEMORY, "assist");

    expect(policy.sleepSensitivity.value).toBeNull();
    expect(policy.sleepSensitivity.confidence).toBe("low");
    expect(policy.patterns).toHaveLength(0);
    expect(policy.autonomyLevel).toBe("assist");
  });

  it("derives sleep sensitivity only from an actionable (policy-tier) pattern", () => {
    const patterns = [policyPattern({ contextKey: "poor_sleep", confidence: 0.9 })];
    const policy = buildClientPolicy(USER_ID, patterns, EMPTY_DANTE_MEMORY, "assist");

    expect(policy.sleepSensitivity.value).toBe("high");
    expect(policy.sleepSensitivity.evidenceCount).toBe(8);
    expect(policy.sleepSensitivity.sourcePatternIds).toContain("p1");
  });

  it("ignores a pattern-tier (not yet promoted) row — never treats weak evidence as a stated sensitivity", () => {
    const patterns = [policyPattern({ contextKey: "poor_sleep", tier: "pattern", confidence: 0.3 })];
    const policy = buildClientPolicy(USER_ID, patterns, EMPTY_DANTE_MEMORY, "assist");

    expect(policy.sleepSensitivity.value).toBeNull();
  });

  it("passes through explicit dante_memory preferences unchanged", () => {
    const memory = {
      ...EMPTY_DANTE_MEMORY,
      preferredExercises: ["Trap Bar Deadlift"],
      dislikedExercises: ["Barbell Back Squat"],
      coachingPreference: "direct" as const,
    };

    const policy = buildClientPolicy(USER_ID, [], memory, "guide");

    expect(policy.preferredExercises).toEqual(["Trap Bar Deadlift"]);
    expect(policy.dislikedExercises).toEqual(["Barbell Back Squat"]);
    expect(policy.coachingPreference).toBe("direct");
    expect(policy.autonomyLevel).toBe("guide");
  });
});
