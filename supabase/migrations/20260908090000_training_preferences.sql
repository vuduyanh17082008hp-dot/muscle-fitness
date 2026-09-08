-- =========================================================
-- MUSCLE FITNESS
-- TRAINING CONFIGURATION SYSTEM
-- =========================================================

create table if not exists
public.training_preferences
(
    user_id uuid primary key
        references auth.users(id)
        on delete cascade,

    split_type text
        not null
        default 'auto',

    training_days integer
        not null
        default 3,

    custom_split jsonb
        not null
        default '[]'::jsonb,

    priority_muscles text[]
        not null
        default '{}',

    intensity_style text
        not null
        default 'moderate',

    volume_style text
        not null
        default 'moderate',

    failure_style text
        not null
        default 'isolation_only',

    exercise_style text
        not null
        default 'mixed',

    excluded_exercises text[]
        not null
        default '{}',

    target_session_minutes integer
        not null
        default 60,

    generated_program jsonb,

    created_at timestamptz
        not null
        default now(),

    updated_at timestamptz
        not null
        default now(),

    constraint
        training_preferences_split_check
    check
    (
        split_type in
        (
            'auto',
            'full_body',
            'upper_lower',
            'push_pull_legs',
            'ppl_upper_lower',
            'arnold',
            'torso_limbs',
            'body_part',
            'custom'
        )
    ),

    constraint
        training_preferences_days_check
    check
    (
        training_days
        between 2 and 7
    ),

    constraint
        training_preferences_intensity_check
    check
    (
        intensity_style in
        (
            'conservative',
            'moderate',
            'hard',
            'very_hard'
        )
    ),

    constraint
        training_preferences_volume_check
    check
    (
        volume_style in
        (
            'low',
            'moderate',
            'high'
        )
    ),

    constraint
        training_preferences_failure_check
    check
    (
        failure_style in
        (
            'rare',
            'isolation_only',
            'selected_last_sets'
        )
    ),

    constraint
        training_preferences_exercise_style_check
    check
    (
        exercise_style in
        (
            'mixed',
            'machine',
            'free_weights'
        )
    ),

    constraint
        training_preferences_session_check
    check
    (
        target_session_minutes
        between 30 and 180
    )
);

-- =========================================================
-- UPDATED AT
-- =========================================================

create or replace function
public.set_training_preferences_updated_at()
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
training_preferences_updated_at
on public.training_preferences;

create trigger
training_preferences_updated_at
before update
on public.training_preferences
for each row
execute function
public.set_training_preferences_updated_at();

-- =========================================================
-- RLS
-- =========================================================

alter table
public.training_preferences
enable row level security;

drop policy if exists
"training_preferences_select_own"
on public.training_preferences;

create policy
"training_preferences_select_own"
on public.training_preferences
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"training_preferences_insert_own"
on public.training_preferences;

create policy
"training_preferences_insert_own"
on public.training_preferences
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"training_preferences_update_own"
on public.training_preferences;

create policy
"training_preferences_update_own"
on public.training_preferences
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
"training_preferences_delete_own"
on public.training_preferences;

create policy
"training_preferences_delete_own"
on public.training_preferences
for delete
using
(
    auth.uid() =
    user_id
);