-- =========================================================
-- MUSCLE FITNESS
-- DANTE ADAPTIVE INTELLIGENCE — memory hierarchy, autonomy audit
--
-- Additive only. Nothing here drops, renames, or changes the type of
-- an existing column; every ALTER TABLE below only ADDS a new,
-- nullable-or-defaulted column so existing inserts keep working
-- unchanged. Reuses the existing dante_memory / dante_action_log
-- tables rather than creating parallel ones — see
-- lib/dante-core/memory-hierarchy/ and lib/dante-core/autonomy/.
--
-- L0 (raw events) reuses the existing public.app_events table —
-- nothing added here for it.
--
-- Review before applying to any shared/production database. Not
-- auto-applied by this migration file's presence alone.
-- =========================================================

-- ---------------------------------------------------------
-- L1 OBSERVATIONS
-- ---------------------------------------------------------

create table if not exists
public.dante_observations
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    context_key text
        not null,

    intervention_type text
        not null,

    before_state jsonb
        not null
        default '{}'::jsonb,

    after_state jsonb
        not null
        default '{}'::jsonb,

    outcome text
        not null
        check
        (
            outcome in ('improved', 'maintained', 'worsened', 'unknown')
        ),

    goal_aligned boolean,

    -- Which deterministic engine/skill produced this observation —
    -- never "llm".
    provenance text
        not null,

    observed_at timestamptz
        not null
        default now()
);

create index if not exists
dante_observations_user_context_idx
on public.dante_observations
(user_id, context_key, intervention_type, observed_at desc);

alter table
public.dante_observations
enable row level security;

drop policy if exists
"dante_observations_select_own"
on public.dante_observations;

create policy
"dante_observations_select_own"
on public.dante_observations
for select
using
(
    auth.uid() = user_id
);

drop policy if exists
"dante_observations_insert_own"
on public.dante_observations;

create policy
"dante_observations_insert_own"
on public.dante_observations
for insert
with check
(
    auth.uid() = user_id
);

-- ---------------------------------------------------------
-- L2/L3 LEARNED PATTERNS — one row per (user, context, intervention),
-- moving through `tier`/`status` as evidence accumulates (see
-- lib/dante-core/memory-hierarchy/consolidate.ts). Never physically
-- migrated between tables — the promotion/demotion IS the state
-- transition on this one row.
-- ---------------------------------------------------------

create table if not exists
public.dante_learned_patterns
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    context_key text
        not null,

    intervention_type text
        not null,

    tier text
        not null
        default 'pattern'
        check
        (
            tier in ('pattern', 'policy')
        ),

    status text
        not null
        default 'active'
        check
        (
            status in ('active', 'retained', 'demoted', 'forgotten')
        ),

    sample_count integer
        not null
        default 0,

    positive_count integer
        not null
        default 0,

    -- 0-1, always recomputed by consolidate.ts — never hand-edited.
    confidence numeric(5, 3)
        not null
        default 0,

    summary text
        not null,

    -- "ASK FIRST" override (mission Part 14) — when true, the autonomy
    -- gate never auto-applies an action derived from this pattern
    -- regardless of confidence.
    requires_confirmation boolean
        not null
        default false,

    first_observed_at timestamptz
        not null
        default now(),

    last_reinforced_at timestamptz
        not null
        default now(),

    constraint
        dante_learned_patterns_user_context_intervention_unique
    unique
        (user_id, context_key, intervention_type)
);

create index if not exists
dante_learned_patterns_user_status_idx
on public.dante_learned_patterns
(user_id, status, confidence desc);

alter table
public.dante_learned_patterns
enable row level security;

drop policy if exists
"dante_learned_patterns_select_own"
on public.dante_learned_patterns;

create policy
"dante_learned_patterns_select_own"
on public.dante_learned_patterns
for select
using
(
    auth.uid() = user_id
);

drop policy if exists
"dante_learned_patterns_insert_own"
on public.dante_learned_patterns;

create policy
"dante_learned_patterns_insert_own"
on public.dante_learned_patterns
for insert
with check
(
    auth.uid() = user_id
);

drop policy if exists
"dante_learned_patterns_update_own"
on public.dante_learned_patterns;

create policy
"dante_learned_patterns_update_own"
on public.dante_learned_patterns
for update
using
(
    auth.uid() = user_id
)
with check
(
    auth.uid() = user_id
);

drop policy if exists
"dante_learned_patterns_delete_own"
on public.dante_learned_patterns;

create policy
"dante_learned_patterns_delete_own"
on public.dante_learned_patterns
for delete
using
(
    auth.uid() = user_id
);

-- ---------------------------------------------------------
-- AUTONOMY LEVEL — additive column on the existing dante_memory
-- table (mission Part 12). DEFAULT 'assist' matches the mission's
-- stated default; existing rows backfill to it automatically.
-- ---------------------------------------------------------

alter table public.dante_memory
    add column if not exists autonomy_level text
        not null
        default 'assist';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'dante_memory_autonomy_level_check'
    ) then
        alter table public.dante_memory
            add constraint dante_memory_autonomy_level_check
            check (autonomy_level in ('guide', 'assist', 'autopilot'));
    end if;
end $$;

-- ---------------------------------------------------------
-- RICHER ACTION AUDIT — additive columns on the existing
-- dante_action_log table (mission Part 11). All nullable/defaulted,
-- so every existing insert (which doesn't set these) keeps working.
-- ---------------------------------------------------------

alter table public.dante_action_log
    add column if not exists domain text,
    add column if not exists risk_level text,
    add column if not exists evidence jsonb,
    add column if not exists limits jsonb,
    add column if not exists provenance text,
    add column if not exists auto_applied boolean
        not null
        default false;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'dante_action_log_risk_level_check'
    ) then
        alter table public.dante_action_log
            add constraint dante_action_log_risk_level_check
            check (risk_level is null or risk_level in ('auto', 'confirm', 'block'));
    end if;
end $$;

create index if not exists
dante_action_log_user_status_created_idx
on public.dante_action_log
(user_id, status, created_at desc);
