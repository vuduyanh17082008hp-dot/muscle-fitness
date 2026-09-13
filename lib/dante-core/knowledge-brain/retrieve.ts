import { embedText, getEmbeddingConfig } from "@/lib/dante-core/knowledge-brain/embedding-provider";
import type {
  KnowledgeBrainSupabaseClient,
  KnowledgeChunkRow,
  RetrievedKnowledgeChunk,
  RetrieveDanteKnowledgeParams,
} from "@/lib/dante-core/knowledge-brain/types";

/**
 * Hybrid retrieval for the Dante Knowledge Brain (spec §5).
 *
 * query -> embedding -> vector candidates (+ full-text signal via the
 * same RPC) -> metadata filter (category, RLS-scoped visibility) ->
 * dedupe -> relevance threshold -> compact final results.
 *
 * Takes a caller-supplied Supabase client (the request-scoped,
 * cookie-authenticated client from lib/supabase/server.ts) rather
 * than constructing one itself — this is what makes private-knowledge
 * isolation a property of Postgres RLS instead of application logic:
 * match_dante_knowledge_chunks() is SECURITY INVOKER, so it only ever
 * returns rows the calling user's session is allowed to see.
 *
 * Never throws: any embedding or database failure is caught, logged
 * as DANTE_RAG_FALLBACK, and resolves to an empty array so a normal
 * Dante reply can still be generated without retrieved knowledge.
 */

const INTERNAL_CANDIDATE_LIMIT = 20;
const DEFAULT_RESULT_LIMIT = 5;
const MAX_RESULT_LIMIT = 6;
const MAX_CHUNKS_PER_DOCUMENT = 2;

// Combined score below this is treated as "not actually relevant" —
// weak matches return no result rather than a low-confidence guess.
// The 0.7/0.3 weighting mirrors match_dante_knowledge_chunks()'s own
// ORDER BY so the threshold and the ranking agree on what "close"
// means; text_score (ts_rank) is normalized against a small constant
// since its raw scale is unbounded, unlike cosine similarity's [0,1].
//
// KNOWN LIMITATION: 0.28 is a starting point, not a calibrated value —
// different embedding models have different baseline cosine-similarity
// distributions (some cluster much higher for unrelated text than
// others), so this should be tuned against the actual configured
// provider/model once real usage data exists. DANTE_RAG_MIN_SCORE lets
// that happen without a code change.
const RELEVANCE_THRESHOLD = Number.parseFloat(process.env.DANTE_RAG_MIN_SCORE ?? "") || 0.28;
const TEXT_SCORE_NORMALIZER = 0.15;

function combinedScore(row: Pick<KnowledgeChunkRow, "vector_score" | "text_score">): number {
  const normalizedText = Math.min(row.text_score / TEXT_SCORE_NORMALIZER, 1);
  return row.vector_score * 0.7 + normalizedText * 0.3;
}

function toResult(row: KnowledgeChunkRow, score: number): RetrievedKnowledgeChunk {
  return {
    title: row.title,
    content: row.content,
    category: row.category,
    source: row.source_type,
    sourceUrl: row.source_url,
    score,
  };
}

export async function retrieveDanteKnowledge(
  supabase: KnowledgeBrainSupabaseClient,
  params: RetrieveDanteKnowledgeParams,
): Promise<RetrievedKnowledgeChunk[]> {
  const query = params.query.trim();
  const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT));

  if (query.length === 0) {
    return [];
  }

  const startedAt = Date.now();

  console.log("[DANTE_RAG_QUERY]", {
    category: params.categories?.join(",") ?? "any",
    hasUser: Boolean(params.userId),
  });

  try {
    const embedding = await embedText(query);

    const { data, error } = await supabase.rpc("match_dante_knowledge_chunks", {
      query_embedding: embedding,
      query_text: query,
      match_categories: params.categories && params.categories.length > 0 ? params.categories : null,
      match_count: INTERNAL_CANDIDATE_LIMIT,
    });

    if (error) {
      console.warn("[DANTE_RAG_FALLBACK]", { reason: "rpc_error", message: error.message });
      return [];
    }

    const rows = data ?? [];

    // Dedupe: keep only the strongest-scoring chunks per document, up
    // to MAX_CHUNKS_PER_DOCUMENT, so one long document can't crowd out
    // every other source in a small final result set.
    const scored = rows
      .map((row) => ({ row, score: combinedScore(row) }))
      .filter(({ score }) => score >= RELEVANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const seenContentHashes = new Set<string>();
    const perDocumentCount = new Map<string, number>();
    const finalResults: RetrievedKnowledgeChunk[] = [];

    for (const { row, score } of scored) {
      if (finalResults.length >= limit) break;

      const dedupeKey = `${row.document_id}:${row.chunk_index}`;
      if (seenContentHashes.has(dedupeKey)) continue;

      const countForDocument = perDocumentCount.get(row.document_id) ?? 0;
      if (countForDocument >= MAX_CHUNKS_PER_DOCUMENT) continue;

      seenContentHashes.add(dedupeKey);
      perDocumentCount.set(row.document_id, countForDocument + 1);
      finalResults.push(toResult(row, score));
    }

    console.log("[DANTE_RAG_RESULTS]", {
      category: params.categories?.join(",") ?? "any",
      candidateCount: rows.length,
      resultCount: finalResults.length,
      embeddingUsed: embedding !== null,
      embeddingModel: getEmbeddingConfig()?.model ?? "none",
      latencyMs: Date.now() - startedAt,
    });

    return finalResults;
  } catch (error) {
    console.warn("[DANTE_RAG_FALLBACK]", {
      reason: "threw",
      message: error instanceof Error ? error.message : "unknown error",
    });
    return [];
  }
}
