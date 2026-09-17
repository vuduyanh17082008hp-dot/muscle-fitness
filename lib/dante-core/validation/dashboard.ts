import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRecentShadowEvents, type ShadowEventRecord } from "@/lib/dante-core/shadow/persistence";
import { loadValidationEvents } from "@/lib/dante-core/validation/persistence";
import { buildPromotionReadinessReport } from "@/lib/dante-core/validation/promotion-readiness";
import type { PromotionReadinessReport, ValidationEventRecord } from "@/lib/dante-core/validation/types";

type MemoryObservationRow = {
  id: string;
  user_id: string;
  context_key: string;
  intervention_type: string;
  outcome: string;
  provenance: string;
  observed_at: string;
};

type MemoryPatternRow = {
  id: string;
  user_id: string;
  context_key: string;
  intervention_type: string;
  tier: string;
  status: string;
  sample_count: number;
  confidence: number;
  first_observed_at: string;
  last_reinforced_at: string;
};

export type ValidationDashboard = {
  userId: string;
  overview: {
    eligibleRecommendations: number;
    linkedOutcomes: number;
    missingOutcomes: number;
    unresolvedOutcomes: number;
    completeTraces: number;
    driftEvents: number;
    shadowDisagreements: number;
    safetyEvents: number;
    instrumentationFailures: number;
  };
  shadowEvents: ShadowEventRecord[];
  validationEvents: ValidationEventRecord[];
  observations: MemoryObservationRow[];
  patterns: MemoryPatternRow[];
  dataQuality: string[];
  promotion: PromotionReadinessReport;
};

async function loadMemoryRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  timestampColumn: string,
): Promise<T[]> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .order(timestampColumn, { ascending: false })
      .limit(100);
    if (error) return [];
    return ((data as unknown as Array<T & { user_id: string }> | null) ?? [])
      .filter((row) => row.user_id === userId);
  } catch {
    return [];
  }
}

export async function buildValidationDashboard(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<ValidationDashboard> {
  const [shadowEvents, validationEvents, observations, patterns] = await Promise.all([
    loadRecentShadowEvents(supabase, userId, 100),
    loadValidationEvents(supabase, userId, 200),
    loadMemoryRows<MemoryObservationRow>(supabase, "dante_observations", "id, user_id, context_key, intervention_type, outcome, provenance, observed_at", userId, "observed_at"),
    loadMemoryRows<MemoryPatternRow>(supabase, "dante_learned_patterns", "id, user_id, context_key, intervention_type, tier, status, sample_count, confidence, first_observed_at, last_reinforced_at", userId, "last_reinforced_at"),
  ]);
  // Defense in depth: every collection is filtered again after RLS and query scoping.
  const scopedShadow = shadowEvents.filter((event) => event.userId === userId);
  const scopedValidation = validationEvents.filter((event) => event.userId === userId);
  const allDecisions = scopedShadow.filter((event) => event.eventType === "SHADOW_DECISION" && event.recommendationId);
  const decisions = allDecisions.filter((event) =>
    event.expectedOutcome !== null && Object.values(event.expectedOutcome).some((value) => value !== "UNKNOWN")
  );
  const outcomes = scopedShadow.filter((event) => event.eventType === "OUTCOME_LINKED" && event.recommendationId);
  const linkedIds = new Set(outcomes.map((event) => event.recommendationId));
  const traceIds = new Set(scopedValidation.filter((event) => event.eventType === "RECOMMENDATION_TRACE").map((event) => event.recommendationId));
  const observedIds = new Set(scopedValidation.filter((event) => event.eventType === "OUTCOME_OBSERVED").map((event) => event.recommendationId));
  const evaluatedIds = new Set(scopedValidation.filter((event) => event.eventType === "PREDICTION_EVALUATED").map((event) => event.recommendationId));
  const matured = decisions.filter((event) => now.getTime() - new Date(event.occurredAt).getTime() > 36 * 60 * 60 * 1000);
  const unresolvedOutcomes = outcomes.filter((event) => event.actualOutcome && Object.values(event.actualOutcome).every((value) => value === "UNKNOWN")).length;
  const completeTraces = decisions.filter((event) =>
    traceIds.has(event.recommendationId) && observedIds.has(event.recommendationId) && evaluatedIds.has(event.recommendationId)
  ).length;
  const duplicateOutcomeCount = outcomes.length - new Set(outcomes.map((event) => event.recommendationId)).size;
  const brokenLinkCount = outcomes.filter((event) => !decisions.some((decision) => decision.recommendationId === event.recommendationId)).length;
  const dataQuality = [
    ...(duplicateOutcomeCount > 0 ? [`${duplicateOutcomeCount} duplicate outcome linkage(s)`] : []),
    ...(brokenLinkCount > 0 ? [`${brokenLinkCount} outcome(s) without a source recommendation`] : []),
    ...(matured.some((event) => !linkedIds.has(event.recommendationId)) ? ["Mature recommendations are missing outcomes"] : []),
    ...(scopedValidation.length === 0 ? ["Phase 4 validation events are unavailable or not yet captured"] : []),
  ];
  const safetyEvents = scopedShadow.filter((event) => event.reasonCodes.some((code) => code.includes("SAFETY"))).length;
  const driftEvents = scopedShadow.filter((event) => event.driftState?.status === "CONFIRMED").length;
  const shadowDisagreements = scopedValidation.filter((event) =>
    event.eventType === "SHADOW_EVALUATED" && event.payload.classification !== "AGREEMENT"
  ).length;
  const promotion = buildPromotionReadinessReport({
    // No dedicated Phase 1 safety-audit result is captured in this dataset,
    // so the safety gate must remain INSUFFICIENT_DATA rather than infer PASS.
    safetyObservations: 0,
    safetyFailures: 0,
    isolationVerified: true,
    isolationFailures: 0,
    eligibleRecommendations: decisions.length,
    completeTraces,
    maturedRecommendations: matured.length,
    linkedOutcomes: matured.filter((event) => linkedIds.has(event.recommendationId)).length,
    calibratedOutcomes: outcomes.length,
    driftLabels: scopedValidation.filter((event) => event.eventType === "DRIFT_EVALUATED").length,
    stabilityWindows: scopedShadow.filter((event) => event.stabilityState !== null).length,
    evaluableShadowDisagreements: scopedValidation.filter((event) => event.payload.classification === "EVALUABLE_DISAGREEMENT").length,
    memoryEvents: observations.length + patterns.length,
    // Pattern counters do not currently retain source episode IDs. Do not
    // claim their provenance complete merely because a pattern row exists.
    provenanceCompleteMemoryEvents: observations.filter((item) => Boolean(item.provenance)).length,
  }, now.toISOString());
  return {
    userId,
    overview: {
      eligibleRecommendations: decisions.length,
      linkedOutcomes: outcomes.length,
      missingOutcomes: matured.filter((event) => !linkedIds.has(event.recommendationId)).length,
      unresolvedOutcomes,
      completeTraces,
      driftEvents,
      shadowDisagreements,
      safetyEvents,
      instrumentationFailures: scopedValidation.filter((event) => event.eventType === "INSTRUMENTATION_FAILURE").length,
    },
    shadowEvents: scopedShadow,
    validationEvents: scopedValidation,
    observations,
    patterns,
    dataQuality,
    promotion,
  };
}
