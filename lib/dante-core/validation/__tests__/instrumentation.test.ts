import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({ appendValidationEvent: vi.fn() }));

vi.mock("@/lib/dante-core/validation/persistence", () => ({
  appendValidationEvent: persistence.appendValidationEvent,
}));

import type { ShadowEventRecord } from "@/lib/dante-core/shadow/persistence";
import { recordPhase4OutcomeEvaluation } from "@/lib/dante-core/validation/instrumentation";
import { unknownOutcome } from "@/lib/dante-core/shadow/outcome-calibration";

function source(): ShadowEventRecord {
  const expected = unknownOutcome();
  expected.recovery = "MAINTAINED";
  return {
    id: "phase3-event",
    userId: "athlete-a",
    eventType: "SHADOW_DECISION",
    recommendationId: "recommendation-a",
    contextSignature: "normal",
    productionDecision: {},
    shadowDecision: null,
    expectedOutcome: expected,
    actualOutcome: null,
    uncertaintyProfile: null,
    driftState: null,
    stabilityState: null,
    reasonCodes: [],
    metadata: {},
    occurredAt: "2026-09-16T00:00:00.000Z",
  };
}

describe("Phase 4 T1 instrumentation ordering", () => {
  beforeEach(() => persistence.appendValidationEvent.mockReset().mockResolvedValue(true));

  it("appends raw observation before its derived prediction evaluation", async () => {
    const actual = unknownOutcome();
    actual.recovery = "IMPROVED";
    await expect(recordPhase4OutcomeEvaluation({
      supabase: {} as SupabaseClient,
      userId: "athlete-a",
      source: source(),
      actual,
      rawRecoveryScore: 82,
      occurredAt: "2026-09-17T00:00:00.000Z",
    })).resolves.toBe(true);
    expect(persistence.appendValidationEvent.mock.calls.map((call) => call[1].eventType)).toEqual([
      "OUTCOME_OBSERVED",
      "PREDICTION_EVALUATED",
    ]);
  });

  it("retains raw observation when interpretation fails", async () => {
    const poison = new Proxy(unknownOutcome(), {
      get() {
        throw new Error("parser failed");
      },
    });
    await expect(recordPhase4OutcomeEvaluation({
      supabase: {} as SupabaseClient,
      userId: "athlete-a",
      source: source(),
      actual: poison,
      rawRecoveryScore: 82,
      occurredAt: "2026-09-17T00:00:00.000Z",
    })).resolves.toBe(false);
    expect(persistence.appendValidationEvent).toHaveBeenCalledTimes(1);
    expect(persistence.appendValidationEvent.mock.calls[0]?.[1].eventType).toBe("OUTCOME_OBSERVED");
  });
});
