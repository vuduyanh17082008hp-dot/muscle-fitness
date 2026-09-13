/**
 * Dante Knowledge Brain — pgvector-backed reusable knowledge store.
 *
 * Separate from lib/dante-core/knowledge/ (the small hand-curated
 * keyword registry `attachKnowledgeSources()` uses for Adaptive
 * Engine decision explanations) and from the LIVE PubMed/MedlinePlus/
 * USDA retrieval in app/api/chatbot/route.ts (fresh external search
 * for open-ended questions). This module is for approved, ingested
 * reference documents (technique guides, evidence summaries) stored
 * as embedded chunks in Supabase/pgvector — see
 * docs/dante-knowledge/README.md for the ingestion format.
 *
 * Never stores structured per-user data (workouts, macros, recovery
 * scores) — those stay in AthleteState/DanteMemory/relational tables.
 */

export type KnowledgeCategory =
  | "training"
  | "nutrition"
  | "recovery"
  | "exercise_technique"
  | "supplements"
  | "safety"
  | "general";

export const KNOWLEDGE_CATEGORIES: readonly KnowledgeCategory[] = [
  "training",
  "nutrition",
  "recovery",
  "exercise_technique",
  "supplements",
  "safety",
  "general",
];

export type KnowledgeVisibility = "global" | "private";

export type KnowledgeChunkRow = {
  id: string;
  document_id: string;
  chunk_index: number;
  title: string;
  content: string;
  category: KnowledgeCategory;
  source_type: string;
  source_url: string | null;
  metadata: Record<string, unknown>;
  visibility: KnowledgeVisibility;
  owner_user_id: string | null;
  vector_score: number;
  text_score: number;
};

/** What retrieveDanteKnowledge() returns to callers (spec §5). */
export type RetrievedKnowledgeChunk = {
  title: string;
  content: string;
  category: KnowledgeCategory;
  source: string;
  sourceUrl: string | null;
  score: number;
};

export type RetrieveDanteKnowledgeParams = {
  query: string;
  userId?: string | null;
  categories?: KnowledgeCategory[];
  limit?: number;
};

/**
 * Minimal shape of the Supabase client this module needs. Declared as
 * PromiseLike (not Promise) so the real @supabase/supabase-js client
 * — whose `.rpc()` returns a thenable query builder, not a literal
 * Promise — is structurally assignable without a cast.
 */
export type KnowledgeBrainSupabaseClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: KnowledgeChunkRow[] | null; error: { message: string } | null }>;
};
