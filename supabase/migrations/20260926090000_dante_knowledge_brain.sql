-- =========================================================
-- MUSCLE FITNESS
-- DANTE KNOWLEDGE BRAIN — reusable unstructured knowledge (pgvector)
--
-- This is deliberately NOT where any user's structured state lives.
-- AthleteState, DanteMemory, Today's Plan and the Adaptive Program
-- Engine (all computed from relational tables elsewhere) remain the
-- sole sources of truth for anything about a specific user's body,
-- workouts, macros or recovery. This table only ever holds reusable,
-- approved reference knowledge (how a lift is performed, what the
-- literature says about a topic) — never a per-user fact, and never
-- something Dante can silently write to on its own.
--
-- Two visibility tiers:
--   - 'global'  approved knowledge any authenticated user may read.
--     Only writable by the service_role key (see
--     scripts/ingest-dante-knowledge.ts) — no policy below grants
--     authenticated users insert/update/delete on global rows, so
--     normal users cannot create or tamper with trusted knowledge.
--   - 'private' knowledge scoped to a single owner_user_id, readable
--     and writable only by that user.
-- =========================================================

create extension if not exists vector;

create table if not exists
public.dante_knowledge_chunks
(
    id uuid primary key default gen_random_uuid(),

    -- Stable identifier for the source document (e.g. a file path
    -- under docs/dante-knowledge/), shared by every chunk of that
    -- document. Not a foreign key — the source is a file, not a row.
    document_id text not null,
    chunk_index integer not null,

    title text not null,
    content text not null,

    category text not null,
    source_type text not null default 'manual',
    source_url text,

    metadata jsonb not null default '{}'::jsonb,

    visibility text not null default 'global',
    owner_user_id uuid
        references auth.users(id)
        on delete cascade,

    -- sha256 of the normalized chunk content, so re-ingesting an
    -- unchanged document is a no-op and a changed chunk is detected
    -- without re-embedding the whole document.
    content_hash text not null,

    -- Dimension chosen to match the default embedding provider
    -- (see lib/dante-core/knowledge-brain/embedding-provider.ts,
    -- DANTE_EMBEDDING_DIMENSIONS). Null when a chunk was ingested
    -- before an embedding provider was configured — retrieval falls
    -- back to full-text search for those rows.
    embedding vector(1536),

    content_tsv tsvector
        generated always as
        (
            to_tsvector(
                'english',
                coalesce(title, '') || ' ' || coalesce(content, '')
            )
        ) stored,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint
        dante_knowledge_chunks_category_check
    check
    (
        category in
        (
            'training',
            'nutrition',
            'recovery',
            'exercise_technique',
            'supplements',
            'safety',
            'general'
        )
    ),

    constraint
        dante_knowledge_chunks_visibility_check
    check
    (
        visibility in ('global', 'private')
    ),

    -- Private chunks must always name an owner; global chunks never
    -- do — this is what makes the RLS policies below sufficient.
    constraint
        dante_knowledge_chunks_owner_matches_visibility
    check
    (
        (visibility = 'global' and owner_user_id is null)
        or
        (visibility = 'private' and owner_user_id is not null)
    ),

    constraint
        dante_knowledge_chunks_document_chunk_unique
    unique (document_id, chunk_index)
);

create index if not exists
    dante_knowledge_chunks_embedding_idx
on public.dante_knowledge_chunks
using hnsw (embedding vector_cosine_ops);

create index if not exists
    dante_knowledge_chunks_tsv_idx
on public.dante_knowledge_chunks
using gin (content_tsv);

create index if not exists
    dante_knowledge_chunks_category_idx
on public.dante_knowledge_chunks (category);

create index if not exists
    dante_knowledge_chunks_owner_idx
on public.dante_knowledge_chunks (owner_user_id)
where owner_user_id is not null;

create index if not exists
    dante_knowledge_chunks_document_idx
on public.dante_knowledge_chunks (document_id);

alter table
public.dante_knowledge_chunks
enable row level security;

-- ---------------------------------------------------------
-- SELECT: any authenticated user may read global knowledge;
-- private knowledge is visible only to its owner.
-- ---------------------------------------------------------
drop policy if exists
"dante_knowledge_chunks_select"
on public.dante_knowledge_chunks;

create policy
"dante_knowledge_chunks_select"
on public.dante_knowledge_chunks
for select
to authenticated
using
(
    visibility = 'global'
    or auth.uid() = owner_user_id
);

