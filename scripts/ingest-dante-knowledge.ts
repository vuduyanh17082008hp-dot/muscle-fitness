/**
 * Dante Knowledge Brain ingestion pipeline (spec §4).
 *
 * document (docs/dante-knowledge/**\/*.md)
 *   -> normalize
 *   -> heading/paragraph-aware semantic chunk
 *   -> hash each chunk
 *   -> embed only new/changed chunks
 *   -> upsert (idempotent: unchanged chunks are never re-embedded,
 *      changed chunks are updated in place, removed chunks are
 *      pruned so a shrinking document can't leave stale rows behind)
 *
 * Run with:
 *   npm run dante:ingest-knowledge
 *
 * Requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
 * SUPABASE_SECRET_KEY in the environment (see .env.local) — this
 * script uses the service-role key because writing 'global' rows is
 * intentionally not something any RLS policy grants to normal users.
 * An embedding provider (DANTE_EMBEDDING_API_KEY) is optional: chunks
 * still ingest without one, just with embedding = null (retrieval
 * falls back to full-text search for those rows until re-ingested
 * once a provider is configured).
 *
 * See docs/dante-knowledge/README.md for the document format.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { createKnowledgeBrainAdminClient } from "@/lib/dante-core/knowledge-brain/supabase-admin";
import { embedBatch } from "@/lib/dante-core/knowledge-brain/embedding-provider";
import { chunkDocument, hashChunkContent, normalizeMarkdown } from "@/lib/dante-core/knowledge-brain/chunk";
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from "@/lib/dante-core/knowledge-brain/types";

const KNOWLEDGE_DIR = path.resolve(process.cwd(), "docs/dante-knowledge");

type FrontMatter = {
  title: string;
  category: KnowledgeCategory;
  source_type: string;
  source_url: string | null;
};

export function parseFrontMatter(raw: string): { meta: FrontMatter; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);

  if (!match) {
    throw new Error("Missing YAML front matter (expected a leading --- ... --- block).");
  }

  const [, frontMatterBlock, body] = match;
  const fields: Record<string, string> = {};

  for (const line of frontMatterBlock.split("\n")) {
    const fieldMatch = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (!fieldMatch) continue;
    const [, key, valueRaw] = fieldMatch;
    fields[key] = valueRaw.trim().replace(/^["']|["']$/g, "");
  }

  if (!fields.title) throw new Error("Front matter is missing required field: title");
  if (!fields.category) throw new Error("Front matter is missing required field: category");

  if (!KNOWLEDGE_CATEGORIES.includes(fields.category as KnowledgeCategory)) {
    throw new Error(
      `Invalid category "${fields.category}". Must be one of: ${KNOWLEDGE_CATEGORIES.join(", ")}`,
    );
  }

  return {
    meta: {
      title: fields.title,
      category: fields.category as KnowledgeCategory,
      source_type: fields.source_type || "manual",
      source_url: fields.source_url || null,
    },
    body,
  };
}

export function findMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md") && entry.toUpperCase() !== "README.MD") {
      files.push(fullPath);
    }
  }

  return files;
}

// Never ingest anything that looks like a secret, a DB dump, raw
// chat/user logs, or source code — this is a documented list of what
// belongs in docs/dante-knowledge, not a security boundary by itself.
const FORBIDDEN_NAME_PATTERNS = [/\.env/i, /secret/i, /api[-_]?key/i, /dump/i, /\.sql$/i, /\.log$/i];

function assertSafeToIngest(filePath: string) {
  const base = path.basename(filePath);
  for (const pattern of FORBIDDEN_NAME_PATTERNS) {
    if (pattern.test(base)) {
      throw new Error(`Refusing to ingest "${base}" — matches forbidden pattern ${pattern}.`);
    }
  }
}

type ExistingRow = { id: string; chunk_index: number; content_hash: string };

/** Minimal shape of the Supabase surface ingestDocument() needs — kept
 * narrow so tests can pass an in-memory fake instead of a real client. */
export type IngestSupabaseClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        returns<T>(): Promise<{ data: T | null; error: { message: string } | null }>;
      };
    };
    upsert(
      rows: unknown[],
      options: { onConflict: string },
    ): Promise<{ error: { message: string } | null }>;
    delete(): {
      eq(
        column: string,
        value: string,
      ): { in(column: string, values: number[]): Promise<{ error: { message: string } | null }> };
    };
  };
};

