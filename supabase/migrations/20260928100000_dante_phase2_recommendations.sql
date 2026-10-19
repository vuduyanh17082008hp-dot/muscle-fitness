-- =========================================================
-- MUSCLE FITNESS
-- DANTE PHASE 2B — recommendation records (additive)
--
-- Durable recommendation → expected outcome → horizon rows.
-- Does not alter existing dante_observations / dante_learned_patterns
-- semantics. Review before applying to shared/production databases.
-- =========================================================

create table if not exists
public.dante_recommendations
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

    expected_metric text
        not null
        check
        (
            expected_metric in ('recovery_score', 'adherence_score')
        ),

    expected_direction text
        not null
        check
        (
            expected_direction in ('improve', 'maintain')
        ),

    horizon text
        not null
        default 'next_day'
        check
        (
            horizon in ('same_day', 'next_day', 'three_day', 'seven_day')
        ),

    higher_is_better boolean
        not null
        default true,

    meaningful_change_threshold numeric(8, 3)
        not null
        default 5,

    provenance text
        not null,

    status text
        not null
        default 'proposed'
        check
        (
            status in ('proposed', 'accepted', 'rejected', 'expired', 'evaluated')
        ),

    outcome_class text
        check
        (
            outcome_class is null
            or outcome_class in
            (
                'SUCCESS',
                'PARTIAL_SUCCESS',
                'NEUTRAL',
                'FAILURE',
                'UNKNOWN'
            )
        ),

    before_value numeric,
    after_value numeric,
    prediction_error jsonb,

    created_at timestamptz
        not null
        default now(),

    evaluated_at timestamptz
);

create index if not exists
dante_recommendations_user_status_idx
on public.dante_recommendations
(user_id, status, created_at desc);

alter table
public.dante_recommendations
enable row level security;

drop policy if exists
"dante_recommendations_select_own"
on public.dante_recommendations;

create policy
"dante_recommendations_select_own"
on public.dante_recommendations
for select
using
(
    auth.uid() = user_id
);

drop policy if exists
"dante_recommendations_insert_own"
on public.dante_recommendations;

create policy
"dante_recommendations_insert_own"
on public.dante_recommendations
for insert
with check
(
    auth.uid() = user_id
);

drop policy if exists
"dante_recommendations_update_own"
on public.dante_recommendations;

create policy
"dante_recommendations_update_own"
on public.dante_recommendations
for update
using
(
    auth.uid() = user_id
)
with check
(
    auth.uid() = user_id
);

-- Optional link from an observation back to the recommendation that
-- produced it (nullable so existing rows remain valid).
alter table public.dante_observations
    add column if not exists recommendation_id uuid
        references public.dante_recommendations(id)
        on delete set null;
