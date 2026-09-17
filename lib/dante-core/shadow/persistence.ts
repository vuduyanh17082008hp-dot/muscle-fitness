import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertSameClient } from "@/lib/dante-core/memory-hierarchy/memory-foundation";
import { isMissingRelationError } from "@/lib/dante-core/memory-hierarchy/schema-availability";
import type {
  DriftAssessment,
  MultiDimensionalOutcome,
  ShadowDecision,
  ShadowEventType,
  StabilityAssessment,
  UncertaintyProfile,
} from "@/lib/dante-core/shadow/types";

export type ShadowEventRecord = {
  id: string;
  userId: string;
  eventType: ShadowEventType;
  recommendationId: string | null;
  contextSignature: string | null;
  productionDecision: Record<string, unknown> | null;
  shadowDecision: ShadowDecision | null;
  expectedOutcome: MultiDimensionalOutcome | null;
  actualOutcome: MultiDimensionalOutcome | null;
  uncertaintyProfile: UncertaintyProfile | null;
  driftState: DriftAssessment | null;
  stabilityState: StabilityAssessment | null;
  reasonCodes: string[];
  metadata: Record<string, unknown>;
  occurredAt: string;
};

type ShadowEventRow = {
  id: string;
  user_id: string;
  event_type: ShadowEventType;
  recommendation_id: string | null;
  context_signature: string | null;
  production_decision: Record<string, unknown> | null;
  shadow_decision: ShadowDecision | null;
  expected_outcome: MultiDimensionalOutcome | null;
  actual_outcome: MultiDimensionalOutcome | null;
  uncertainty_profile: UncertaintyProfile | null;
  drift_state: DriftAssessment | null;
  stability_state: StabilityAssessment | null;
  reason_codes: string[] | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};

let loggedMissingTable = false;

function noteUnavailable(): void {
  if (loggedMissingTable) return;
  loggedMissingTable = true;
  console.info("[DANTE PHASE3] Shadow persistence is unavailable until its migration is applied.");
}

function fromRow(row: ShadowEventRow): ShadowEventRecord {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    recommendationId: row.recommendation_id,
    contextSignature: row.context_signature,
    productionDecision: row.production_decision,
    shadowDecision: row.shadow_decision,
    expectedOutcome: row.expected_outcome,
    actualOutcome: row.actual_outcome,
    uncertaintyProfile: row.uncertainty_profile,
    driftState: row.drift_state,
    stabilityState: row.stability_state,
    reasonCodes: row.reason_codes ?? [],
    metadata: row.metadata ?? {},
    occurredAt: row.occurred_at,
  };
}

export async function appendShadowEvent(
  supabase: SupabaseClient,
  event: Omit<ShadowEventRecord, "id">,
): Promise<boolean> {
  if (event.shadowDecision) assertSameClient(event.userId, event.shadowDecision.userId);
  if (event.driftState) assertSameClient(event.userId, event.driftState.userId);
  if (event.stabilityState) assertSameClient(event.userId, event.stabilityState.userId);

  const { error } = await supabase.from("dante_phase3_shadow_events").insert({
    user_id: event.userId,
    event_type: event.eventType,
    recommendation_id: event.recommendationId,
    context_signature: event.contextSignature,
    production_decision: event.productionDecision,
    shadow_decision: event.shadowDecision,
    expected_outcome: event.expectedOutcome,
    actual_outcome: event.actualOutcome,
    uncertainty_profile: event.uncertaintyProfile,
    drift_state: event.driftState,
    stability_state: event.stabilityState,
    reason_codes: event.reasonCodes,
    metadata: event.metadata,
    occurred_at: event.occurredAt,
  });

  if (!error) return true;
  if (isMissingRelationError(error)) {
    noteUnavailable();
    return false;
  }
  console.warn("[DANTE PHASE3] Shadow event append failed", {
    eventType: event.eventType,
    reason: error.message,
  });
  return false;
}

export async function loadRecentShadowEvents(
  supabase: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<ShadowEventRecord[]> {
  const { data, error } = await supabase
    .from("dante_phase3_shadow_events")
    .select("id, user_id, event_type, recommendation_id, context_signature, production_decision, shadow_decision, expected_outcome, actual_outcome, uncertainty_profile, drift_state, stability_state, reason_codes, metadata, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));

  if (error) {
    if (isMissingRelationError(error)) noteUnavailable();
    else console.warn("[DANTE PHASE3] Shadow history load failed", { reason: error.message });
    return [];
  }

  return ((data as ShadowEventRow[] | null) ?? [])
    .filter((row) =>
      row.user_id === userId &&
      (!row.shadow_decision || row.shadow_decision.userId === userId) &&
      (!row.drift_state || row.drift_state.userId === userId) &&
      (!row.stability_state || row.stability_state.userId === userId)
    )
    .map(fromRow);
}
