-- Dante Phase 4: validation-only, append-oriented longitudinal evidence.
-- This table is telemetry and MUST NOT be read by production recommendation logic.

create table if not exists public.dante_phase4_validation_events
(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    event_type text not null check
    (
        event_type in
        (
            'RECOMMENDATION_TRACE',
            'OUTCOME_OBSERVED',
            'PREDICTION_EVALUATED',
            'SHADOW_EVALUATED',
            'DRIFT_EVALUATED',
            'CALIBRATION_EVALUATED',
            'MEMORY_PROVENANCE_RECORDED',
            'INSTRUMENTATION_FAILURE'
        )
    ),
    recommendation_id text,
    parent_event_id uuid references public.dante_phase4_validation_events(id),
    context_signature jsonb,
    payload jsonb not null default '{}'::jsonb,
    provenance jsonb not null,
    idempotency_key text,
    occurred_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique (user_id, idempotency_key)
);

create index if not exists dante_phase4_validation_user_time_idx
on public.dante_phase4_validation_events (user_id, occurred_at desc);

create index if not exists dante_phase4_validation_recommendation_idx
on public.dante_phase4_validation_events (user_id, recommendation_id)
where recommendation_id is not null;

alter table public.dante_phase4_validation_events enable row level security;

create policy "dante_phase4_validation_select_scoped"
on public.dante_phase4_validation_events
for select using
(
    auth.uid() = user_id
    or public.has_any_role(array['admin', 'super_admin'])
);

create policy "dante_phase4_validation_insert_own"
on public.dante_phase4_validation_events
for insert with check (auth.uid() = user_id);

-- Admin dashboard visibility for the pre-existing Phase 3 source trace.
create policy "dante_phase3_shadow_events_select_admin"
on public.dante_phase3_shadow_events
for select using (public.has_any_role(array['admin', 'super_admin']));

create policy "dante_observations_select_admin"
on public.dante_observations
for select using (public.has_any_role(array['admin', 'super_admin']));

create policy "dante_learned_patterns_select_admin"
on public.dante_learned_patterns
for select using (public.has_any_role(array['admin', 'super_admin']));

-- No UPDATE or DELETE policies: correction, review, and failure are new events.
