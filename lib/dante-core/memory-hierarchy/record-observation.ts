import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordEvidence } from "@/lib/dante-core/memory-hierarchy/consolidate";
import {
  findLearnedPattern,
  upsertLearnedPattern,
} from "@/lib/dante-core/memory-hierarchy/load-patterns";
import { isMissingRelationError } from "@/lib/dante-core/memory-hierarchy/schema-availability";
import type {
  ContextKey,
  DanteObservation,
  InterventionType,
  ObservedOutcome,
} from "@/lib/dante-core/memory-hierarchy/types";
import { assertLearningScope } from "@/lib/dante-core/learning-guardrails";
import { outcomeIsPositive } from "@/lib/dante-core/response-learning";
import {
  evaluateCausalOutcome,
  shouldCountAsPositiveLearningEvidence,
  type ConfounderSignals,
  type OutcomeDimensions,
} from "@/lib/dante-core/epistemic-integrity";

let loggedMissingObservationsTable = false;

/**
 * The write path for the REFLECTION LOOP (mission Part 10.C):
 * action -> outcome -> evaluate -> learn. Called once a real
 * after-state is available (e.g. the day after a volume adjustment,
 * when that day's recovery check-in has landed) — never at the moment
 * an action is proposed, since there is no outcome yet to learn from.
 *
 * Always records the L1 observation first (a permanent record of what
 * was actually seen), then folds it into the L2/L3 pattern via
 * consolidate.ts. A context key of "insufficient_data" or an outcome
 * of "unknown" still records the L1 observation for auditability, but
 * is never folded into a pattern — half-known evidence must not move
 * confidence in either direction.
 *
 * Confounded / mixed multi-metric outcomes also record L1 intact but
 * do not inflate positive pattern confidence.
 */

export type RecordObservationInput = {
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
  beforeState: Record<string, string | number | null>;
  afterState: Record<string, string | number | null>;
  outcome: ObservedOutcome;
  goalAligned: boolean | null;
  provenance: string;
  now?: Date;
  /** Optional multi-metric / confounder context for causal humility. */
  causalContext?: {
    dimensions: OutcomeDimensions;
    confounders: ConfounderSignals;
    interventionIsVolumeReduction?: boolean;
  };
};

export async function recordObservationAndLearn(
  supabase: SupabaseClient,
  input: RecordObservationInput,
): Promise<{ observation: DanteObservation | null; patternUpdated: boolean }> {
  const scope = assertLearningScope({
    userId: input.userId,
    interventionType: input.interventionType,
    provenance: input.provenance,
  });

  if (!scope.allowed) {
    console.warn("[DANTE MEMORY HIERARCHY] Learning blocked:", scope.reason);
    return { observation: null, patternUpdated: false };
  }

  const observedAt = (input.now ?? new Date()).toISOString();

  const { data: observationRow, error: observationError } = await supabase
    .from("dante_observations")
    .insert({
      user_id: input.userId,
      context_key: input.contextKey,
      intervention_type: input.interventionType,
      before_state: input.beforeState,
      after_state: input.afterState,
      outcome: input.outcome,
      goal_aligned: input.goalAligned,
      provenance: input.provenance,
      observed_at: observedAt,
    })
    .select("id, user_id, context_key, intervention_type, before_state, after_state, outcome, goal_aligned, provenance, observed_at")
    .single();

  if (observationError) {
    if (isMissingRelationError(observationError)) {
      if (!loggedMissingObservationsTable) {
        loggedMissingObservationsTable = true;
        console.info(
          "[DANTE MEMORY HIERARCHY] dante_observations unavailable — reflection-loop learning is disabled until its migration is intentionally applied.",
        );
      }
      return { observation: null, patternUpdated: false };
    }
    console.error("[DANTE MEMORY HIERARCHY] Unable to record observation:", observationError.message);
    return { observation: null, patternUpdated: false };
  }

  const observation: DanteObservation = {
    id: observationRow.id as string,
    userId: observationRow.user_id as string,
    contextKey: observationRow.context_key as string,
    interventionType: observationRow.intervention_type as InterventionType,
    beforeState: (observationRow.before_state as Record<string, string | number | null>) ?? {},
    afterState: (observationRow.after_state as Record<string, string | number | null>) ?? {},
    outcome: observationRow.outcome as ObservedOutcome,
    goalAligned: observationRow.goal_aligned as boolean | null,
    provenance: observationRow.provenance as string,
    observedAt: observationRow.observed_at as string,
  };

  const observedPositive = outcomeIsPositive(input.outcome);
  let eligibleForConsolidation =
    input.contextKey !== "insufficient_data" && observedPositive !== null;

  let positiveForLearning = observedPositive === true;

  if (input.causalContext && eligibleForConsolidation) {
    const causal = evaluateCausalOutcome({
      dimensions: input.causalContext.dimensions,
      confounders: input.causalContext.confounders,
      interventionIsVolumeReduction: input.causalContext.interventionIsVolumeReduction,
    });

    if (observedPositive === true) {
      positiveForLearning = shouldCountAsPositiveLearningEvidence({
        observedPositive: true,
        causal,
      });
      // Confounded "improvements" keep L1 but skip pattern inflation.
      if (!positiveForLearning) {
        eligibleForConsolidation = false;
      }
    } else if (observedPositive === false && causal.confounderCount > 0) {
      // Still allow negative evidence — contradictory outcomes must reduce confidence.
      positiveForLearning = false;
    }
  }

  if (!eligibleForConsolidation) {
    return { observation, patternUpdated: false };
  }

  const existing = await findLearnedPattern(supabase, input.userId, input.contextKey, input.interventionType);

  const updated = recordEvidence(existing, {
    userId: input.userId,
    contextKey: input.contextKey,
    interventionType: input.interventionType,
    positive: positiveForLearning,
    now: input.now,
  });

  await upsertLearnedPattern(supabase, existing?.id ?? null, updated);

  return { observation, patternUpdated: true };
}
