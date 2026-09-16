import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertLearningScope } from "@/lib/dante-core/learning-guardrails";
import { recordObservationAndLearn } from "@/lib/dante-core/memory-hierarchy/record-observation";
import type { ContextKey, InterventionType, ObservedOutcome } from "@/lib/dante-core/memory-hierarchy/types";
import {
  classifyContext,
  resolveObservedOutcome,
  type ContextSignals,
} from "@/lib/dante-core/response-learning";

/**
 * Adaptive closed loop (10% architecture slice):
 *
 *   recommendation → expected outcome → actual outcome → prediction error
 *   → strategy evaluation → athlete update (client-scoped) → memory update
 *   → next recommendation (orchestrator / daily decision on next cycle)
 *
 * Pure evaluation helpers are synchronous; persistence goes through
 * recordObservationAndLearn, which never touches immutable domains.
 */

export type AdaptiveRecommendation = {
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
  /** Metric the intervention was expected to influence. */
  expectedMetric: "recovery_score" | "adherence_score";
  /** Direction considered a successful outcome for this intervention. */
  higherIsBetter: boolean;
  meaningfulChangeThreshold: number;
  provenance: string;
};

export type ExpectedOutcome = {
  metric: AdaptiveRecommendation["expectedMetric"];
  direction: "improve" | "maintain";
};

export type ActualOutcome = {
  metric: AdaptiveRecommendation["expectedMetric"];
  before: number | null;
  after: number | null;
  observed: ObservedOutcome;
};

export type PredictionError = {
  delta: number | null;
  signedDelta: number | null;
  magnitude: number | null;
};

export type ClosedLoopEvaluation = {
  recommendation: AdaptiveRecommendation;
  expected: ExpectedOutcome;
  actual: ActualOutcome;
  predictionError: PredictionError;
  strategyAccepted: boolean;
  memoryUpdated: boolean;
  blockedReason: string | null;
};

export function buildExpectedOutcome(recommendation: AdaptiveRecommendation): ExpectedOutcome {
  const maintainTypes: InterventionType[] = ["hold_load", "no_change", "meal_timing_adjustment"];
  return {
    metric: recommendation.expectedMetric,
    direction: maintainTypes.includes(recommendation.interventionType) ? "maintain" : "improve",
  };
}

export function computePredictionError(
  before: number | null,
  after: number | null,
  higherIsBetter: boolean,
): PredictionError {
  if (before === null || after === null) {
    return { delta: null, signedDelta: null, magnitude: null };
  }

  const delta = after - before;
  const signedDelta = higherIsBetter ? delta : -delta;

  return {
    delta,
    signedDelta,
    magnitude: Math.abs(delta),
  };
}

export function evaluateAdaptiveClosedLoop(input: {
  recommendation: AdaptiveRecommendation;
  before: number | null;
  after: number | null;
}): ClosedLoopEvaluation {
  const { recommendation, before, after } = input;
  const expected = buildExpectedOutcome(recommendation);

  const observed = resolveObservedOutcome({
    before,
    after,
    higherIsBetter: recommendation.higherIsBetter,
    meaningfulChangeThreshold: recommendation.meaningfulChangeThreshold,
  });

  const predictionError = computePredictionError(before, after, recommendation.higherIsBetter);
  const scope = assertLearningScope({
    userId: recommendation.userId,
    interventionType: recommendation.interventionType,
    provenance: recommendation.provenance,
  });

  const strategyAccepted =
    scope.allowed &&
    observed !== "unknown" &&
    recommendation.contextKey !== "insufficient_data" &&
    (expected.direction === "maintain" ? observed !== "worsened" : observed === "improved" || observed === "maintained");

  return {
    recommendation,
    expected,
    actual: {
      metric: recommendation.expectedMetric,
      before,
      after,
      observed,
    },
    predictionError,
    strategyAccepted,
    memoryUpdated: false,
    blockedReason: scope.allowed ? null : scope.reason,
  };
}

function mapActionTypeToIntervention(actionType: string): InterventionType | null {
  switch (actionType) {
    case "modify_volume":
    case "adjust_sets_reps":
      return "reduce_volume";
    case "postpone_exercise":
      return "postpone_exercise";
    case "recovery_action":
      return "no_change";
    case "macro_adjustment":
      return "macro_adjustment";
    case "meal_suggestion":
      return "meal_timing_adjustment";
    default:
      return null;
  }
}

async function loadRecentIntervention(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ interventionType: InterventionType; provenance: string; appliedAt: string } | null> {
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("dante_action_log")
    .select("action_type, status, created_at, provenance")
    .eq("user_id", userId)
    .eq("status", "applied")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const interventionType = mapActionTypeToIntervention(data.action_type as string);
  if (!interventionType) return null;

  return {
    interventionType,
    provenance: (data.provenance as string | null) ?? "dante_action_log",
    appliedAt: data.created_at as string,
  };
}

/**
 * Called after a new recovery score lands (e.g. RECOVERY_UPDATED event).
 * Compares the prior score against today's score and, when a recent
 * Dante intervention exists, records one L1 observation + optional L2/L3
 * pattern update for THAT user only.
 */
export async function processRecoveryOutcomeForLearning(
  supabase: SupabaseClient,
  input: {
    userId: string;
    previousRecoveryScore: number | null;
    currentRecoveryScore: number | null;
    contextSignals: ContextSignals;
    now?: Date;
  },
): Promise<ClosedLoopEvaluation | null> {
  const recent = await loadRecentIntervention(supabase, input.userId);
  if (!recent) return null;

  const contextKey = classifyContext(input.contextSignals);
  const recommendation: AdaptiveRecommendation = {
    userId: input.userId,
    contextKey,
    interventionType: recent.interventionType,
    expectedMetric: "recovery_score",
    higherIsBetter: true,
    meaningfulChangeThreshold: 5,
    provenance: recent.provenance,
  };

  const evaluation = evaluateAdaptiveClosedLoop({
    recommendation,
    before: input.previousRecoveryScore,
    after: input.currentRecoveryScore,
  });

  const scope = assertLearningScope({
    userId: input.userId,
    interventionType: recent.interventionType,
    provenance: recent.provenance,
  });

  if (!scope.allowed || evaluation.actual.observed === "unknown") {
    return evaluation;
  }

  const record = await recordObservationAndLearn(supabase, {
    userId: input.userId,
    contextKey,
    interventionType: recent.interventionType,
    beforeState: { recoveryScore: input.previousRecoveryScore },
    afterState: { recoveryScore: input.currentRecoveryScore },
    outcome: evaluation.actual.observed,
    goalAligned: evaluation.strategyAccepted,
    provenance: recent.provenance,
    now: input.now,
  });

  return {
    ...evaluation,
    memoryUpdated: record.patternUpdated,
  };
}