-- ---------------------------------------------------------
-- INSERT/UPDATE/DELETE: intentionally scoped to 'private' rows
-- the caller owns. There is no policy allowing authenticated
-- users to write 'global' rows at all — those are only ever
-- written by the ingestion script using the service_role key,
-- which bypasses RLS entirely. This is what "normal users cannot
-- write trusted global knowledge" means concretely here.
-- ---------------------------------------------------------
drop policy if exists
"dante_knowledge_chunks_insert_own_private"
on public.dante_knowledge_chunks;

create policy
"dante_knowledge_chunks_insert_own_private"
on public.dante_knowledge_chunks
for insert
to authenticated
with check
(
    visibility = 'private'
    and owner_user_id = auth.uid()
);

drop policy if exists
"dante_knowledge_chunks_update_own_private"
on public.dante_knowledge_chunks;

create policy
"dante_knowledge_chunks_update_own_private"
on public.dante_knowledge_chunks
for update
to authenticated
using
(
    visibility = 'private'
    and owner_user_id = auth.uid()
)
with check
(
    visibility = 'private'
    and owner_user_id = auth.uid()
);

drop policy if exists
"dante_knowledge_chunks_delete_own_private"
on public.dante_knowledge_chunks;

create policy
"dante_knowledge_chunks_delete_own_private"
on public.dante_knowledge_chunks
for delete
to authenticated
using
(
    visibility = 'private'
    and owner_user_id = auth.uid()
);

-- ---------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------
create or replace function
public.dante_knowledge_chunks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists
dante_knowledge_chunks_set_updated_at
on public.dante_knowledge_chunks;

create trigger
dante_knowledge_chunks_set_updated_at
before update on public.dante_knowledge_chunks
for each row
execute function public.dante_knowledge_chunks_set_updated_at();

-- ---------------------------------------------------------
-- HYBRID RETRIEVAL RPC
--
-- Deliberately SECURITY INVOKER (the default — not redeclared as
-- SECURITY DEFINER), so the same RLS policies above apply inside
-- this function: called with the requesting user's session, a
-- user only ever gets global rows plus their own private rows back,
-- exactly as a direct SELECT would enforce. This is the mechanism
-- that keeps private knowledge from crossing between users even
-- though retrieval goes through one shared RPC.
--
-- query_embedding may be null (embedding provider unavailable or
-- not configured) — in that case scoring falls back to full-text
-- search alone rather than failing.
-- ---------------------------------------------------------
create or replace function
public.match_dante_knowledge_chunks(
    query_embedding vector(1536),
    query_text text,
    match_categories text[] default null,
    match_count int default 20
)
returns table
(
    id uuid,
    document_id text,
    chunk_index int,
    title text,
    content text,
    category text,
    source_type text,
    source_url text,
    metadata jsonb,
    visibility text,
    owner_user_id uuid,
    vector_score float8,
    text_score float8
)
language sql
stable
as $$
    select
        c.id,
        c.document_id,
        c.chunk_index,
        c.title,
        c.content,
        c.category,
        c.source_type,
        c.source_url,
        c.metadata,
        c.visibility,
        c.owner_user_id,
        case
            when query_embedding is null or c.embedding is null then 0
            else 1 - (c.embedding <=> query_embedding)
        end as vector_score,
        case
            when query_text is null or btrim(query_text) = '' then 0
            else ts_rank(c.content_tsv, plainto_tsquery('english', query_text))
        end as text_score
    from public.dante_knowledge_chunks c
    where
        (match_categories is null or c.category = any(match_categories))
        and
        (
            (query_embedding is not null and c.embedding is not null)
            or
            (
                query_text is not null
                and btrim(query_text) <> ''
                and c.content_tsv @@ plainto_tsquery('english', query_text)
            )
        )
    order by
        (
            case
                when query_embedding is not null and c.embedding is not null
                then (1 - (c.embedding <=> query_embedding))
                else 0
            end
        ) * 0.7
        +
        (
            case
                when query_text is not null and btrim(query_text) <> ''
                then ts_rank(c.content_tsv, plainto_tsquery('english', query_text))
                else 0
            end
        ) * 0.3
        desc
    limit greatest(match_count, 1);
$$;

grant execute on function
public.match_dante_knowledge_chunks(vector, text, text[], int)
to authenticated;
