import "server-only";

import { z } from "zod";

import { loadTodaySession } from "@/lib/training/load-today-session";
import type { DanteTool } from "@/lib/dante-core/tools/types";
import { cached } from "@/lib/dante-core/tools/request-cache";

const inputSchema = z.object({}).strict();

export type CurrentWorkoutToolOutput = {
  hasSession: boolean;
  session: {
    name: string | null;
    scheduledFor: string | null;
    durationMinutes: number | null;
    sessionState: string | null;
    exerciseCount: number;
    exercises: Array<{ exerciseName: string; targetSets: number | null; repMin: number | null; repMax: number | null; isSkipped: boolean }>;
  } | null;
};

/**
 * get_current_workout — wraps lib/training/load-today-session.ts, the
 * exact same reader the Dashboard/Training pages use. Compact: no ids,
 * no routes (Part 12 — never send fields the model doesn't reason with).
 */
export const getCurrentWorkoutTool: DanteTool<Record<string, never>, CurrentWorkoutToolOutput> = {
  name: "get_current_workout",
  description: "Get the user's currently scheduled/in-progress workout session for today, including its exercises.",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context) {
    const { supabase, userId, now, timezone } = context;

    const session = await cached(context, "todaySession", () => loadTodaySession(supabase, userId, now, timezone));

    if (!session) {
      return { ok: true, data: { hasSession: false, session: null } };
    }

    return {
      ok: true,
      data: {
        hasSession: true,
        session: {
          name: session.name,
          scheduledFor: session.scheduledFor,
          durationMinutes: session.durationMinutes,
          sessionState: session.sessionState,
          exerciseCount: session.exercises.length,
          exercises: session.exercises.map((exercise) => ({
            exerciseName: exercise.exerciseName,
            targetSets: exercise.targetSets,
            repMin: exercise.repMin,
            repMax: exercise.repMax,
            isSkipped: exercise.isSkipped,
          })),
        },
      },
    };
  },
};
