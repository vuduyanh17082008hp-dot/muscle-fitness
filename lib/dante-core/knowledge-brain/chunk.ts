import { createHash } from "node:crypto";

/**
 * Normalization, chunking and hashing for the ingestion pipeline
 * (spec §4). Pure functions, no I/O — kept separate from
 * scripts/ingest-dante-knowledge.ts so they're unit-testable without
 * touching Supabase or the filesystem.
 */

const MIN_CHUNK_CHARS = 400 * 3; // ~400 tokens, ~3 chars/token heuristic
const MAX_CHUNK_CHARS = 800 * 4; // ~800 tokens, generous upper bound
const OVERLAP_CHARS = 200;

export function normalizeMarkdown(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type RawSection = {
  heading: string | null;
  body: string;
};

/** Splits normalized markdown into sections at each heading line. */
function splitByHeadings(text: string): RawSection[] {
  const lines = text.split("\n");
  const sections: RawSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (body.length > 0) {
      sections.push({ heading: currentHeading, body });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = /^#{1,6}\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

export type SemanticChunk = {
  index: number;
  heading: string | null;
  content: string;
};

/**
 * Heading/paragraph-aware chunking, targeting ~400-800 tokens per
 * chunk (approximated in characters — no tokenizer dependency).
 * A section under a single heading is split at paragraph boundaries
 * when it exceeds MAX_CHUNK_CHARS, with a small trailing-paragraph
 * overlap carried into the next chunk so a fact split across a
 * paragraph boundary isn't lost. A short section is never padded —
 * small overlap is used only where useful, not injected everywhere.
 */
export function chunkDocument(rawMarkdown: string): SemanticChunk[] {
  const normalized = normalizeMarkdown(rawMarkdown);
  const sections = splitByHeadings(normalized);
  const chunks: SemanticChunk[] = [];

  for (const section of sections) {
    const paragraphs = section.body.split(/\n\n+/).filter((p) => p.trim().length > 0);
    let buffer = "";

    const pushBuffer = () => {
      const content = buffer.trim();
      if (content.length > 0) {
        chunks.push({ index: chunks.length, heading: section.heading, content });
      }
      buffer = "";
    };

    for (const paragraph of paragraphs) {
      const candidate = buffer.length > 0 ? `${buffer}\n\n${paragraph}` : paragraph;

      if (candidate.length <= MAX_CHUNK_CHARS || buffer.length === 0) {
        buffer = candidate;
        continue;
      }

      // Buffer is already a healthy size — flush it, then start the
      // next chunk with a small tail overlap from what just closed.
      const overlap =
        buffer.length > OVERLAP_CHARS ? buffer.slice(-OVERLAP_CHARS) : buffer;
      pushBuffer();
      buffer = `${overlap}\n\n${paragraph}`;
    }

    pushBuffer();
  }

  // Merge adjacent tiny chunks (e.g. a short heading section) up to
  // MAX_CHUNK_CHARS so we don't emit a flood of sub-400-char chunks.
  const merged: SemanticChunk[] = [];
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.content.length < MIN_CHUNK_CHARS &&
      previous.content.length + chunk.content.length <= MAX_CHUNK_CHARS
    ) {
      previous.content = `${previous.content}\n\n${chunk.content}`;
      continue;
    }
    merged.push({ ...chunk });
  }

  return merged.map((chunk, index) => ({ ...chunk, index }));
}

export function hashChunkContent(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex");
}
