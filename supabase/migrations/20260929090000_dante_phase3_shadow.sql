-- Dante Phase 3: append-only shadow adaptive-control telemetry.
-- SHADOW ONLY: no production policy or recommendation reads from this table.

create table if not exists public.dante_phase3_shadow_events
(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    event_type text not null check
    (
        event_type in
        (
            'SHADOW_DECISION',
            'OUTCOME_LINKED',
            'CALIBRATION_UPDATED',
            'CONSOLIDATION_DECISION'
        )
    ),
    recommendation_id text,
    context_signature text,
    production_decision jsonb,
    shadow_decision jsonb,
    expected_outcome jsonb,
    actual_outcome jsonb,
    uncertainty_profile jsonb,
    drift_state jsonb,
    stability_state jsonb,
    reason_codes text[] not null default '{}',
    metadata jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null default now()
);

create index if not exists dante_phase3_shadow_events_user_time_idx
on public.dante_phase3_shadow_events (user_id, occurred_at desc);

create index if not exists dante_phase3_shadow_events_recommendation_idx
on public.dante_phase3_shadow_events (user_id, recommendation_id)
where recommendation_id is not null;

-- Async delivery may retry. Only one outcome event may resolve a given
-- user-scoped recommendation; later calibration derives from that one event.
create unique index if not exists dante_phase3_shadow_events_one_outcome_idx
on public.dante_phase3_shadow_events (user_id, recommendation_id)
where event_type = 'OUTCOME_LINKED' and recommendation_id is not null;

alter table public.dante_phase3_shadow_events enable row level security;

drop policy if exists "dante_phase3_shadow_events_select_own"
on public.dante_phase3_shadow_events;

create policy "dante_phase3_shadow_events_select_own"
on public.dante_phase3_shadow_events
for select using (auth.uid() = user_id);

drop policy if exists "dante_phase3_shadow_events_insert_own"
on public.dante_phase3_shadow_events;

create policy "dante_phase3_shadow_events_insert_own"
on public.dante_phase3_shadow_events
for insert with check (auth.uid() = user_id);

-- Intentionally no UPDATE or DELETE policy. Corrections and outcomes are
-- new events so the original episode/provenance remains reconstructable.
