import "server-only";

import { z } from "zod";

import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z.object({}).strict();

export type TrainingStateToolOutput = {
  hasLoggedTrainingData: boolean;
  muscles: Array<{
    muscle: string;
    currentWeekEffectiveSets: number;
    changePercent: number | null;
    frequencyThisWeek: number;
    recommendation: string;
    recommendationConfidence: string;
  }>;
};

/**
 * get_training_state — wraps lib/athlete-state/build-athlete-state.ts
 * (the Digital Twin's per-muscle volume/frequency/recommendation
 * output), the SAME structured object app/api/chatbot/route.ts already
 * summarizes for the legacy prompt. Never recomputes effective sets.
 */
export const getTrainingStateTool: DanteTool<Record<string, never>, TrainingStateToolOutput> = {
  name: "get_training_state",
  description: "Get the user's per-muscle training volume, week-over-week change, frequency and deterministic recommendation (MAINTAIN / INCREASE_GRADUALLY / REDUCE_SLIGHTLY / etc).",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context) {
    const { supabase, userId } = context;

    const athleteState = await buildAthleteState(supabase, userId).catch(() => null);

    if (!athleteState || !athleteState.training.hasAnyLoggedData) {
      return { ok: true, data: { hasLoggedTrainingData: false, muscles: [] } };
    }

    return {
      ok: true,
      data: {
        hasLoggedTrainingData: true,
        muscles: athleteState.training.muscles.map((entry) => ({
          muscle: MUSCLE_DISPLAY_NAME[entry.muscle],
          currentWeekEffectiveSets: entry.analytics.currentWeek.totalEffectiveSets,
          changePercent: entry.analytics.changePercent,
          frequencyThisWeek: entry.analytics.frequency,
          recommendation: entry.recommendation.recommendation,
          recommendationConfidence: entry.recommendation.confidence,
        })),
      },
    };
  },
};
