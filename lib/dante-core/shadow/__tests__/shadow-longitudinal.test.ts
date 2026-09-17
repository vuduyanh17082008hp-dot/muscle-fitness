import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { AthleteState } from "@/lib/athlete-state/types";
import {
  buildUncertaintyProfile,
  classifyFailure,
  detectAthleteDrift,
  executeShadowControlFlow,
  scoreContextualStrategies,
} from "@/lib/dante-core/shadow/adaptive-control";
import {
  governConsolidation,
  reevaluateFromRawEpisodes,
} from "@/lib/dante-core/shadow/consolidation-governor";
import {
  calibrationObservationFromOutcome,
  linkRecommendationOutcome,
  summarizeCalibration,
  unknownOutcome,
} from "@/lib/dante-core/shadow/outcome-calibration";
import { appendShadowEvent, loadRecentShadowEvents } from "@/lib/dante-core/shadow/persistence";
import {
  athleteStateToDriftSnapshot,
  extractStructuredSignals,
} from "@/lib/dante-core/shadow/signal-extraction";
import type {
  AthleteDriftSnapshot,
  ShadowDecision,
  StabilityAssessment,
} from "@/lib/dante-core/shadow/types";

function athleteState(overrides: {
  generatedAt?: string;
  goal?: string | null;
  sleepHours?: number | null;
  stress?: number | null;
  confidence?: number;
} = {}): AthleteState {
  const generatedAt = overrides.generatedAt ?? "2026-09-01T00:00:00.000Z";
  return {
    generatedAt,
    dataWindow: { startDate: "2026-08-01", endDate: "2026-09-01", weeksOfHistory: 4 },
    profile: {
      goal: overrides.goal === undefined ? "hypertrophy" : overrides.goal,
      experience: "intermediate",
      trainingFrequency: 4,
      priorityMuscles: [],
      heightCm: null,
      weightKg: null,
      sessionDurationMinutes: null,
      availableEquipment: [],
      physicalLimitations: null,
    },
    training: { hasAnyLoggedData: true, muscles: [], exerciseNames: {} },
    recovery: {
      available: true,
      score: 80,
      status: "Good",
      trainingLoadState: "green",
      sevenDayAverageScore: 78,
      sleepHours: overrides.sleepHours === undefined ? 8 : overrides.sleepHours,
      stress: overrides.stress === undefined ? 3 : overrides.stress,
      soreness: 3,
      fatigue: 3,
      painFlag: false,
      recoveryStatusCode: "good",
    },
    nutrition: {
      available: true,
      calorieTarget: 2600,
      proteinTargetGrams: 180,
      carbsTargetGrams: 280,
      fatTargetGrams: 80,
    },
    setVision: {
      available: false,
      latestExercise: null,
      analysesLast30Days: 0,
      romConsistencyDeviation: null,
      tempoConsistencyDeviation: null,
    },
    wearable: {
      available: false,
      isDemo: false,
      providerLabel: null,
      latestDay: null,
      connectionStatus: "not_connected",
      daysSinceLastData: null,
    },
    derived: {
      baselineDeviations: {
        sleep: { current: 8, baseline: 8, delta: 0, sampleCount: 10, confidence: 0.8 },
        recoveryScore: { current: 80, baseline: 78, delta: 2, sampleCount: 10, confidence: 0.8 },
        trainingLoad: { current: 20, baseline: 20, delta: 0, sampleCount: 8, confidence: 0.7 },
      },
      muscleRecoveryMap: [],
      overallConfidence: overrides.confidence ?? 0.8,
      missingData: [],
    },
    dataFreshness: {
      recovery: { status: "current", lastUpdated: generatedAt, humanReadable: "Current" },
      nutrition: { status: "current", lastUpdated: generatedAt, humanReadable: "Current" },
      training: { status: "current", lastUpdated: generatedAt, humanReadable: "Current" },
      setVision: { status: "missing", lastUpdated: null, humanReadable: "Missing" },
      bodyweight: { status: "missing", lastUpdated: null, humanReadable: "Missing" },
    },
    progress: { status: "not_yet_implemented" },
  };
}

function stable(userId: string): StabilityAssessment {
  return {
    userId,
    status: "STABLE",
    risk: 0,
    oscillation: false,
    repeatedReversals: false,
    runaway: false,
    selfCreatedEvidenceLoop: false,
    repeatedWithoutImprovement: false,
    reasonCodes: ["STABLE_ADAPTATION_HISTORY"],
  };
}

