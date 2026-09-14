-- =========================================================
-- MUSCLE FITNESS
-- DANTE TECHNIQUE PATTERNS — longitudinal SetVision learning
--
-- Deliberately a SEPARATE table from dante_observations /
-- dante_learned_patterns (see supabase/migrations/20260925090000_
-- dante_adaptive_intelligence.sql), not a new row shape squeezed into
-- them. Those model CONTEXT -> INTERVENTION -> OUTCOME (something was
-- deliberately changed, an outcome followed). A SetVision analysis has
-- no intervention — it's a raw technique measurement compared against
-- the athlete's own recent baseline
-- (lib/dante-core/personal-baseline.ts, already wired into
-- lib/setvision/load-setvision-context.ts). Forcing it into the
-- intervention/outcome shape would mean inventing an intervention_type
-- for something nobody changed.
--
-- Additive only — does not touch dante_observations, dante_learned_
-- patterns, or setvision_analyses' existing columns; only ADDS one
-- new nullable column to setvision_analyses for idempotency (below).
--
-- Review before applying to any shared/production database. Not
-- auto-applied by this migration file's presence alone.
-- =========================================================

-- ---------------------------------------------------------
-- IDEMPOTENCY GUARD on the existing setvision_analyses table: marks
-- exactly which analyses have already been folded into
-- dante_technique_patterns, so a retried/duplicate call to
-- recordTechniqueEvidenceFromDeviation() can never double-count the
-- same analysis (see lib/dante-core/memory-hierarchy/
-- record-technique-evidence.ts, which does an atomic
-- "UPDATE ... WHERE technique_pattern_processed_at IS NULL" claim
-- before folding any evidence).
-- ---------------------------------------------------------

alter table public.setvision_analyses
    add column if not exists technique_pattern_processed_at timestamptz;

-- ---------------------------------------------------------
-- DANTE TECHNIQUE PATTERNS
-- ---------------------------------------------------------

create table if not exists
public.dante_technique_patterns
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    exercise text
        not null
        check
        (
            exercise in ('bench_press', 'squat', 'deadlift')
        ),

    signal_type text
        not null
        check
        (
            signal_type in ('rom_consistency', 'tempo_consistency')
        ),

    direction text
        not null
        check
        (
            direction in ('below_baseline', 'above_baseline')
        ),

    status text
        not null
        default 'active'
        check
        (
            status in ('active', 'demoted', 'forgotten')
        ),

    -- How many analyses had enough of the athlete's own history to be
    -- evaluated at all (computeBaselineDeviation returned a real
    -- baseline) — the honest denominator, not just "how many analyses
    -- exist for this exercise."
    sample_count integer
        not null
        default 0,

    -- Of sample_count evaluable analyses, how many showed a notable
    -- deviation in THIS row's direction.
    notable_count integer
        not null
        default 0,

    -- 0-1, always recomputed by the SAME computePatternConfidence()
    -- formula dante_learned_patterns uses — never hand-edited.
    confidence numeric(5, 3)
        not null
        default 0,

    summary text
        not null,

    first_observed_at timestamptz
        not null
        default now(),

    last_reinforced_at timestamptz
        not null
        default now(),

    constraint
        dante_technique_patterns_unique_key
    unique
        (user_id, exercise, signal_type, direction),

    constraint
        dante_technique_patterns_counts_check
    check
    (
        sample_count >= 0
        and notable_count >= 0
        and notable_count <= sample_count
    )
);

create index if not exists
dante_technique_patterns_user_status_idx
on public.dante_technique_patterns
(user_id, status, confidence desc);

alter table
public.dante_technique_patterns
enable row level security;

drop policy if exists
"dante_technique_patterns_select_own"
on public.dante_technique_patterns;

create policy
"dante_technique_patterns_select_own"
on public.dante_technique_patterns
for select
using
(
    auth.uid() = user_id
);

drop policy if exists
"dante_technique_patterns_insert_own"
on public.dante_technique_patterns;

create policy
"dante_technique_patterns_insert_own"
on public.dante_technique_patterns
for insert
with check
(
    auth.uid() = user_id
);

drop policy if exists
"dante_technique_patterns_update_own"
on public.dante_technique_patterns;

create policy
"dante_technique_patterns_update_own"
on public.dante_technique_patterns
for update
using
(
    auth.uid() = user_id
)
with check
(
    auth.uid() = user_id
);

-- DELETE policy included for parity with dante_learned_patterns'
-- "Memory must be forgettable" precedent, even though no application
-- code calls it yet in this pass (forgetTechniquePattern() exists in
-- lib/dante-core/memory-hierarchy/load-technique-patterns.ts, ready
-- for a future UI to wire up — see the session's cross-agent notes).
drop policy if exists
"dante_technique_patterns_delete_own"
on public.dante_technique_patterns;

create policy
"dante_technique_patterns_delete_own"
on public.dante_technique_patterns
for delete
using
(
    auth.uid() = user_id
);
