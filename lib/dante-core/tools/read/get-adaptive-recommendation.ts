import "server-only";

import { z } from "zod";

import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { buildAdaptiveProgram } from "@/lib/dante-core/adaptive-program-engine";
import type { DanteTool } from "@/lib/dante-core/tools/types";
import { cached } from "@/lib/dante-core/tools/request-cache";
import { logToolEvent } from "@/lib/dante-core/tools/observability";

const inputSchema = z
  .object({
    /** Optional case-insensitive substring filter, e.g. "bench" -> "Barbell Bench Press". Omit to get every exercise the engine has a fresh decision for. */
    exerciseName: z.string().min(1).max(120).optional(),
  })
  .strict();

export type AdaptiveRecommendationToolOutput = {
  recommendations: Array<{
    exerciseName: string;
    action: string;
    nextTargetWeightKg: number | null;
    reason: string;
    confidence: string;
  }>;
};

/**
 * get_adaptive_recommendation — the ONLY way any progression/adaptation
 * question is ever answered (Part 4: "Any progression/adaptation
 * question must use the existing Adaptive Engine"). Wraps
 * lib/dante-core/adaptive-program-engine.ts::buildAdaptiveProgram
 * verbatim — action/nextTargetWeightKg/reason/confidence are returned
 * exactly as the engine computed them; nothing here (or anywhere
 * downstream, since this is the only source) can substitute a
 * different progression decision.
 */
export const getAdaptiveRecommendationTool: DanteTool<
  { exerciseName?: string },
  AdaptiveRecommendationToolOutput
> = {
  name: "get_adaptive_recommendation",
  description: "Get the deterministic Adaptive Program Engine's progression decision (INCREASE_LOAD / HOLD / DECREASE_LOAD) for one or all exercises. Always use this before answering any 'should I increase/change X' training question — never decide progression yourself.",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context, input) {
    const { supabase, userId } = context;

    const [athleteState, trainingContext] = await Promise.all([
      cached(context, "athleteState", () => buildAthleteState(supabase, userId)).catch(() => null),
      cached(context, "trainingContext", () => loadTrainingContext(supabase, userId)).catch(() => null),
    ]);

    if (!athleteState || !trainingContext) {
      return { ok: true, data: { recommendations: [] } };
    }

    const program = buildAdaptiveProgram(athleteState, trainingContext);
    const needle = input.exerciseName?.trim().toLowerCase();

    const recommendations = program
      .filter(({ decision }) => (needle ? decision.exerciseName.toLowerCase().includes(needle) : true))
      .map(({ decision, why, confidence }) => ({
        exerciseName: decision.exerciseName,
        action: decision.action,
        nextTargetWeightKg: decision.suggestedWeightKg,
        reason: why.join(" "),
        confidence,
      }));

    if (recommendations.length > 0) {
      logToolEvent("ADAPTIVE_RECOMMENDATION_USED", { tool: "get_adaptive_recommendation" });
    }

    return { ok: true, data: { recommendations } };
  },
};
