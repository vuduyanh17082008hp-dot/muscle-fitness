import "server-only";

import { z } from "zod";

import { retrieveDanteKnowledge } from "@/lib/dante-core/knowledge-brain/retrieve";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z
  .object({
    exerciseName: z.string().min(1).max(120),
  })
  .strict();

export type ExerciseGuidanceToolOutput = {
  chunks: Array<{ title: string; category: string; source: string; sourceUrl: string | null }>;
};

/**
 * get_exercise_guidance — a narrower, exercise-specific entry point
 * into the SAME Knowledge Brain retrieve_knowledge uses, scoped to
 * technique/safety categories (Part 3, Part 5 example: "How should I
 * perform an RDL safely?" -> Knowledge Brain).
 */
export const getExerciseGuidanceTool: DanteTool<{ exerciseName: string }, ExerciseGuidanceToolOutput> = {
  name: "get_exercise_guidance",
  description: "Get curated technique/safety guidance for a specific exercise (form cues, common mistakes, safety notes).",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context, input) {
    const { supabase, userId } = context;

    const chunks = await retrieveDanteKnowledge(supabase, {
      query: `${input.exerciseName} technique safety cues common mistakes`,
      userId,
      categories: ["exercise_technique", "safety"],
    });

    return {
      ok: true,
      data: {
        chunks: chunks.map((chunk) => ({
          title: chunk.title,
          category: chunk.category,
          source: chunk.source,
          sourceUrl: chunk.sourceUrl,
        })),
      },
    };
  },
};