describe("Dante Phase 3 longitudinal shadow sequence", () => {
  it("runs the complete four-week drift and strategy-revision sequence without production authority", () => {
    const userId = "athlete-longitudinal";
    const baseline = athleteStateToDriftSnapshot(userId, athleteState({
      generatedAt: "2026-08-31T00:00:00.000Z",
    }));
    const production = { recommendation: "Production remains authoritative." };
    const originalProduction = structuredClone(production);

    const positiveExpected = unknownOutcome();
    positiveExpected.recovery = "IMPROVED";
    const positiveActual = unknownOutcome();
    positiveActual.recovery = "IMPROVED";
    for (const recommendationId of ["week-1-a", "week-2-a"]) {
      expect(linkRecommendationOutcome({
        userId,
        recommendationId,
        horizon: "next_day",
        expected: positiveExpected,
        actual: positiveActual,
        horizonMature: true,
      }).errors.recovery).toBe(0);
    }

    const oneBadNight = { ...baseline, capturedAt: "2026-09-14T00:00:00.000Z", sleepHours: 5 };
    expect(detectAthleteDrift({
      userId,
      baseline,
      current: oneBadNight,
      recent: [],
    }).status).toBe("CANDIDATE");

    const changed1 = {
      ...baseline,
      capturedAt: "2026-09-21T00:00:00.000Z",
      sleepHours: 5.5,
      scheduleDays: 2,
      goal: "strength",
      stress: 8,
    };
    const changed2 = { ...changed1, capturedAt: "2026-09-22T00:00:00.000Z", sleepHours: 5.2 };
    const changed3 = { ...changed1, capturedAt: "2026-09-23T00:00:00.000Z", sleepHours: 5 };
    const confirmed = detectAthleteDrift({
      userId,
      baseline,
      current: changed3,
      recent: [changed1, changed2],
    });
    expect(confirmed.status).toBe("CONFIRMED");

    const postDrift = executeShadowControlFlow({
      userId,
      contextSignature: "poor_sleep_high_stress",
      uncertainty: buildUncertaintyProfile({
        verifiedEvidenceCount: 2,
        missingStateFields: ["schedule_details"],
        stateConfidence: 0.45,
        confounderCount: 2,
        causalEvidenceCount: 2,
        strategySampleCount: 2,
        strategyConfidence: 0.45,
        outcomeMature: true,
        outcomeAvailable: true,
        toolAttempted: false,
        toolSucceeded: null,
      }),
      drift: confirmed,
      stability: stable(userId),
      strategies: [],
      missingHighValueFields: ["schedule_details"],
      retrievableEvidenceAvailable: true,
      pendingOutcomeWindow: false,
      safetyRisk: 0,
    });
    expect(["ASK", "RETRIEVE", "WAIT"]).toContain(postDrift.action);

    const scoreB = (sampleCount: number, positiveCount: number) => scoreContextualStrategies({
      userId,
      contextSignature: "poor_sleep_high_stress",
      drift: { ...confirmed, status: "NONE", magnitude: 0 },
      stability: stable(userId),
      now: new Date("2026-09-30T00:00:00.000Z"),
      candidates: [{
        id: "strategy-b",
        userId,
        contextSignature: "poor_sleep_high_stress",
        expectedUtility: positiveCount / sampleCount,
        informationGain: 0.2,
        risk: 0.1,
        cost: 0.1,
        pattern: {
          id: "pattern-b",
          userId,
          contextKey: "poor_sleep_high_stress",
          interventionType: "reduce_volume",
          tier: "pattern",
          status: "retained",
          sampleCount,
          positiveCount,
          confidence: Math.min(0.8, sampleCount * 0.2),
          summary: "Strategy B evidence",
          firstObservedAt: "2026-09-24T00:00:00.000Z",
          lastReinforcedAt: "2026-09-29T00:00:00.000Z",
          requiresConfirmation: false,
        },
      }],
    })[0]!.score;
    const firstB = scoreB(1, 1);
    const repeatedB = scoreB(3, 3);
    expect(repeatedB).toBeGreaterThan(firstB);

    expect(classifyFailure({ message: "tool unavailable" }).failureClass).toBe("TOOL_UNAVAILABLE");
    expect(scoreB(3, 3)).toBe(repeatedB);
    expect(governConsolidation({
      userId,
      candidateId: "strategy-b",
      provenanceEpisodeIds: ["b-1"],
      evidenceCount: 4,
      confidence: 0.7,
      contradictionCount: 1,
      cleanContradictionCount: 1,
      stale: false,
      supported: true,
      anomalousOutcomeCount: 1,
    }).action).toBe("QUARANTINE");
    expect(governConsolidation({
      userId,
      candidateId: "strategy-b",
      provenanceEpisodeIds: ["b-1", "b-2", "b-3"],
      evidenceCount: 6,
      confidence: 0.5,
      contradictionCount: 3,
      cleanContradictionCount: 3,
      stale: false,
      supported: true,
      anomalousOutcomeCount: 0,
    }).action).toBe("REVISE");
    expect(production).toEqual(originalProduction);
  });

  it("detects persistent Week 3 change, reduces stale strategy relevance, acquires information, and preserves production/raw evidence", () => {
    const userId = "athlete-a";
    const week1State = athleteState({ generatedAt: "2026-09-01T00:00:00.000Z" });
    const week1Signals = extractStructuredSignals({ userId, athleteState: week1State, message: "Should I train today?" });
    const baseline = athleteStateToDriftSnapshot(userId, week1State);

    const week1Expected = unknownOutcome();
    week1Expected.recovery = "IMPROVED";
    const week1Actual = unknownOutcome();
    week1Actual.recovery = "IMPROVED";
    const firstOutcome = linkRecommendationOutcome({
      userId,
      recommendationId: "week-1",
      horizon: "next_day",
      expected: week1Expected,
      actual: week1Actual,
      horizonMature: true,
    });
    const secondOutcome = linkRecommendationOutcome({
      userId,
      recommendationId: "week-2",
      horizon: "next_day",
      expected: week1Expected,
      actual: week1Actual,
      horizonMature: true,
    });
    expect(firstOutcome.status).toBe("EVALUATED");
    expect(secondOutcome.errors.recovery).toBe(0);

    const changed1 = athleteStateToDriftSnapshot(userId, athleteState({
      generatedAt: "2026-09-15T00:00:00.000Z", goal: "strength", sleepHours: 5.5, stress: 8,
    }));
    const changed2 = { ...changed1, capturedAt: "2026-09-16T00:00:00.000Z", sleepHours: 5.2 } satisfies AthleteDriftSnapshot;
    const changed3State = athleteState({
      generatedAt: "2026-09-17T00:00:00.000Z", goal: "strength", sleepHours: null, stress: 9, confidence: 0.4,
    });
    const changed3 = athleteStateToDriftSnapshot(userId, changed3State);
    const week3Signals = extractStructuredSignals({ userId, athleteState: changed3State, message: "My schedule and goal changed" });
    const drift = detectAthleteDrift({ userId, baseline, recent: [changed1, changed2], current: changed3 });

    expect(week1Signals.contextSignature).toBe("normal_conditions");
    expect(week3Signals.preferences[0]?.value).toBe("strength");
    expect(drift.status).toBe("CONFIRMED");

    const scores = scoreContextualStrategies({
      userId,
      contextSignature: week3Signals.contextSignature,
      drift,
      stability: stable(userId),
      candidates: [{
        id: "strategy-a",
        userId,
        contextSignature: week3Signals.contextSignature,
        expectedUtility: 0.9,
        informationGain: 0.1,
        risk: 0.15,
        cost: 0.1,
      }],
    });
    expect(scores[0]?.driftPenalty).toBeGreaterThan(0);

    const uncertainty = buildUncertaintyProfile({
      verifiedEvidenceCount: 2,
      missingStateFields: ["sleep_hours"],
      stateConfidence: 0.4,
      confounderCount: 2,
      causalEvidenceCount: 2,
      strategySampleCount: 2,
      strategyConfidence: 0.45,
      outcomeMature: true,
      outcomeAvailable: true,
      toolAttempted: false,
      toolSucceeded: null,
    });
    expect(uncertainty.state.value).toBeGreaterThan(0.5);
    expect(uncertainty.causal.value).toBe(1);

    const productionDecision = { recommendation: "Keep the validated production recommendation." };
    const unchangedProduction = structuredClone(productionDecision);
    const shadow = executeShadowControlFlow({
      userId,
      contextSignature: week3Signals.contextSignature,
      uncertainty,
      drift,
      stability: stable(userId),
      strategies: scores,
      missingHighValueFields: ["sleep_hours"],
      retrievableEvidenceAvailable: true,
      pendingOutcomeWindow: false,
      safetyRisk: 0,
    });
    expect(["ASK", "WAIT", "RETRIEVE"]).toContain(shadow.action);
    expect(productionDecision).toEqual(unchangedProduction);

    const laterActual = unknownOutcome();
    laterActual.recovery = "DECLINED";
    const later = linkRecommendationOutcome({
      userId,
      recommendationId: "week-3",
      horizon: "next_day",
      expected: week1Expected,
      actual: laterActual,
      horizonMature: true,
    });
    const observation = calibrationObservationFromOutcome({
      userId,
      domain: "recovery_prediction",
      contextSignature: week3Signals.contextSignature,
      priorConfidence: 0.7,
      outcome: later,
      dimension: "recovery",
    });
    expect(observation?.correct).toBe(false);
    expect(summarizeCalibration({
      userId,
      domain: "recovery_prediction",
      observations: observation ? [observation] : [],
    }).calibrationError).toBe(0.7);

    const rawEpisode = { userId, id: "episode-1", outcome: "positive" };
    const reevaluated = reevaluateFromRawEpisodes({
      userId,
      episodes: [rawEpisode],
      evaluate: (copies) => {
        copies[0]!.outcome = "reviewed";
        return {
          userId,
          candidateId: "candidate-a",
          provenanceEpisodeIds: ["episode-1"],
          evidenceCount: 1,
          confidence: 0.5,
          contradictionCount: 1,
          cleanContradictionCount: 1,
          stale: false,
          supported: true,
          anomalousOutcomeCount: 1,
        };
      },
    });
    expect(reevaluated.episodesIntact).toBe(true);
    expect(rawEpisode.outcome).toBe("positive");
  });

  it("enforces user-scoped shadow-history reads and filters defensive cross-user rows", async () => {
    const eqCalls: Array<[string, string]> = [];
    const rows = ["user-a", "user-b"].map((userId, index) => ({
      id: `event-${index}`,
      user_id: userId,
      event_type: "SHADOW_DECISION",
      recommendation_id: `r-${index}`,
      context_signature: "normal_conditions",
      production_decision: null,
      shadow_decision: null,
      expected_outcome: null,
      actual_outcome: null,
      uncertainty_profile: null,
      drift_state: null,
      stability_state: null,
      reason_codes: [],
      metadata: {},
      occurred_at: "2026-09-17T00:00:00.000Z",
    }));
    const chain = {
      eq(column: string, value: string) {
        eqCalls.push([column, value]);
        return chain;
      },
      order() {
        return chain;
      },
      async limit() {
        return { data: rows, error: null };
      },
    };
    const client = {
      from() {
        return { select: () => chain };
      },
    } as unknown as SupabaseClient;

    const result = await loadRecentShadowEvents(client, "user-a");
    expect(eqCalls).toContainEqual(["user_id", "user-a"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe("user-a");
  });

  it("rejects cross-user identities nested inside a user-scoped shadow row", async () => {
    const foreignDecision: ShadowDecision = {
      userId: "user-b",
      action: "USE",
      selectedStrategyId: "strategy-b",
      alternativeStrategyIds: [],
      questionTargets: [],
      retrievalContext: null,
      reasonCodes: [],
      promotionLevel: "SHADOW",
      confidence: 0.8,
      createdAt: "2026-09-17T00:00:00.000Z",
    };
    const chain = {
      eq() { return chain; },
      order() { return chain; },
      async limit() {
        return {
          data: [{
            id: "corrupt-row",
            user_id: "user-a",
            event_type: "SHADOW_DECISION",
            recommendation_id: "r-1",
            context_signature: "normal_conditions",
            production_decision: null,
            shadow_decision: foreignDecision,
            expected_outcome: null,
            actual_outcome: null,
            uncertainty_profile: null,
            drift_state: null,
            stability_state: null,
            reason_codes: [],
            metadata: {},
            occurred_at: "2026-09-17T00:00:00.000Z",
          }],
          error: null,
        };
      },
    };
    const client = { from: () => ({ select: () => chain }) } as unknown as SupabaseClient;
    expect(await loadRecentShadowEvents(client, "user-a")).toEqual([]);

    await expect(appendShadowEvent({} as SupabaseClient, {
      userId: "user-a",
      eventType: "SHADOW_DECISION",
      recommendationId: "r-1",
      contextSignature: "normal_conditions",
      productionDecision: null,
      shadowDecision: foreignDecision,
      expectedOutcome: null,
      actualOutcome: null,
      uncertaintyProfile: null,
      driftState: null,
      stabilityState: null,
      reasonCodes: [],
      metadata: {},
      occurredAt: "2026-09-17T00:00:00.000Z",
    })).rejects.toThrow(/Cross-client/);
  });
});
