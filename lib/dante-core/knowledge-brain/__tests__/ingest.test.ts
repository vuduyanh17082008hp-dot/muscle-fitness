import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dante-core/knowledge-brain/embedding-provider", () => ({
  embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
}));

import { embedBatch } from "@/lib/dante-core/knowledge-brain/embedding-provider";
import { ingestDocument, parseFrontMatter, type IngestSupabaseClient } from "@/scripts/ingest-dante-knowledge";

type StoredRow = {
  id: string;
  document_id: string;
  chunk_index: number;
  content_hash: string;
  [key: string]: unknown;
};

function createFakeIngestClient(): IngestSupabaseClient & { rows: () => StoredRow[] } {
  let rows: StoredRow[] = [];
  let nextId = 0;

  const client: IngestSupabaseClient & { rows: () => StoredRow[] } = {
    rows: () => rows,
    from() {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                async returns<T>() {
                  return {
                    data: rows.filter((r) => r.document_id === value) as unknown as T,
                    error: null,
                  };
                },
              };
            },
          };
        },
        async upsert(newRows: unknown[]) {
          for (const nr of newRows as Array<Record<string, unknown>>) {
            const idx = rows.findIndex(
              (r) => r.document_id === nr.document_id && r.chunk_index === nr.chunk_index,
            );
            if (idx >= 0) {
              rows[idx] = { ...rows[idx], ...nr } as StoredRow;
            } else {
              rows.push({ ...nr, id: `id-${nextId++}` } as StoredRow);
            }
          }
          return { error: null };
        },
        delete() {
          return {
            eq(_column: string, value: string) {
              return {
                async in(_column2: string, indices: number[]) {
                  rows = rows.filter((r) => !(r.document_id === value && indices.includes(r.chunk_index)));
                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return client;
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "dante-knowledge-test-"));
  vi.mocked(embedBatch).mockClear();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeDoc(content: string): string {
  const filePath = path.join(tempDir, "doc.md");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

const DOC_V1 = `---
title: Test document
category: training
source_type: research-summary
---

## Section one

${"Paragraph about training volume. ".repeat(50)}

## Section two

${"Paragraph about recovery timing. ".repeat(50)}
`;

describe("parseFrontMatter", () => {
  it("parses required fields and rejects an invalid category", () => {
    const { meta, body } = parseFrontMatter(DOC_V1);
    expect(meta.title).toBe("Test document");
    expect(meta.category).toBe("training");
    expect(body).toContain("Section one");

    expect(() => parseFrontMatter(DOC_V1.replace("category: training", "category: nonsense"))).toThrow();
  });
});

describe("ingestDocument (tests F & G: idempotent ingestion)", () => {
  it("re-ingesting an unchanged document embeds nothing and creates no duplicate rows (test F)", async () => {
    const client = createFakeIngestClient();
    const filePath = writeDoc(DOC_V1);

    const first = await ingestDocument(client, "doc.md", filePath);
    expect(first.embedded).toBeGreaterThan(0);
    const rowCountAfterFirst = client.rows().length;

    vi.mocked(embedBatch).mockClear();

    const second = await ingestDocument(client, "doc.md", filePath);

    expect(second.embedded).toBe(0);
    expect(second.skipped).toBe(rowCountAfterFirst);
    expect(embedBatch).not.toHaveBeenCalled();
    expect(client.rows().length).toBe(rowCountAfterFirst);
  });

  it("only re-embeds the chunk that actually changed, and updates it in place (test G)", async () => {
    const client = createFakeIngestClient();
    const filePath = writeDoc(DOC_V1);
    await ingestDocument(client, "doc.md", filePath);

    const rowCountBefore = client.rows().length;
    const originalContentHashes = client.rows().map((r) => r.content_hash);

    const DOC_V2 = DOC_V1.replace(
      "Paragraph about recovery timing. ".repeat(50),
      "Paragraph about recovery timing, HEAVILY REVISED CONTENT. ".repeat(50),
    );
    writeFileSync(filePath, DOC_V2, "utf-8");

    vi.mocked(embedBatch).mockClear();
    const result = await ingestDocument(client, "doc.md", filePath);

    // Not a full re-embed of every chunk — only the changed one(s).
    expect(result.embedded).toBeGreaterThan(0);
    expect(result.embedded).toBeLessThan(rowCountBefore + 1);
    expect(client.rows().length).toBe(rowCountBefore);

    const newContentHashes = client.rows().map((r) => r.content_hash);
    expect(newContentHashes).not.toEqual(originalContentHashes);
  });

  it("prunes trailing chunks when the document shrinks, instead of leaving stale rows", async () => {
    const client = createFakeIngestClient();
    const filePath = writeDoc(DOC_V1);
    await ingestDocument(client, "doc.md", filePath);
    const rowCountBefore = client.rows().length;
    expect(rowCountBefore).toBeGreaterThan(1);

    const SHORT_DOC = `---
title: Test document
category: training
source_type: research-summary
---

## Section one

A single short paragraph now.
`;
    writeFileSync(filePath, SHORT_DOC, "utf-8");

    const result = await ingestDocument(client, "doc.md", filePath);

    expect(result.pruned).toBeGreaterThan(0);
    expect(client.rows().length).toBeLessThan(rowCountBefore);
  });
});
