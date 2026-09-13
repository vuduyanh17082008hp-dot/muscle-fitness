import "server-only";

import { z } from "zod";

import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z
  .object({
    workoutDayId: z.string().uuid(),
  })
  .strict();

export type ScheduleWorkoutInput = z.infer<typeof inputSchema>;
export type ScheduleWorkoutToolOutput = { sessionId: string };

/**
 * schedule_workout — wraps the existing `start_workout` SQL RPC (the
 * SAME canonical writer app/dashboard/workouts/actions.ts::startWorkoutAction
 * uses) verbatim. Never a second scheduling system, never a direct
 * insert into workout_sessions. The RPC is `security definer` but
 * derives `auth.uid()` itself and only matches a workout day whose
 * plan's `client_id` equals the caller — a Dante tool call cannot
 * schedule a session for anyone but the authenticated user, and it
 * cannot schedule an already-inactive plan's day either. Already
 * idempotent: calling it twice for the same day returns the SAME
 * in-progress session id instead of creating a duplicate (Part 9).
 */
export const scheduleWorkoutTool: DanteTool<ScheduleWorkoutInput, ScheduleWorkoutToolOutput> = {
  name: "schedule_workout",
  description: "Start/schedule today's workout session for a specific workout day on the user's active plan. Requires the workout day id (from get_today_plan/get_current_workout context or a plan the user named).",
  inputSchema,
  mode: "write",
  risk: "medium",
  requiresConfirmation: true,

  summarize() {
    return "Start today's workout session";
  },

  async execute(context, input) {
    const { supabase } = context;

    const { data: sessionId, error } = await supabase.rpc("start_workout", {
      p_workout_day_id: input.workoutDayId,
    });

    if (error || !sessionId) {
      return { ok: false, error: error?.message ?? "Could not start this workout." };
    }

    return { ok: true, data: { sessionId: sessionId as string } };
  },
};
