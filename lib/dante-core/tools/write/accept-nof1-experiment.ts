import "server-only";

import { z } from "zod";

import type { DanteTool } from "@/lib/dante-core/tools/types";
import { persistAcceptedNof1Experiment } from "@/lib/dante-core/nof1-engine/persistence";

const inputSchema = z
  .object({
    hypothesis: z.string().min(1).max(500),
    rationale: z.string().max(800).default(""),
    controlledVariables: z.array(z.string().min(1).max(80)).min(1).max(8),
    variableUnderTest: z.string().min(1).max(120),
    primaryOutcome: z.string().min(1).max(200),
    secondaryOutcomes: z.array(z.string().min(1).max(120)).max(6).optional(),
    experimentWindow: z
      .object({
        start: z.string().min(1),
        end: z.string().min(1),
        durationDays: z.number().int().min(1).max(30),
      })
      .strict(),
    templateId: z.string().max(64).nullable().optional(),
    createdAt: z.string().optional(),
  })
  .strict();

export type AcceptNof1ExperimentInput = z.infer<typeof inputSchema>;
export type AcceptNof1ExperimentOutput = {
  experimentId: string;
  status: "ACTIVE";
  variableUnderTest: string;
};

/**
 * Persist an N-of-1 experiment ONLY after Confirm.
 * Proposal remains ephemeral until this write executes.
 */
export const acceptNof1ExperimentTool: DanteTool<AcceptNof1ExperimentInput, AcceptNof1ExperimentOutput> = {
  name: "accept_nof1_experiment",
  description:
    "Persist a user-accepted N-of-1 micro-experiment as ACTIVE after explicit confirmation. Never invents outcomes.",
  inputSchema,
  mode: "write",
  risk: "medium",
  requiresConfirmation: true,

  summarize(input) {
    return `Start ${input.experimentWindow.durationDays}-day N-of-1 test: ${input.variableUnderTest} (control: ${input.controlledVariables.join(", ")})`;
  },

  async execute(context, input) {
    const result = await persistAcceptedNof1Experiment(context.supabase, context.userId, {
      hypothesis: input.hypothesis,
      rationale: input.rationale,
      controlledVariables: input.controlledVariables,
      variableUnderTest: input.variableUnderTest,
      primaryOutcome: input.primaryOutcome,
      secondaryOutcomes: input.secondaryOutcomes,
      experimentWindow: input.experimentWindow,
      templateId: input.templateId ?? null,
      createdAt: input.createdAt,
    });

    if (!result.success) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      data: {
        experimentId: result.data.id,
        status: "ACTIVE",
        variableUnderTest: result.data.variableUnderTest,
      },
    };
  },
};
