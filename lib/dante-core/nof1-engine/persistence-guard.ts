/**
 * Client-safe N-of-1 persistence guards (no server-only imports).
 * Durable persisted experiments use Supabase UUIDs; ephemeral proposals use `nof1:...` ids.
 */

import type { ExperimentStatus } from "@/lib/dante-core/nof1-engine/types";

export function isDurableNof1Id(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

const ALLOWED_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  PROPOSED: ["ACCEPTED", "PENDING_CONFIRMATION", "CANCELLED", "ABORTED"],
  ACCEPTED: ["PENDING_CONFIRMATION", "ACTIVE", "ACTIVATION_FAILED", "CANCELLED", "ABORTED"],
  PENDING_CONFIRMATION: ["ACTIVE", "ACTIVATION_FAILED", "CANCELLED", "ABORTED"],
  ACTIVATION_FAILED: ["PENDING_CONFIRMATION", "CANCELLED", "ABORTED"],
  ACTIVE: ["CONFOUNDED", "COMPLETED", "CANCELLED", "ABORTED"],
  CONFOUNDED: ["COMPLETED", "CANCELLED", "ABORTED"],
  COMPLETED: [],
  CANCELLED: [],
  ABORTED: [],
};

export function canTransitionNof1Status(from: ExperimentStatus, to: ExperimentStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
