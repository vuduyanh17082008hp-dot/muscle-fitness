-- =========================================================
-- MUSCLE FITNESS
-- RECOVERY INTELLIGENCE — DAILY CHECK-INS
-- =========================================================

create table if not exists
public.recovery_checkins
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    checkin_date date
        not null
        default current_date,

    -- =====================================================
    -- RECOVERY INPUTS
    -- =====================================================

    sleep_hours numeric(4,1),
    sleep_quality smallint,
    stress smallint,
    fatigue smallint,
    soreness smallint,
    mood smallint,
    readiness smallint,

    resting_hr smallint,
    steps integer,

    pain_illness text
        not null
        default 'no',

    notes text,

    -- =====================================================
    -- COMPUTED SCORE (deterministic, never written by an LLM)
    -- =====================================================

    recovery_score smallint,
    score_breakdown jsonb,

    created_at timestamptz
        not null
        default now(),

    updated_at timestamptz
        not null
        default now(),

    constraint
        recovery_checkins_user_date_unique
    unique
        (user_id, checkin_date),

    constraint
        recovery_checkins_sleep_hours_check
    check
    (
        sleep_hours is null
        or sleep_hours between 0 and 24
    ),

    constraint
        recovery_checkins_sleep_quality_check
    check
    (
        sleep_quality is null
        or sleep_quality between 1 and 10
    ),

    constraint
        recovery_checkins_stress_check
    check
    (
        stress is null
        or stress between 1 and 10
    ),

    constraint
        recovery_checkins_fatigue_check
    check
    (
        fatigue is null
        or fatigue between 1 and 10
    ),

    constraint
        recovery_checkins_soreness_check
    check
    (
        soreness is null
        or soreness between 1 and 10
    ),

    constraint
        recovery_checkins_mood_check
    check
    (
        mood is null
        or mood between 1 and 10
    ),

    constraint
        recovery_checkins_readiness_check
    check
    (
        readiness is null
        or readiness between 1 and 10
    ),

    constraint
        recovery_checkins_resting_hr_check
    check
    (
        resting_hr is null
        or resting_hr between 25 and 220
    ),

    constraint
        recovery_checkins_steps_check
    check
    (
        steps is null
        or steps >= 0
    ),

    constraint
        recovery_checkins_pain_illness_check
    check
    (
        pain_illness in
        ('no', 'minor', 'yes')
    ),

    constraint
        recovery_checkins_score_check
    check
    (
        recovery_score is null
        or recovery_score between 0 and 100
    )
);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists
recovery_checkins_user_date_idx
on public.recovery_checkins
(user_id, checkin_date desc);

-- =========================================================
-- UPDATED AT
-- =========================================================

create or replace function
public.set_recovery_checkins_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at =
        now();

    return new;
end;
$$;

drop trigger if exists
recovery_checkins_updated_at
on public.recovery_checkins;

create trigger
recovery_checkins_updated_at
before update
on public.recovery_checkins
for each row
execute function
public.set_recovery_checkins_updated_at();

-- =========================================================
-- RLS
-- =========================================================

alter table
public.recovery_checkins
enable row level security;

drop policy if exists
"recovery_checkins_select_own"
on public.recovery_checkins;

create policy
"recovery_checkins_select_own"
on public.recovery_checkins
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"recovery_checkins_insert_own"
on public.recovery_checkins;

create policy
"recovery_checkins_insert_own"
on public.recovery_checkins
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"recovery_checkins_update_own"
on public.recovery_checkins;

create policy
"recovery_checkins_update_own"
on public.recovery_checkins
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

drop policy if exists
"recovery_checkins_delete_own"
on public.recovery_checkins;

create policy
"recovery_checkins_delete_own"
on public.recovery_checkins
for delete
using
(
    auth.uid() =
    user_id
);
