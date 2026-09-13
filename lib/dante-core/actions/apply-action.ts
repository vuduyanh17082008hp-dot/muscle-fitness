import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DIRECT_EFFECT_ACTION_TYPES,
  type DanteActionPayload,
  type DanteActionStatus,
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
  intent: "confirm" | "reject";
};

export type ApplyActionResult =
  | { ok: true; status: DanteActionStatus; message: string }
  | { ok: false; status: DanteActionStatus; error: string };

async function performDirectEffectMutation(
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

    default:
      // Advisory action types never reach here — callers only invoke
      // this function for DIRECT_EFFECT_ACTION_TYPES (see applyDanteAction).
      return { success: false, message: "This action has no direct database effect." };
  }
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
    });

    return { ok: true, status: "applied", message: "Noted." };
  }

  const result = await performDirectEffectMutation(input.payload);

  await supabase.from("dante_action_log").insert({
    user_id: userId,
    action_type: input.payload.type,
    status: result.success ? "applied" : "failed",
    payload: input.payload,
    reason: input.reason,
    decision_confidence: input.confidence,
    applied_result: result,
  });

  if (!result.success) {
    return { ok: false, status: "failed", error: result.message };
  }

  return { ok: true, status: "applied", message: result.message };
}
