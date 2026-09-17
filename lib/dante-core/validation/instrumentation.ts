import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AthleteState } from "@/lib/athlete-state/types";
import type { ShadowEventRecord } from "@/lib/dante-core/shadow/persistence";
import type { MultiDimensionalOutcome, ShadowDecision, UncertaintyProfile } from "@/lib/dante-core/shadow/types";
import { appendValidationEvent } from "@/lib/dante-core/validation/persistence";
import { evaluateTypedOutcome } from "@/lib/dante-core/validation/typed-outcomes";
import type { ContextSignature, TypedOutcome } from "@/lib/dante-core/validation/types";

function contextFromAthleteState(userId: string, state: AthleteState): ContextSignature {
  return {
    hard: {
      athleteId: userId,
      goal: state.profile.goal,
      acuteInjuryState: state.recovery.painFlag ? "PAIN_FLAGGED" : "NO_ACUTE_FLAG",
      interventionFamily: "daily_training_decision",
    },
    soft: {
      recoveryBand: state.recovery.trainingLoadState ?? undefined,
      experienceBand: state.profile.experience ?? undefined,
      sleepBand: state.recovery.sleepHours === null ? undefined : state.recovery.sleepHours < 6 ? "LOW" : state.recovery.sleepHours < 8 ? "MID" : "HIGH",
      stressBand: state.recovery.stress === null ? undefined : state.recovery.stress >= 7 ? "HIGH" : state.recovery.stress >= 4 ? "MID" : "LOW",
    },
    capturedAt: state.generatedAt,
  };
}

function categorical(value: string): TypedOutcome {
  return { kind: "categorical", value };
}

export async function recordPhase4RecommendationTrace(input: {
  supabase: SupabaseClient;
  userId: string;
  athleteState: AthleteState;
  recommendationId: string;
  sourcePhase3EventId?: string;
  productionDecision: Record<string, unknown>;
  shadowDecision: ShadowDecision;
  expectedOutcome: MultiDimensionalOutcome;
  uncertainty: UncertaintyProfile;
  occurredAt: string;
}): Promise<boolean> {
  return appendValidationEvent(input.supabase, {
    userId: input.userId,
    eventType: "RECOMMENDATION_TRACE",
    recommendationId: input.recommendationId,
    parentEventId: null,
    contextSignature: contextFromAthleteState(input.userId, input.athleteState),
    payload: {
      productionDecision: input.productionDecision,
      shadowDecision: input.shadowDecision,
      expectedOutcome: input.expectedOutcome,
      expectedOutcomeHorizon: "next_day",
      uncertaintyAtT0: input.uncertainty,
      shadowStrategyExecuted: false,
      phase4Authority: "NONE",
    },
    provenance: {
      sourceTable: "dante_phase3_shadow_events",
      sourceEventId: input.sourcePhase3EventId ?? null,
      sourceModule: "lib/dante-core/shadow/shadow-runtime.ts",
      capturedAt: input.occurredAt,
      rawEvidenceRetained: true,
      causalAuthority: "NONE",
    },
    occurredAt: input.occurredAt,
  }, `trace:${input.recommendationId}`);
}

export async function recordPhase4OutcomeEvaluation(input: {
  supabase: SupabaseClient;
  userId: string;
  source: ShadowEventRecord;
  actual: MultiDimensionalOutcome;
  rawRecoveryScore: number | null;
  occurredAt: string;
}): Promise<boolean> {
  // Persist the observation before parsing/evaluation. A later evaluator
  // failure must not erase or hide the evidence that actually arrived.
  const outcomeObserved = await appendValidationEvent(input.supabase, {
    userId: input.userId,
    eventType: "OUTCOME_OBSERVED",
    recommendationId: input.source.recommendationId,
    parentEventId: null,
    contextSignature: null,
    payload: {
      actualOutcome: input.actual,
      rawRecoveryScore: input.rawRecoveryScore,
      causalAttribution: "production_observation_only",
      shadowStrategyExecuted: false,
    },
    provenance: {
      sourceTable: "dante_phase3_shadow_events",
      sourceEventId: input.source.id,
      sourceModule: "lib/dante-core/shadow/shadow-runtime.ts",
      capturedAt: input.occurredAt,
      rawEvidenceRetained: true,
      causalAuthority: "NONE",
    },
    occurredAt: input.occurredAt,
  }, `outcome-observed:${input.source.recommendationId ?? "unlinked"}`);

  try {
    const dimensions = Object.entries(input.source.expectedOutcome ?? {}).map(([dimension, expected]) => ({
      dimension,
      expected: expected === "UNKNOWN" ? null : categorical(expected),
      actual: input.actual[dimension as keyof MultiDimensionalOutcome] === "UNKNOWN"
        ? null
        : categorical(input.actual[dimension as keyof MultiDimensionalOutcome]),
    }));
    const evaluation = evaluateTypedOutcome(dimensions);
    const predictionEvaluated = await appendValidationEvent(input.supabase, {
      userId: input.userId,
      eventType: "PREDICTION_EVALUATED",
      recommendationId: input.source.recommendationId,
      parentEventId: null,
      contextSignature: null,
      payload: {
        evaluation,
        causalAttribution: "production_observation_only",
        shadowStrategyExecuted: false,
      },
      provenance: {
        sourceTable: "dante_phase4_validation_events",
        sourceEventId: null,
        sourceModule: "lib/dante-core/validation/typed-outcomes.ts",
        capturedAt: input.occurredAt,
        rawEvidenceRetained: outcomeObserved,
        causalAuthority: "NONE",
      },
      occurredAt: input.occurredAt,
    }, `prediction-evaluated:${input.source.recommendationId ?? "unlinked"}`);
    return outcomeObserved && predictionEvaluated;
  } catch (error) {
    console.warn("[DANTE PHASE4] Outcome interpretation failed; raw observation was retained", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}
