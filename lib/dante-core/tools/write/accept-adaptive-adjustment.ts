import "server-only";

import { z } from "zod";

import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { buildAdaptiveProgram } from "@/lib/dante-core/adaptive-program-engine";
import type { DanteTool } from "@/lib/dante-core/tools/types";
import { cached } from "@/lib/dante-core/tools/request-cache";

const inputSchema = z
  .object({
    exerciseName: z.string().min(1).max(120),
  })
  .strict();

export type AcceptAdaptiveAdjustmentInput = z.infer<typeof inputSchema>;
export type AcceptAdaptiveAdjustmentToolOutput = { exerciseName: string; action: string; nextTargetWeightKg: number | null };

/**
 * accept_adaptive_adjustment — ADVISORY only (Part 6:
 * lib/dante-core/adaptive-program-engine.ts's own docstring: a load
 * suggestion applies to a session that doesn't exist as a row yet —
 * weight is only ever logged per-set, after the fact — so there is no
 * table to write today; the engine's job is to decide and explain,
 * not mutate). This tool exists so "yes, increase my bench" goes
 * through the SAME confirm-then-record pipeline as every other write
 * tool (Part 8's audit trail is the `dante_tool_actions` row itself)
 * rather than the LLM silently agreeing in prose. It re-fetches the
 * CURRENT engine decision at execute time and refuses to acknowledge
 * a decision that no longer matches what the engine says NOW (e.g.
 * a stale proposal from an earlier turn) — Dante can never accept on
 * the engine's behalf a different action than the one it actually
 * computed.
 */
export const acceptAdaptiveAdjustmentTool: DanteTool<AcceptAdaptiveAdjustmentInput, AcceptAdaptiveAdjustmentToolOutput> = {
  name: "accept_adaptive_adjustment",
  description: "Record that the user explicitly accepted the Adaptive Program Engine's current progression decision for one exercise. Never invents or overrides the decision — only acknowledges it.",
  inputSchema,
  mode: "write",
  risk: "low",
  requiresConfirmation: true,

  summarize(input) {
    return `Accept the current adaptive recommendation for ${input.exerciseName}`;
  },

  async execute(context, input) {
    const { supabase, userId } = context;

    const [athleteState, trainingContext] = await Promise.all([
      cached(context, "athleteState", () => buildAthleteState(supabase, userId)).catch(() => null),
      cached(context, "trainingContext", () => loadTrainingContext(supabase, userId)).catch(() => null),
    ]);

    if (!athleteState || !trainingContext) {
      return { ok: false, error: "No adaptive recommendation is currently available." };
    }

    const needle = input.exerciseName.trim().toLowerCase();
    const match = buildAdaptiveProgram(athleteState, trainingContext).find(({ decision }) =>
      decision.exerciseName.toLowerCase().includes(needle),
    );

    if (!match) {
      return { ok: false, error: `No fresh adaptive recommendation exists for "${input.exerciseName}".` };
    }

    return {
      ok: true,
      data: {
        exerciseName: match.decision.exerciseName,
        action: match.decision.action,
        nextTargetWeightKg: match.decision.suggestedWeightKg,
      },
    };
  },
};
