import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingRelationError } from "@/lib/dante-core/memory-hierarchy/schema-availability";
import type { ValidationEventRecord } from "@/lib/dante-core/validation/types";

type ValidationEventRow = {
  id: string;
  user_id: string;
  event_type: ValidationEventRecord["eventType"];
  recommendation_id: string | null;
  parent_event_id: string | null;
  context_signature: ValidationEventRecord["contextSignature"];
  payload: Record<string, unknown> | null;
  provenance: ValidationEventRecord["provenance"];
  occurred_at: string;
};

let loggedMissingTable = false;

function noteUnavailable(): void {
  if (loggedMissingTable) return;
  loggedMissingTable = true;
  console.info("[DANTE PHASE4] Validation persistence is unavailable until its migration is applied.");
}

function fromRow(row: ValidationEventRow): ValidationEventRecord {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    recommendationId: row.recommendation_id,
    parentEventId: row.parent_event_id,
    contextSignature: row.context_signature,
    payload: row.payload ?? {},
    provenance: row.provenance,
    occurredAt: row.occurred_at,
  };
}

/** Best-effort, append-only telemetry. A false return must never block production. */
export async function appendValidationEvent(
  supabase: SupabaseClient,
  event: Omit<ValidationEventRecord, "id">,
  idempotencyKey?: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("dante_phase4_validation_events").insert({
      user_id: event.userId,
      event_type: event.eventType,
      recommendation_id: event.recommendationId,
      parent_event_id: event.parentEventId,
      context_signature: event.contextSignature,
      payload: event.payload,
      provenance: event.provenance,
      idempotency_key: idempotencyKey ?? null,
      occurred_at: event.occurredAt,
    });
    if (!error) return true;
    if (isMissingRelationError(error)) noteUnavailable();
    else if (error.code !== "23505") console.warn("[DANTE PHASE4] Validation append failed", { eventType: event.eventType, reason: error.message });
    return false;
  } catch (error) {
    console.warn("[DANTE PHASE4] Validation append unavailable", {
      eventType: event.eventType,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

export async function loadValidationEvents(
  supabase: SupabaseClient,
  userId: string,
  limit = 200,
): Promise<ValidationEventRecord[]> {
  try {
    const { data, error } = await supabase
      .from("dante_phase4_validation_events")
      .select("id, user_id, event_type, recommendation_id, parent_event_id, context_signature, payload, provenance, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 500)));
    if (error) {
      if (isMissingRelationError(error)) noteUnavailable();
      else console.warn("[DANTE PHASE4] Validation history load failed", { reason: error.message });
      return [];
    }
    return ((data as ValidationEventRow[] | null) ?? [])
      .filter((row) => row.user_id === userId)
      .map(fromRow);
  } catch (error) {
    console.warn("[DANTE PHASE4] Validation history unavailable", { reason: error instanceof Error ? error.message : "unknown" });
    return [];
  }
}