export async function ingestDocument(
  supabase: IngestSupabaseClient,
  documentId: string,
  filePath: string,
) {
  assertSafeToIngest(filePath);

  const raw = readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontMatter(raw);
  const normalizedBody = normalizeMarkdown(body);

  if (normalizedBody.length === 0) {
    console.warn(`  skip (empty body): ${documentId}`);
    return { embedded: 0, skipped: 0, pruned: 0 };
  }

  const chunks = chunkDocument(normalizedBody);
  const hashes = chunks.map((chunk) => hashChunkContent(chunk.content));

  const { data: existingRows, error: fetchError } = await supabase
    .from("dante_knowledge_chunks")
    .select("id, chunk_index, content_hash")
    .eq("document_id", documentId)
    .returns<ExistingRow[]>();

  if (fetchError) {
    throw new Error(`Failed to load existing chunks for ${documentId}: ${fetchError.message}`);
  }

  const existingByIndex = new Map((existingRows ?? []).map((row) => [row.chunk_index, row]));

  const toEmbed: { index: number; content: string }[] = [];
  let skipped = 0;

  chunks.forEach((chunk, index) => {
    const existing = existingByIndex.get(index);
    if (existing && existing.content_hash === hashes[index]) {
      skipped += 1;
    } else {
      toEmbed.push({ index, content: chunk.content });
    }
  });

  const embeddings =
    toEmbed.length > 0 ? await embedBatch(toEmbed.map((c) => c.content)) : [];

  if (toEmbed.length > 0 && embeddings === null) {
    console.warn(
      `  embedding provider unavailable — upserting ${toEmbed.length} chunk(s) of ${documentId} ` +
        "with no embedding (full-text search only until re-ingested).",
    );
  }

  const rows = toEmbed.map((entry, i) => ({
    document_id: documentId,
    chunk_index: entry.index,
    title:
      chunks[entry.index].heading != null
        ? `${meta.title} — ${chunks[entry.index].heading}`
        : meta.title,
    content: entry.content,
    category: meta.category,
    source_type: meta.source_type,
    source_url: meta.source_url,
    metadata: { chunkCount: chunks.length },
    visibility: "global" as const,
    owner_user_id: null,
    content_hash: hashes[entry.index],
    embedding: embeddings ? (embeddings[i] ?? null) : null,
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("dante_knowledge_chunks")
      .upsert(rows, { onConflict: "document_id,chunk_index" });

    if (upsertError) {
      throw new Error(`Failed to upsert chunks for ${documentId}: ${upsertError.message}`);
    }
  }

  // Prune trailing chunks left over from a previous, longer version of
  // this document — otherwise a shrinking doc leaves stale rows behind
  // forever (the "no duplicate explosion" requirement).
  const staleIndices = (existingRows ?? [])
    .map((row) => row.chunk_index)
    .filter((index) => index >= chunks.length);

  if (staleIndices.length > 0) {
    const { error: deleteError } = await supabase
      .from("dante_knowledge_chunks")
      .delete()
      .eq("document_id", documentId)
      .in("chunk_index", staleIndices);

    if (deleteError) {
      throw new Error(`Failed to prune stale chunks for ${documentId}: ${deleteError.message}`);
    }
  }

  console.log(
    `  ${documentId}: ${rows.length} chunk(s) written, ${skipped} unchanged, ${staleIndices.length} pruned`,
  );

  return { embedded: rows.length, skipped, pruned: staleIndices.length };
}

async function main() {
  // The real SupabaseClient's generic query-builder types are far
  // more elaborate than the narrow IngestSupabaseClient surface
  // ingestDocument() actually calls (select/eq/returns, upsert,
  // delete/eq/in) — asserting once here at the boundary keeps that
  // interface simple and easily fakeable in tests, instead of fighting
  // structural assignability against Supabase's full generic types.
  const supabase = createKnowledgeBrainAdminClient() as unknown as IngestSupabaseClient;
  const files = findMarkdownFiles(KNOWLEDGE_DIR);

  if (files.length === 0) {
    console.log(`No markdown documents found under ${KNOWLEDGE_DIR}`);
    return;
  }

  console.log(`Ingesting ${files.length} document(s) from ${KNOWLEDGE_DIR}\n`);

  let totalEmbedded = 0;
  let totalSkipped = 0;
  let totalPruned = 0;
  let failures = 0;

  for (const filePath of files) {
    const documentId = path.relative(KNOWLEDGE_DIR, filePath).split(path.sep).join("/");

    try {
      const result = await ingestDocument(supabase, documentId, filePath);
      totalEmbedded += result.embedded;
      totalSkipped += result.skipped;
      totalPruned += result.pruned;
    } catch (error) {
      failures += 1;
      console.error(`  FAILED ${documentId}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(
    `\nDone. ${totalEmbedded} chunk(s) written, ${totalSkipped} unchanged, ${totalPruned} pruned, ${failures} document(s) failed.`,
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

// Guarded so importing this module's exported helpers in tests never
// triggers a real ingestion run against a live Supabase project.
if (!process.env.VITEST) {
  main().catch((error) => {
    console.error("[INGEST DANTE KNOWLEDGE] fatal error", error);
    process.exitCode = 1;
  });
}
