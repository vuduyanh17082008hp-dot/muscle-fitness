-- =========================================================
-- MUSCLE FITNESS
-- STRUCTURED EVENT LOG + DANTE DAILY INTELLIGENCE (spec Part B §14-15)
--
-- app_events is an append-only audit log of meaningful user actions.
-- Dante Core recomputes the cached daily-intelligence snapshot only
-- when a relevant event fires (lib/events/emit.ts), not on every
-- dashboard render — "avoid constant unnecessary recomputation"
-- (spec §14) with a real event log backing the closed-loop demo
-- (spec §16), not just an in-memory pattern that vanishes on reload.
-- =========================================================

create table if not exists
public.app_events
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    event_type text
        not null,

    payload jsonb
        not null
        default '{}'::jsonb,

    created_at timestamptz
        not null
        default now(),

    constraint
        app_events_type_check
    check
    (
        event_type in (
            'WORKOUT_COMPLETED',
            'SET_ANALYZED',
            'FOOD_LOGGED',
            'RECOVERY_UPDATED',
            'BODYWEIGHT_UPDATED',
            'CHECKIN_COMPLETED'
        )
    )
);

create index if not exists
app_events_user_created_idx
on public.app_events
(user_id, created_at desc);

create index if not exists
app_events_user_type_idx
on public.app_events
(user_id, event_type, created_at desc);

alter table
public.app_events
enable row level security;

drop policy if exists
"app_events_select_own"
on public.app_events;

create policy
"app_events_select_own"
on public.app_events
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"app_events_insert_own"
on public.app_events;

create policy
"app_events_insert_own"
on public.app_events
for insert
with check
(
    auth.uid() =
    user_id
);

-- =========================================================
-- DANTE DAILY INTELLIGENCE (cached snapshot, one per user per day)
-- =========================================================

create table if not exists
public.dante_daily_intelligence
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    summary_date date
        not null
        default current_date,

    readiness_score smallint,
    training_focus text,
    nutrition_adherence_percent numeric(5,2),
    recovery_status text,

    -- Short, deterministic-data-grounded narrative (spec §15's
    -- example: "Performance conditions are favorable..."). May be
    -- LLM-generated (see lib/dante-core/daily-intelligence.ts) but
    -- never the source of the numbers above — those are always
    -- computed first and passed in.
    narrative text,

    generated_at timestamptz
        not null
        default now(),

    -- Which event (if any) triggered this recomputation — purely
    -- informational, for the closed-loop demo / debugging.
    triggered_by_event_type text,

    constraint
        dante_daily_intelligence_user_date_unique
    unique
        (user_id, summary_date)
);

create index if not exists
dante_daily_intelligence_user_date_idx
on public.dante_daily_intelligence
(user_id, summary_date desc);

alter table
public.dante_daily_intelligence
enable row level security;

drop policy if exists
"dante_daily_intelligence_select_own"
on public.dante_daily_intelligence;

create policy
"dante_daily_intelligence_select_own"
on public.dante_daily_intelligence
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"dante_daily_intelligence_upsert_own"
on public.dante_daily_intelligence;

create policy
"dante_daily_intelligence_upsert_own"
on public.dante_daily_intelligence
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"dante_daily_intelligence_update_own"
on public.dante_daily_intelligence;

create policy
"dante_daily_intelligence_update_own"
on public.dante_daily_intelligence
for update
using
(
    auth.uid() =
    user_id
)
with check
(
    auth.uid() =
    user_id
);
