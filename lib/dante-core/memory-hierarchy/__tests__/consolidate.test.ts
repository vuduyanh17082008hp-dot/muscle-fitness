import { describe, expect, it } from "vitest";

import {
  applyDecay,
  computePatternConfidence,
  isActionablePolicy,
  recordEvidence,
} from "@/lib/dante-core/memory-hierarchy/consolidate";
import type { DanteLearnedPattern } from "@/lib/dante-core/memory-hierarchy/types";

const USER_ID = "user-1";

function pattern(overrides: Partial<DanteLearnedPattern> = {}): DanteLearnedPattern {
  return {
    id: "pattern-1",
    userId: USER_ID,
    contextKey: "poor_sleep_high_stress",
    interventionType: "reduce_volume",
    tier: "pattern",
    status: "active",
    sampleCount: 0,
    positiveCount: 0,
    confidence: 0,
    summary: "",
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastReinforcedAt: "2026-01-01T00:00:00.000Z",
    requiresConfirmation: false,
    ...overrides,
  };
}

describe("computePatternConfidence", () => {
  it("a single positive event never reaches promotion confidence (no single-event overlearning)", () => {
    const confidence = computePatternConfidence(1, 1);
    expect(confidence).toBeLessThan(0.7);
    expect(confidence).toBeCloseTo(0.125, 2);
  });

  it("a well-evidenced, consistently positive pattern reaches high confidence", () => {
    const confidence = computePatternConfidence(8, 8);
    expect(confidence).toBe(1);
  });

  it("zero samples is zero confidence, not NaN or a fabricated default", () => {
    expect(computePatternConfidence(0, 0)).toBe(0);
  });
});

describe("recordEvidence", () => {
  it("creates a brand-new pattern at 'pattern' tier from the first observation", () => {
    const updated = recordEvidence(null, {
      userId: USER_ID,
      contextKey: "poor_sleep_high_stress",
      interventionType: "reduce_volume",
      positive: true,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(updated.tier).toBe("pattern");
    expect(updated.sampleCount).toBe(1);
    expect(updated.status).toBe("active");
  });

  it("promotes a pattern to 'policy' only once enough consistent evidence accumulates", () => {
    let existing: DanteLearnedPattern | null = null;

    // Confidence = (positive ratio) x (sampleCount / 8), so with an
    // unbroken positive streak it crosses the 0.7 promotion bar at
    // sampleCount 6 (0.75) — verify it stays at "pattern" tier for
    // every sample count strictly below that.
    for (let i = 0; i < 7; i += 1) {
      const updated = recordEvidence(existing, {
        userId: USER_ID,
        contextKey: "poor_sleep_high_stress",
        interventionType: "reduce_volume",
        positive: true,
      });
      existing = { ...updated, id: "pattern-1" };

      if (existing.sampleCount < 6) {
        expect(existing.tier).toBe("pattern");
      }
    }

    expect(existing!.tier).toBe("policy");
    expect(existing!.sampleCount).toBe(7);
    expect(isActionablePolicy(existing!)).toBe(true);
  });

  it("contradictory evidence reduces confidence and can demote a policy back to a pattern", () => {
    // Build up a confident policy first.
    let existing: DanteLearnedPattern | null = null;
    for (let i = 0; i < 8; i += 1) {
      existing = { ...recordEvidence(existing, {
        userId: USER_ID,
        contextKey: "poor_sleep_high_stress",
        interventionType: "reduce_volume",
        positive: true,
      }), id: "pattern-1" };
    }
    expect(existing!.tier).toBe("policy");
    const confidenceBeforeContradiction = existing!.confidence;

    // Now feed in contradictory (negative) evidence repeatedly — enough
    // to drive the ratio-based confidence below the demotion bar.
    for (let i = 0; i < 14; i += 1) {
      existing = { ...recordEvidence(existing, {
        userId: USER_ID,
        contextKey: "poor_sleep_high_stress",
        interventionType: "reduce_volume",
        positive: false,
      }), id: "pattern-1" };
    }

    expect(existing!.confidence).toBeLessThan(confidenceBeforeContradiction);
    expect(existing!.tier).toBe("pattern"); // demoted
  });

  it("a pattern with enough samples and a very poor ratio is marked forgotten", () => {
    let existing: DanteLearnedPattern | null = null;
    for (let i = 0; i < 10; i += 1) {
      existing = { ...recordEvidence(existing, {
        userId: USER_ID,
        contextKey: "high_soreness",
        interventionType: "reduce_load",
        positive: false,
      }), id: "pattern-2" };
    }

    expect(existing!.status).toBe("forgotten");
  });

  it("preserves firstObservedAt across updates but advances lastReinforcedAt", () => {
    const first = recordEvidence(null, {
      userId: USER_ID,
      contextKey: "low_recovery",
      interventionType: "reduce_load",
      positive: true,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const second = recordEvidence(
      { ...first, id: "pattern-3" },
      {
        userId: USER_ID,
        contextKey: "low_recovery",
        interventionType: "reduce_load",
        positive: true,
        now: new Date("2026-02-01T00:00:00.000Z"),
      },
    );

    expect(second.firstObservedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(second.lastReinforcedAt).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("applyDecay", () => {
  it("does not change a recently-reinforced pattern", () => {
    const recent = pattern({ confidence: 0.9, tier: "policy", lastReinforcedAt: new Date().toISOString() });
    const decayed = applyDecay(recent);
    expect(decayed.confidence).toBe(0.9);
  });

  it("reduces confidence for a pattern with no reinforcement in a long time, and can demote it", () => {
    const stale = pattern({
      confidence: 0.72,
      tier: "policy",
      sampleCount: 8,
      lastReinforcedAt: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const decayed = applyDecay(stale);
    expect(decayed.confidence).toBeLessThan(0.72);
    expect(decayed.tier).toBe("pattern");
  });
});

describe("isActionablePolicy", () => {
  it("rejects a pattern tier row even at high confidence — only 'policy' tier is actionable", () => {
    const notYetPromoted = pattern({ tier: "pattern", confidence: 0.9, sampleCount: 10, status: "active" });
    expect(isActionablePolicy(notYetPromoted)).toBe(false);
  });

  it("rejects a demoted or forgotten policy even if confidence briefly looks high", () => {
    const demoted = pattern({ tier: "policy", confidence: 0.9, sampleCount: 10, status: "demoted" });
    expect(isActionablePolicy(demoted)).toBe(false);
  });
});
