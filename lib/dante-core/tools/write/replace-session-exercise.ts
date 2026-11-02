import "server-only";

import { z } from "zod";

import type { DanteTool } from "@/lib/dante-core/tools/types";
import { currentTrainingHold, TRAINING_HOLD_MESSAGE } from "@/lib/dante-core/server/training-hold-guard";
import { mutateReplaceExercise } from "@/lib/workouts/session-mutations";

const inputSchema = z
  .object({
    sessionId: z.string().uuid(),
    sessionExerciseId: z.string().uuid(),
    /** The exercise the row held when the swap was proposed: a row that changed since is stale, never silently re-swapped. */
    fromExerciseId: z.string().uuid(),
    replacementExerciseId: z.string().uuid(),
    fromName: z.string().min(1).max(120),
    toName: z.string().min(1).max(120),
  })
  .strict();

export type ReplaceSessionExerciseInput = z.infer<typeof inputSchema>;
export type ReplaceSessionExerciseOutput = { sessionExerciseId: string; exerciseName: string; exerciseId: string };

/**
 * replace_session_exercise (MF-F2) — the chat's Confirm for one swap in today's session. Not model-selectable; the
 * deterministic limitation flow writes the pending row from the substitution engine's region-filtered alternatives.
 * The write is the existing session-mutations replace (ownership, open session, no logged sets, no duplicate). A swap
 * ADDS a different exercise, so it is refused while a training hold is active (same rule as apply-proposal's
 * reduce-only gate). The result is read back from the row.
 */
export const replaceSessionExerciseTool: DanteTool<ReplaceSessionExerciseInput, ReplaceSessionExerciseOutput> = {
  name: "replace_session_exercise",
  description: "Swap one exercise in today's not-yet-finished session for a proposed alternative.",
  inputSchema,
  mode: "write",
  risk: "medium",
  requiresConfirmation: true,

  summarize(input) {
    return `Swap ${input.fromName} for ${input.toName} in today's workout`;
  },

  async execute(context, input) {
    const { supabase, userId } = context;
    const hold = await currentTrainingHold(supabase, userId, context.now);
    if (hold) return { ok: false, error: `${TRAINING_HOLD_MESSAGE[hold].split(" — ")[0]}. A swap adds training, so it wasn't applied.` };

    const { data: row, error } = await supabase
      .from("workout_session_exercises")
      .select("id, exercise_id, workout_session_id")
      .eq("id", input.sessionExerciseId)
      .eq("workout_session_id", input.sessionId)
      .maybeSingle();
    if (error || !row) return { ok: false, error: "That exercise is no longer in today's workout.", code: "ACTION_STALE" };
    if (row.exercise_id !== input.fromExerciseId) {
      return { ok: false, error: `${input.fromName} has already changed in today's workout, so this swap is out of date. Nothing was applied.`, code: "ACTION_STALE" };
    }

    const result = await mutateReplaceExercise(input.sessionId, {
      sessionExerciseId: input.sessionExerciseId,
      replacementExerciseId: input.replacementExerciseId,
    });
    if (!result.success) return { ok: false, error: result.message };

    const { data: after } = await supabase
      .from("workout_session_exercises")
      .select("id, exercise_id, display_name")
      .eq("id", input.sessionExerciseId)
      .maybeSingle();
    if (!after || after.exercise_id !== input.replacementExerciseId) {
      return { ok: false, error: "The swap could not be confirmed from your workout. Check today's session before training." };
    }
    return { ok: true, data: { sessionExerciseId: after.id as string, exerciseName: (after.display_name as string | null) ?? input.toName, exerciseId: after.exercise_id as string } };
  },
};
