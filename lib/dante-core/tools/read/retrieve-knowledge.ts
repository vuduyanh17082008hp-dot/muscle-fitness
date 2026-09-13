import "server-only";

import { z } from "zod";

import { retrieveDanteKnowledge } from "@/lib/dante-core/knowledge-brain/retrieve";
import type { KnowledgeCategory } from "@/lib/dante-core/knowledge-brain/types";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const KNOWLEDGE_CATEGORIES = [
  "training",
  "nutrition",
  "recovery",
  "supplements",
  "exercise_technique",
  "safety",
  "general",
] as const satisfies readonly KnowledgeCategory[];

const inputSchema = z
  .object({
    query: z.string().min(1).max(300),
    categories: z.array(z.enum(KNOWLEDGE_CATEGORIES)).max(5).optional(),
  })
  .strict();

export type RetrieveKnowledgeToolOutput = {
  chunks: Array<{ title: string; category: string; source: string; sourceUrl: string | null }>;
};

/**
 * retrieve_knowledge — wraps the existing Dante Knowledge Brain hybrid
 * retrieval (lib/dante-core/knowledge-brain/retrieve.ts) verbatim. This
 * is reusable reference knowledge (technique/research), never a
 * substitute for the user's own live state (Part 5) — the model should
 * only reach for this tool for "explain X" / "what does research say"
 * style questions, not for the user's own numbers.
 */
export const retrieveKnowledgeTool: DanteTool<{ query: string; categories?: KnowledgeCategory[] }, RetrieveKnowledgeToolOutput> = {
  name: "retrieve_knowledge",
  description: "Search Dante's curated knowledge base for reusable reference knowledge (technique cues, research summaries). Do NOT use this for the user's own live data (workout, macros, recovery) — use the matching get_* tool instead.",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context, input) {
    const { supabase, userId } = context;

    const chunks = await retrieveDanteKnowledge(supabase, {
      query: input.query,
      userId,
      categories: input.categories,
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
