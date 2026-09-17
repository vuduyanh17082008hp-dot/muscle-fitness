import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  appendShadowEvent: vi.fn(),
  loadRecentShadowEvents: vi.fn(),
}));

vi.mock("@/lib/dante-core/shadow/persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dante-core/shadow/persistence")>();
  return {
    ...actual,
    appendShadowEvent: persistence.appendShadowEvent,
    loadRecentShadowEvents: persistence.loadRecentShadowEvents,
  };
});

import type { ShadowEventRecord } from "@/lib/dante-core/shadow/persistence";
import {
  buildShadowRecommendationId,
  historyToAdaptations,
  processPhase3RecoveryOutcome,
  productionActionToAdaptation,
  selectRecoveryOutcomeSource,
} from "@/lib/dante-core/shadow/shadow-runtime";
import { assessAdaptationStability } from "@/lib/dante-core/shadow/adaptive-control";
import { unknownOutcome } from "@/lib/dante-core/shadow/outcome-calibration";

function decisionEvent(input: {
  id: string;
  recommendationId: string;
  occurredAt: string;
  userId?: string;
  recoveryScore?: number;
}): ShadowEventRecord {
  const userId = input.userId ?? "user-a";
  const expected = unknownOutcome();
  expected.recovery = "MAINTAINED";
  return {
    id: input.id,
    userId,
    eventType: "SHADOW_DECISION",
    recommendationId: input.recommendationId,
    contextSignature: "normal_conditions",
    productionDecision: { recommendation: `production-${input.recommendationId}` },
    shadowDecision: {
      userId,
      action: "USE",
      selectedStrategyId: "shadow-strategy-x",
      alternativeStrategyIds: [],
      questionTargets: [],
      retrievalContext: null,
      reasonCodes: ["STABLE_CONTEXT_STRONG_STRATEGY"],
      promotionLevel: "SHADOW",
      confidence: 0.2,
      createdAt: input.occurredAt,
    },
    expectedOutcome: expected,
    actualOutcome: null,
    uncertaintyProfile: null,
    driftState: null,
    stabilityState: null,
    reasonCodes: [],
    metadata: {
      productionConfidence: 0.85,
      snapshot: {
        userId,
        capturedAt: input.occurredAt,
        goal: "hypertrophy",
        sleepHours: 8,
        scheduleDays: 4,
        stress: 3,
        trainingLoad: 20,
        recoveryScore: input.recoveryScore ?? 70,
        calorieAdherence: null,
        adherence: null,
        communicationPreference: null,
      },
    },
    occurredAt: input.occurredAt,
  };
}

