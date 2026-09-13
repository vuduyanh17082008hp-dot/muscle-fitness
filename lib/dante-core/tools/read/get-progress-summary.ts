import "server-only";

import { z } from "zod";

import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z.object({}).strict();

export type ProgressSummaryToolOutput = {
  hasLoggedTrainingData: boolean;
  dataWindow: { startDate: string; endDate: string } | null;
  biggestIncreases: Array<{ muscle: string; changePercent: number }>;
  biggestDecreases: Array<{ muscle: string; changePercent: number }>;
};

/**
 * get_progress_summary — a compact, ranked view over the SAME
 * per-muscle analytics get_training_state exposes (Part 3), for
 * "how am I trending" style questions without dumping every muscle.
 */
export const getProgressSummaryTool: DanteTool<Record<string, never>, ProgressSummaryToolOutput> = {
  name: "get_progress_summary",
  description: "Get a short summary of which muscles have the biggest week-over-week training volume increase/decrease.",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context) {
    const { supabase, userId } = context;

    const athleteState = await buildAthleteState(supabase, userId).catch(() => null);

    if (!athleteState || !athleteState.training.hasAnyLoggedData) {
      return { ok: true, data: { hasLoggedTrainingData: false, dataWindow: null, biggestIncreases: [], biggestDecreases: [] } };
    }

    const withChange = athleteState.training.muscles
      .filter((entry) => entry.analytics.changePercent !== null)
      .map((entry) => ({
        muscle: MUSCLE_DISPLAY_NAME[entry.muscle],
        changePercent: entry.analytics.changePercent as number,
      }));

    const increases = [...withChange].filter((entry) => entry.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
    const decreases = [...withChange].filter((entry) => entry.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);

    return {
      ok: true,
      data: {
        hasLoggedTrainingData: true,
        dataWindow: athleteState.dataWindow,
        biggestIncreases: increases,
        biggestDecreases: decreases,
      },
    };
  },
};
