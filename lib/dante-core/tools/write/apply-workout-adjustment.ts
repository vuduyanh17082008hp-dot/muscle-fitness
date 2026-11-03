import "server-only";

import { z } from "zod";

import type { DanteTool, ActionErrorCode } from "@/lib/dante-core/tools/types";
import { currentTrainingHold } from "@/lib/dante-core/server/training-hold-guard";
import { applyWorkoutAdjustment, type ApplyProposalError } from "@/lib/recovery/apply-proposal";
import {
  createSupabaseCanonicalCommit,
  createSupabaseMutationStore,
  createSupabaseProposalStore,
  createSupabaseSessionWriter,
} from "@/lib/recovery/supabase-apply";
import { createRecoveryAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({ proposalId: z.string().min(1).max(80) }).strict();

export type ApplyWorkoutAdjustmentInput = z.infer<typeof inputSchema>;
export type ApplyWorkoutAdjustmentOutput = {
  proposalId: string;
  sessionId: string;
  alreadyApplied: boolean;
  /** Read back from the session rows after the write — never from the proposal. */
  postponed: string[];
  remaining: string[];
};

const ERROR_CODE: Partial<Record<ApplyProposalError, ActionErrorCode>> = {
  STALE_PLAN: "ACTION_STALE",
  INVALID_PATCH: "ACTION_STALE",
  EXPIRED: "ACTION_EXPIRED",
  FORBIDDEN: "ACTION_FORBIDDEN",
  PROPOSAL_NOT_FOUND: "ACTION_NOT_FOUND",
  NOT_FOUND: "ACTION_NOT_FOUND",
  ALREADY_APPLIED: "ACTION_ALREADY_PROCESSED",
};

/**
 * apply_workout_adjustment (MF-F2) — the chat's Confirm for a signed recovery_workout_proposals row. NOT selectable by
 * the model (registry SPECIALIST_COACH_TOOLS): only the deterministic limitation flow creates the pending row, with the
 * proposal id it just stored. Execution is the SAME path as POST /api/recovery/adjustment/apply — the stored, MAC-checked
 * snapshot is the only prescription source, the training hold is re-read now (reduce-only while held), stale/expired/
 * already-applied are refused, and apply_recovery_workout_proposal writes atomically with its mutation record.
 */
export const applyWorkoutAdjustmentTool: DanteTool<ApplyWorkoutAdjustmentInput, ApplyWorkoutAdjustmentOutput> = {
  name: "apply_workout_adjustment",
  description: "Apply a stored, signed adjustment to today's workout session (postpone exercises or the whole session).",
  inputSchema,
  mode: "write",
  risk: "medium",
  requiresConfirmation: true,

  summarize() {
    return "Apply the proposed change to today's workout";
  },

  async execute(context, input) {
    const { supabase, userId } = context;
    let admin;
    try {
      admin = createRecoveryAdminClient();
    } catch {
      return { ok: false, error: "The plan change could not be recorded. Nothing was applied." };
    }

    const result = await applyWorkoutAdjustment({
      actorUserId: userId,
      trainingHold: await currentTrainingHold(supabase, userId, context.now),
      proposalId: input.proposalId,
      now: context.now,
      sessions: createSupabaseSessionWriter(supabase),
      mutations: createSupabaseMutationStore(supabase),
      proposals: createSupabaseProposalStore(admin),
      commit: createSupabaseCanonicalCommit(admin),
    });

    if (!result.ok) return { ok: false, error: result.message, code: ERROR_CODE[result.error] };

    return {
      ok: true,
      data: {
        proposalId: input.proposalId,
        sessionId: result.session.id,
        alreadyApplied: result.alreadyApplied,
        postponed: result.session.exercises.filter((exercise) => exercise.isSkipped).map((exercise) => exercise.exerciseName),
        remaining: result.session.exercises.filter((exercise) => !exercise.isSkipped).map((exercise) => exercise.exerciseName),
      },
    };
  },
};
