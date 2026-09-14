import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DIRECT_EFFECT_ACTION_TYPES,
  buildInverseActionPayload,
  type ActionEvidenceItem,
  type ActionRiskClass,
  type DanteActionPayload,
  type DanteActionStatus,
  type PostponeExercisePayload,
} from "@/lib/dante-core/actions/types";
import { handleSessionAction } from "@/lib/workouts/session-mutations";

/**
 * The ONLY code path that turns a Dante-proposed action into a real
 * database write (spec Part "2. DANTE ACTIONS": "Never: LLM → direct
 * DB mutation"). An LLM can produce the `reason` text shown to the
 * user; it never calls this function itself and never constructs the
 * write — the API route below does that, using only structured,
 * pre-validated input.
 *
 * Flow: PREVIEW (already happened — the client is showing this
 * action) → USER CONFIRMS (this call, intent="confirm") → VALIDATION
 * (the underlying mutation re-checks ownership; a session/exercise
 * that no longer exists — deleted, already completed — fails here
 * with an honest "not found" error rather than a stale write
 * succeeding silently) → WRITE → AUDIT (every outcome, including
 * rejection, is logged to dante_action_log).
 */

export type ApplyActionInput = {
  payload: DanteActionPayload;
  reason: string;
  confidence: number;
  /** "auto" = the orchestrator's autonomy gate already decided this may apply without a confirm click (mission Part 12) — audited identically to "confirm" except `auto_applied: true`. apply-action.ts never makes that decision itself; it only executes and audits what the caller already decided. */
  intent: "confirm" | "reject" | "auto";
  /** Optional richer audit fields (mission Part 11) — every existing caller that omits these keeps working; the audit row simply has nulls for them. */
  domain?: string;
  riskLevel?: ActionRiskClass;
  evidence?: ActionEvidenceItem[];
  limits?: { maxMagnitude: number; unit: string } | null;
  provenance?: string;
};

export type ApplyActionResult =
  | { ok: true; status: DanteActionStatus; message: string }
  | { ok: false; status: DanteActionStatus; error: string };

/**
 * Loads the ORIGINAL action being undone — scoped to this user AND
 * `status = 'applied'` only, so a proposed/rejected/failed/already-
 * undone action can never be "undone" (there is nothing real to
 * reverse), and RLS-plus-explicit-user-scoping means undoing someone
 * else's action id is indistinguishable from a missing one.
 */
async function loadOriginalAppliedAction(
  supabase: SupabaseClient,
  userId: string,
  targetActionLogId: string,
): Promise<{ actionType: string; payload: DanteActionPayload } | null> {
  const { data, error } = await supabase
    .from("dante_action_log")
    .select("action_type, payload")
    .eq("id", targetActionLogId)
    .eq("user_id", userId)
    .eq("status", "applied")
    .maybeSingle();

  if (error || !data) return null;

  return { actionType: data.action_type as string, payload: data.payload as DanteActionPayload };
}

async function performDirectEffectMutation(
  supabase: SupabaseClient,
  userId: string,
  payload: DanteActionPayload,
): Promise<{ success: boolean; message: string; data?: unknown }> {
  switch (payload.type) {
    case "adjust_sets_reps":
      return handleSessionAction(payload.sessionId, "adjust_sets_reps", {
        sessionExerciseId: payload.sessionExerciseId,
        targetSets: payload.after.sets,
        repMin: payload.after.repMin,
        repMax: payload.after.repMax,
      });

    case "modify_volume":
      return handleSessionAction(payload.sessionId, "adjust_sets_reps", {
        sessionExerciseId: payload.sessionExerciseId,
        targetSets: payload.after.sets,
      });

    case "postpone_exercise":
      return handleSessionAction(payload.sessionId, "skip_exercise", {
        sessionExerciseId: payload.sessionExerciseId,
        isSkipped: true,
      });

    case "undo_action": {
      const original = await loadOriginalAppliedAction(supabase, userId, payload.targetActionLogId);

      if (!original) {
        return { success: false, message: "The original action was not found or was already undone." };
      }

      // postpone_exercise has no before/after to swap — its inverse is
      // simply un-skipping the exercise it skipped.
      if (original.actionType === "postpone_exercise") {
        const originalPayload = original.payload as PostponeExercisePayload;
        return handleSessionAction(originalPayload.sessionId, "skip_exercise", {
          sessionExerciseId: originalPayload.sessionExerciseId,
          isSkipped: false,
        });
      }

      const inverse = buildInverseActionPayload(original.payload);

      if (!inverse) {
        return { success: false, message: "This action type cannot be undone." };
      }

      return performDirectEffectMutation(supabase, userId, inverse);
    }

    default:
      // Advisory action types never reach here — callers only invoke
      // this function for DIRECT_EFFECT_ACTION_TYPES (see applyDanteAction).
      return { success: false, message: "This action has no direct database effect." };
  }
}

function auditFields(input: ApplyActionInput) {
  return {
    domain: input.domain ?? null,
    risk_level: input.riskLevel ?? null,
    evidence: input.evidence ?? null,
    limits: input.limits ?? null,
    provenance: input.provenance ?? null,
    auto_applied: input.intent === "auto",
  };
}

export async function applyDanteAction(
  supabase: SupabaseClient,
  userId: string,
  input: ApplyActionInput,
): Promise<ApplyActionResult> {
  if (input.intent === "reject") {
    await supabase.from("dante_action_log").insert({
      user_id: userId,
      action_type: input.payload.type,
      status: "rejected",
      payload: input.payload,
      reason: input.reason,
      decision_confidence: input.confidence,
      ...auditFields(input),
    });

    return { ok: true, status: "rejected", message: "Suggestion dismissed." };
  }

  const isDirectEffect = DIRECT_EFFECT_ACTION_TYPES.includes(input.payload.type);

  if (!isDirectEffect) {
    // Advisory action: nothing to write except the audit trail itself —
    // Dante never submits a check-in, meal log, or nutrition-target
    // override on the user's behalf.
    await supabase.from("dante_action_log").insert({
      user_id: userId,
      action_type: input.payload.type,
      status: "applied",
      payload: input.payload,
      reason: input.reason,
      decision_confidence: input.confidence,
      applied_result: { note: "Acknowledged — no direct data change for this action type." },
      ...auditFields(input),
    });

    return { ok: true, status: "applied", message: "Noted." };
  }

  const result = await performDirectEffectMutation(supabase, userId, input.payload);

  await supabase.from("dante_action_log").insert({
    user_id: userId,
    action_type: input.payload.type,
    status: result.success ? "applied" : "failed",
    payload: input.payload,
    reason: input.reason,
    decision_confidence: input.confidence,
    applied_result: result,
    ...auditFields(input),
  });

  if (!result.success) {
    return { ok: false, status: "failed", error: result.message };
  }

  return { ok: true, status: "applied", message: result.message };
}
