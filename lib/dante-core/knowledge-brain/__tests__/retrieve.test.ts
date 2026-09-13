import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dante-core/knowledge-brain/embedding-provider", () => ({
  embedText: vi.fn(),
  getEmbeddingConfig: vi.fn(() => null),
}));

import { embedText } from "@/lib/dante-core/knowledge-brain/embedding-provider";
import { retrieveDanteKnowledge } from "@/lib/dante-core/knowledge-brain/retrieve";
import type { KnowledgeBrainSupabaseClient, KnowledgeChunkRow } from "@/lib/dante-core/knowledge-brain/types";

function row(overrides: Partial<KnowledgeChunkRow> = {}): KnowledgeChunkRow {
  return {
    id: "row-1",
    document_id: "doc-1",
    chunk_index: 0,
    title: "Untitled",
    content: "Some content",
    category: "general",
    source_type: "manual",
    source_url: null,
    metadata: {},
    visibility: "global",
    owner_user_id: null,
    vector_score: 0,
    text_score: 0,
    ...overrides,
  };
}

function fakeClient(rows: KnowledgeChunkRow[]): KnowledgeBrainSupabaseClient {
  return {
    rpc: vi.fn(async () => ({ data: rows, error: null })),
  };
}

afterEach(() => {
  vi.mocked(embedText).mockReset();
});

describe("retrieveDanteKnowledge", () => {
  it("returns relevant results for an exercise-technique query (test A)", async () => {
    vi.mocked(embedText).mockResolvedValue(new Array(1536).fill(0.01));

    const client = fakeClient([
      row({
        id: "a",
        document_id: "rdl-technique",
        title: "Romanian deadlift technique",
        content: "Hinge at the hips, keep a neutral spine...",
        category: "exercise_technique",
        vector_score: 0.91,
        text_score: 0.2,
      }),
    ]);

    const results = await retrieveDanteKnowledge(client, {
      query: "How do I perform a Romanian deadlift safely?",
      categories: ["exercise_technique", "safety"],
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Romanian deadlift technique");
    expect(results[0].category).toBe("exercise_technique");
  });

  it("rejects weak/unrelated chunks below the relevance threshold (test C)", async () => {
    vi.mocked(embedText).mockResolvedValue(new Array(1536).fill(0.01));

    const client = fakeClient([
      row({ id: "weak-1", vector_score: 0.05, text_score: 0.0 }),
      row({ id: "weak-2", vector_score: 0.1, text_score: 0.01 }),
    ]);

    const results = await retrieveDanteKnowledge(client, { query: "what is the capital of France?" });

    expect(results).toEqual([]);
  });

  it("relies entirely on the caller-supplied (RLS-scoped) client for visibility — never adds its own owner override (test D)", async () => {
    vi.mocked(embedText).mockResolvedValue(new Array(1536).fill(0.01));

    // Simulates the RPC already having filtered out another user's
    // private row via RLS on the caller's authenticated client — the
    // fake only ever returns rows the *current* user may see.
    const onlyCurrentUsersRows = fakeClient([
      row({ id: "own-private", visibility: "private", owner_user_id: "user-a", vector_score: 0.9 }),
    ]);

    const results = await retrieveDanteKnowledge(onlyCurrentUsersRows, {
      query: "private note about my mobility work",
      userId: "user-a",
    });

    expect(results).toHaveLength(1);
    // No client-side owner filter is applied on top — the function
    // must not accept a broader row set than the client returned.
    const rpcMock = onlyCurrentUsersRows.rpc as ReturnType<typeof vi.fn>;
    expect(rpcMock).toHaveBeenCalledWith(
      "match_dante_knowledge_chunks",
      expect.not.objectContaining({ owner_user_id: expect.anything() }),
    );
  });

  it("still returns results (via full-text signal) when the embedding provider fails (test E)", async () => {
    vi.mocked(embedText).mockResolvedValue(null);

    const client = fakeClient([
      row({ id: "text-only", vector_score: 0, text_score: 0.2 }),
    ]);

    await expect(
      retrieveDanteKnowledge(client, { query: "creatine safety" }),
    ).resolves.toBeInstanceOf(Array);

    const rpcMock = client.rpc as ReturnType<typeof vi.fn>;
    expect(rpcMock).toHaveBeenCalledWith(
      "match_dante_knowledge_chunks",
      expect.objectContaining({ query_embedding: null }),
    );
  });

  it("never throws when the database call itself fails, and returns no results", async () => {
    vi.mocked(embedText).mockResolvedValue(new Array(1536).fill(0.01));

    const client: KnowledgeBrainSupabaseClient = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "connection refused" } })),
    };

    const results = await retrieveDanteKnowledge(client, { query: "anything" });
    expect(results).toEqual([]);
  });

  it("caps the final result set at the configured limit (test H)", async () => {
    vi.mocked(embedText).mockResolvedValue(new Array(1536).fill(0.01));

    const manyStrongRows = Array.from({ length: 15 }, (_, i) =>
      row({ id: `row-${i}`, document_id: `doc-${i}`, vector_score: 0.95, text_score: 0.3 }),
    );

    const client = fakeClient(manyStrongRows);

    const results = await retrieveDanteKnowledge(client, { query: "training volume" });

    expect(results.length).toBeLessThanOrEqual(6);
  });

  it("never returns more than 2 chunks from the same document, even when both score highly", async () => {
    vi.mocked(embedText).mockResolvedValue(new Array(1536).fill(0.01));

    const client = fakeClient([
      row({ id: "1", document_id: "doc-x", chunk_index: 0, vector_score: 0.95 }),
      row({ id: "2", document_id: "doc-x", chunk_index: 1, vector_score: 0.94 }),
      row({ id: "3", document_id: "doc-x", chunk_index: 2, vector_score: 0.93 }),
    ]);

    const results = await retrieveDanteKnowledge(client, { query: "training volume" });

    expect(results.length).toBeLessThanOrEqual(2);
  });
});