describe("Phase 3 async outcome linkage", () => {
  const now = new Date("2026-09-02T00:00:00.000Z");
  const recommendationA = decisionEvent({
    id: "event-a",
    recommendationId: "recommendation-a",
    occurredAt: "2026-09-01T06:00:00.000Z",
  });
  const recommendationB = decisionEvent({
    id: "event-b",
    recommendationId: "recommendation-b",
    occurredAt: "2026-09-01T08:00:00.000Z",
  });

  beforeEach(() => {
    persistence.appendShadowEvent.mockReset();
    persistence.loadRecentShadowEvents.mockReset();
    persistence.appendShadowEvent.mockResolvedValue(true);
  });

  it("uses a stable daily production fingerprint instead of a random linkage id", () => {
    const productionDecision = {
      recommendation: "Proceed.",
      decision: {
        decisionCode: "proceed_as_planned" as const,
        sessionId: "session-1",
        affectedExercises: [],
        warnings: [],
      },
      why: ["Stable inputs."],
      dataUsed: { readinessScore: 80 },
      confidence: "high" as const,
      sources: [],
    };
    const first = buildShadowRecommendationId({
      productionDecision,
      observedAt: new Date("2026-09-17T01:00:00.000Z"),
    });
    const repeatedRead = buildShadowRecommendationId({
      productionDecision: structuredClone(productionDecision),
      observedAt: new Date("2026-09-17T20:00:00.000Z"),
    });
    const changed = buildShadowRecommendationId({
      productionDecision: {
        ...productionDecision,
        dataUsed: { readinessScore: 50 },
      },
      observedAt: new Date("2026-09-17T20:00:00.000Z"),
    });
    expect(repeatedRead).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("extracts proposal direction and magnitude without applying the action", () => {
    expect(productionActionToAdaptation({
      id: "postpone_exercise:exercise-1",
      payload: {
        type: "postpone_exercise",
        sessionId: "session-1",
        sessionExerciseId: "exercise-1",
        exerciseName: "Squat",
      },
      reason: "Low recovery",
      requiresConfirmation: true,
    })).toMatchObject({
      action: "postpone_exercise:exercise-1",
      direction: "DECREASE",
      value: 0,
      evidenceSource: "dante_recommendation",
    });
    expect(productionActionToAdaptation({
      id: "macro_adjustment:calories:increase:10",
      payload: {
        type: "macro_adjustment",
        macro: "calories",
        direction: "increase",
        suggestedChangePercent: 10,
      },
      reason: "Goal support",
      requiresConfirmation: true,
    })).toMatchObject({
      action: "macro_adjustment:calories",
      direction: "INCREASE",
      value: 10,
      evidenceSource: "dante_recommendation",
    });
  });

  it("refuses to guess when overlapping recommendation windows are ambiguous", () => {
    expect(selectRecoveryOutcomeSource({
      history: [recommendationB, recommendationA],
      userId: "user-a",
      now,
    })).toBeNull();
  });

  it("treats duplicate reads of the same recommendation id as one linkage candidate", () => {
    const duplicate = structuredClone(recommendationB);
    duplicate.id = "event-b-duplicate";
    duplicate.occurredAt = "2026-09-01T09:00:00.000Z";
    expect(selectRecoveryOutcomeSource({
      history: [duplicate, recommendationB],
      userId: "user-a",
      now,
    })?.recommendationId).toBe("recommendation-b");
  });

  it("links an explicitly identified B outcome to B and never updates A", async () => {
    persistence.loadRecentShadowEvents.mockResolvedValue([recommendationB, recommendationA]);

    await processPhase3RecoveryOutcome({
      supabase: {} as SupabaseClient,
      userId: "user-a",
      recommendationId: "recommendation-b",
      currentRecoveryScore: 80,
      now,
    });

    expect(persistence.appendShadowEvent).toHaveBeenCalledTimes(2);
    const appended = persistence.appendShadowEvent.mock.calls.map((call) => call[1]);
    expect(appended.every((event) => event.recommendationId === "recommendation-b")).toBe(true);
    expect(appended.some((event) => event.recommendationId === "recommendation-a")).toBe(false);
    expect(appended.some((event) => event.eventType === "CONSOLIDATION_DECISION")).toBe(false);
    expect(appended[0]?.metadata).toMatchObject({
      causalAttribution: "production_observation_only",
      shadowStrategyExecuted: false,
    });
    expect(appended[1]?.metadata).toMatchObject({
      calibrationObservation: { priorConfidence: 0.85 },
    });
  });

  it("does not calibrate or consolidate when the outcome write fails", async () => {
    persistence.loadRecentShadowEvents.mockResolvedValue([recommendationB]);
    persistence.appendShadowEvent.mockResolvedValueOnce(false);

    await processPhase3RecoveryOutcome({
      supabase: {} as SupabaseClient,
      userId: "user-a",
      currentRecoveryScore: 80,
      now,
    });

    expect(persistence.appendShadowEvent).toHaveBeenCalledTimes(1);
    expect(persistence.appendShadowEvent.mock.calls[0]?.[1].eventType).toBe("OUTCOME_LINKED");
  });

  it("rejects immature, expired, already-linked, and cross-user sources", () => {
    const immature = decisionEvent({
      id: "immature",
      recommendationId: "immature",
      occurredAt: "2026-09-01T18:00:00.000Z",
    });
    const expired = decisionEvent({
      id: "expired",
      recommendationId: "expired",
      occurredAt: "2026-08-30T00:00:00.000Z",
    });
    const foreign = decisionEvent({
      id: "foreign",
      recommendationId: "foreign",
      occurredAt: "2026-09-01T08:00:00.000Z",
      userId: "user-b",
    });
    const linked: ShadowEventRecord = {
      ...recommendationB,
      id: "linked-b",
      eventType: "OUTCOME_LINKED",
      shadowDecision: null,
      actualOutcome: unknownOutcome(),
    };
    expect(selectRecoveryOutcomeSource({
      history: [immature, expired, foreign, recommendationB, linked],
      userId: "user-a",
      now,
    })).toBeNull();
  });

  it("feeds real proposal magnitudes to stability without treating proposals as outcomes", () => {
    const history = [100, 90, 80, 70].map((value, index) => {
      const event = decisionEvent({
        id: `volume-${index}`,
        recommendationId: `volume-r-${index}`,
        occurredAt: `2026-09-0${index + 1}T08:00:00.000Z`,
      });
      event.metadata.productionAdaptations = [{
        action: "modify_volume:exercise-1",
        direction: "DECREASE",
        value,
        evidenceSource: "dante_recommendation",
      }];
      return event;
    });
    const duplicateRead = structuredClone(history[3]!);
    duplicateRead.id = "duplicate-read";
    duplicateRead.occurredAt = "2026-09-04T12:00:00.000Z";

    const adaptations = historyToAdaptations("user-a", [...history, duplicateRead]);
    expect(adaptations).toHaveLength(4);
    expect(adaptations.every((record) => record.outcomeImproved === null)).toBe(true);
    expect(adaptations.every((record) => record.evidenceSource === "dante_recommendation")).toBe(true);
    const assessed = assessAdaptationStability("user-a", adaptations);
    expect(assessed.runaway).toBe(true);
    expect(assessed.selfCreatedEvidenceLoop).toBe(true);
  });
});
