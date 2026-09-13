# Dante Knowledge Brain — source documents

This folder holds the approved Markdown source documents for the Dante
Knowledge Brain: reusable, unstructured reference knowledge (training
science, technique, evidence summaries) that gets chunked, embedded, and
stored in Supabase/pgvector (`public.dante_knowledge_chunks`) for
retrieval-augmented answers in `app/api/chatbot/route.ts`.

This is **not** where any user's own data lives. AthleteState, DanteMemory,
Today's Plan and the Adaptive Program Engine remain the sole sources of
truth for a specific user's workouts, macros, and recovery — nothing here
is per-user, and nothing here is written by Dante on its own.

## Format

Each document is a single Markdown file with a YAML front-matter header:

```markdown
---
title: Weekly training volume and hypertrophy
category: training
source_type: research-summary
source_url:
---

## Dose-response relationship

Higher weekly training volume is associated with greater hypertrophy up to
a point...
```

Front matter fields:

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Short, human-readable title for the whole document. |
| `category` | yes | One of: `training`, `nutrition`, `recovery`, `exercise_technique`, `supplements`, `safety`, `general`. |
| `source_type` | no | e.g. `research-summary`, `guideline`, `internal`. Defaults to `manual`. |
| `source_url` | no | A real, checkable URL if one exists. Leave blank rather than guessing. |

Body content is normal Markdown. Use `##`/`###` headings — the ingestion
pipeline chunks heading-by-heading (then paragraph-by-paragraph within an
oversized section), so headings should mark genuinely separable ideas.
Target roughly 400–800 tokens of body content per heading section; a
much longer section will be auto-split into multiple chunks with a small
trailing overlap.

## Trusted sources

Only add a document here if you can name the actual source (a real paper,
a position stand, a consensus statement). Do not write filler or invented
"general knowledge" content just to populate the store — an empty category
is better than a fabricated one. If a document summarizes research, its
`source_url` should point at the real publication (or be left blank if you
can't verify an exact link — title + the body text is enough for a human
to check).

Never put here:

- `.env` files, API keys, tokens, or anything from `.env.local`
- raw database dumps or exports
- raw chat transcripts or per-user logs
- source code (this is a knowledge base, not a code index)

## Ingestion command

```bash
npm run dante:ingest-knowledge
```

Requires `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
`SUPABASE_SECRET_KEY` (service-role key — never exposed with a
`NEXT_PUBLIC_` prefix) in the environment. An embedding provider
(`DANTE_EMBEDDING_API_KEY` and friends, see below) is optional: without
one, chunks are still stored with `embedding = null` and retrieval falls
back to full-text search for them until they're re-ingested later.

Ingestion is idempotent: unchanged chunks (by content hash) are never
re-embedded, a changed chunk is updated in place, and chunks removed from
a shrinking document are pruned rather than left behind. Running the
command twice on the same files is a no-op.

## Embedding provider configuration

Set in `.env.local` (server-only — never `NEXT_PUBLIC_`):

```
DANTE_EMBEDDING_API_KEY=...
DANTE_EMBEDDING_BASE_URL=https://api.openai.com/v1   # optional, this is the default
DANTE_EMBEDDING_MODEL=text-embedding-3-small          # optional, this is the default
DANTE_EMBEDDING_DIMENSIONS=1536                       # optional, must match the migration's vector(1536) column
```

`DANTE_EMBEDDING_BASE_URL` accepts any endpoint that implements the
OpenAI-compatible `POST {baseUrl}/embeddings` shape. If
`DANTE_EMBEDDING_API_KEY` is unset, the Knowledge Brain degrades
gracefully: retrieval falls back to full-text search only, and if that
also finds nothing, Dante answers without a "Retrieved knowledge" section
— the rest of Dante (AthleteState, Adaptive Engine, DanteMemory, live
PubMed/MedlinePlus/USDA evidence) is entirely unaffected.
