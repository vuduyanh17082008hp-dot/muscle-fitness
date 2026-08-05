-- Muscle Fitness
-- Project 09 — Complete Workout System
-- Incremental migration for Projects 06, 07 and 08.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- 1. AUTHORIZATION HELPERS
-- =========================================================

create or replace function public.can_manage_workout_client(
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = p_client_id
      or public.is_admin()
      or public.is_assigned_coach(p_client_id)
    );
$$;

revoke all on function public.can_manage_workout_client(uuid) from public;
grant execute on function public.can_manage_workout_client(uuid)
  to authenticated;

-- =========================================================
-- 2. EXERCISE LIBRARY
-- =========================================================

create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid references auth.users(id) on delete cascade,

  slug text not null,
  name text not null,
  description text,

  primary_muscle text not null,
  secondary_muscles text[] not null default array[]::text[],

  equipment text not null,
  movement_pattern text,
  difficulty text not null default 'beginner',

  instructions text[] not null default array[]::text[],
  cues text[] not null default array[]::text[],
  limitations text[] not null default array[]::text[],

  media_url text,

  is_verified boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exercise_library_slug_length
    check (char_length(slug) between 2 and 120),

  constraint exercise_library_name_length
    check (char_length(name) between 2 and 120),

  constraint exercise_library_difficulty_check
    check (difficulty in ('beginner', 'intermediate', 'advanced'))
);

create unique index if not exists exercise_library_public_slug_unique
  on public.exercise_library(slug)
  where owner_id is null;

create unique index if not exists exercise_library_owner_slug_unique
  on public.exercise_library(owner_id, slug)
  where owner_id is not null;

create index if not exists exercise_library_primary_muscle_idx
  on public.exercise_library(primary_muscle);

create index if not exists exercise_library_equipment_idx
  on public.exercise_library(equipment);

create index if not exists exercise_library_active_idx
  on public.exercise_library(is_active)
  where is_active = true;

-- =========================================================
-- 3. WORKOUT PLANS
-- =========================================================

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,

  name text not null,
  description text,
  goal text,

  status text not null default 'draft',
  version integer not null default 1,

  allow_client_substitution boolean not null default true,

  start_date date,
  end_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_plans_name_length
    check (char_length(name) between 2 and 120),

  constraint workout_plans_status_check
    check (status in ('draft', 'active', 'paused', 'archived')),

  constraint workout_plans_version_check
    check (version >= 1),

  constraint workout_plans_date_check
    check (
      end_date is null
      or start_date is null
      or end_date >= start_date
    )
);

create unique index if not exists workout_plans_one_active_per_client
  on public.workout_plans(client_id)
  where status = 'active';

create index if not exists workout_plans_client_created_idx
  on public.workout_plans(client_id, created_at desc);

create index if not exists workout_plans_created_by_idx
  on public.workout_plans(created_by);

-- =========================================================
-- 4. WORKOUT DAYS
-- =========================================================

create table if not exists public.workout_days (
  id uuid primary key default gen_random_uuid(),

  workout_plan_id uuid not null
    references public.workout_plans(id)
    on delete cascade,

  name text not null,
  day_order smallint not null,

  scheduled_weekday smallint,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_days_name_length
    check (char_length(name) between 1 and 120),

  constraint workout_days_order_check
    check (day_order between 1 and 14),

  constraint workout_days_weekday_check
    check (
      scheduled_weekday is null
      or scheduled_weekday between 0 and 6
    ),

  unique(workout_plan_id, day_order)
);

create index if not exists workout_days_plan_idx
  on public.workout_days(workout_plan_id, day_order);

-- =========================================================
-- 5. WORKOUT EXERCISES
-- =========================================================

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),

  workout_day_id uuid not null
    references public.workout_days(id)
    on delete cascade,

  exercise_id uuid not null
    references public.exercise_library(id)
    on delete restrict,

  exercise_order smallint not null,

  target_sets smallint not null default 3,
  rep_min smallint not null default 8,
  rep_max smallint not null default 12,

  target_rir numeric(3,1) not null default 2,
  target_rpe numeric(3,1),

  rest_seconds integer not null default 120,
  tempo text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_exercises_order_check
    check (exercise_order between 1 and 50),

  constraint workout_exercises_sets_check
    check (target_sets between 1 and 12),

  constraint workout_exercises_rep_range_check
    check (
      rep_min between 1 and 100
      and rep_max between rep_min and 100
    ),

  constraint workout_exercises_rir_check
    check (target_rir between 0 and 10),

  constraint workout_exercises_rpe_check
    check (target_rpe is null or target_rpe between 1 and 10),

  constraint workout_exercises_rest_check
    check (rest_seconds between 15 and 900),

  unique(workout_day_id, exercise_order)
);

create index if not exists workout_exercises_day_idx
  on public.workout_exercises(workout_day_id, exercise_order);

create index if not exists workout_exercises_exercise_idx
  on public.workout_exercises(exercise_id);

-- =========================================================
-- 6. EXTEND PROJECT 08 WORKOUT SESSIONS
-- =========================================================

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null default 'Workout',
  scheduled_date date not null default current_date,

  status text not null default 'planned',

  duration_minutes integer,
  calories_burned integer not null default 0,

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_sessions
  add column if not exists workout_plan_id uuid
    references public.workout_plans(id)
    on delete set null,

  add column if not exists workout_day_id uuid
    references public.workout_days(id)
    on delete set null,

  add column if not exists name text not null default 'Workout',

  add column if not exists session_state text
    not null default 'not_started',

  add column if not exists scheduled_for timestamptz,

  add column if not exists started_at timestamptz,

  add column if not exists total_volume_kg numeric(14,2)
    not null default 0,

  add column if not exists total_sets integer
    not null default 0,

  add column if not exists session_rpe numeric(3,1),

  add column if not exists notes text;

create index if not exists workout_sessions_user_state_idx
  on public.workout_sessions(user_id, session_state, created_at desc);

create index if not exists workout_sessions_plan_idx
  on public.workout_sessions(workout_plan_id);

create index if not exists workout_sessions_day_idx
  on public.workout_sessions(workout_day_id);

create index if not exists workout_sessions_completed_idx
  on public.workout_sessions(user_id, completed_at desc)
  where completed_at is not null;

-- =========================================================
-- 7. SESSION EXERCISES
-- =========================================================

create table if not exists public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),

  workout_session_id uuid not null
    references public.workout_sessions(id)
    on delete cascade,

  workout_exercise_id uuid
    references public.workout_exercises(id)
    on delete set null,

  exercise_id uuid not null
    references public.exercise_library(id)
    on delete restrict,

  replaced_from_exercise_id uuid
    references public.exercise_library(id)
    on delete set null,

  exercise_order smallint not null,

  display_name text not null,

  target_sets smallint not null,
  target_rep_min smallint not null,
  target_rep_max smallint not null,

  target_rir numeric(3,1),
  target_rpe numeric(3,1),

  rest_seconds integer not null default 120,
  tempo text,
  notes text,

  is_skipped boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_session_exercises_order_check
    check (exercise_order between 1 and 50),

  constraint workout_session_exercises_sets_check
    check (target_sets between 1 and 12),

  constraint workout_session_exercises_rep_check
    check (
      target_rep_min between 1 and 100
      and target_rep_max between target_rep_min and 100
    ),

  unique(workout_session_id, exercise_order)
);

create index if not exists workout_session_exercises_session_idx
  on public.workout_session_exercises(
    workout_session_id,
    exercise_order
  );

create index if not exists workout_session_exercises_exercise_idx
  on public.workout_session_exercises(exercise_id);

-- =========================================================
-- 8. EXERCISE SETS
-- =========================================================

create table if not exists public.exercise_sets (
  id uuid primary key default gen_random_uuid(),

  session_exercise_id uuid not null
    references public.workout_session_exercises(id)
    on delete cascade,

  set_number smallint not null,

  set_type text not null default 'working',
  target_reps smallint,

  weight_kg numeric(7,2),
  reps smallint,
  rir numeric(3,1),
  rpe numeric(3,1),

  completed boolean not null default false,
  completed_at timestamptz,

  notes text,

  volume_kg numeric(12,2)
    generated always as (
      case
        when completed = true
          and weight_kg is not null
          and reps is not null
        then weight_kg * reps
        else 0
      end
    ) stored,

  estimated_1rm_kg numeric(12,2)
    generated always as (
      case
        when completed = true
          and weight_kg is not null
          and weight_kg > 0
          and reps between 1 and 12
        then round(
          (
            weight_kg *
            (
              1 + reps::numeric / 30
            )
          )::numeric,
          2
        )
        else null
      end
    ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exercise_sets_number_check
    check (set_number between 1 and 20),

  constraint exercise_sets_type_check
    check (
      set_type in (
        'warmup',
        'working',
        'backoff',
        'drop',
        'failure'
      )
    ),

  constraint exercise_sets_weight_check
    check (weight_kg is null or weight_kg between 0 and 1500),

  constraint exercise_sets_reps_check
    check (reps is null or reps between 0 and 200),

  constraint exercise_sets_rir_check
    check (rir is null or rir between 0 and 10),

  constraint exercise_sets_rpe_check
    check (rpe is null or rpe between 1 and 10),

  unique(session_exercise_id, set_number)
);

create index if not exists exercise_sets_session_exercise_idx
  on public.exercise_sets(session_exercise_id, set_number);

create index if not exists exercise_sets_completed_idx
  on public.exercise_sets(completed, completed_at desc)
  where completed = true;

-- =========================================================
-- 9. WORKOUT LOGS
-- =========================================================

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),

  workout_session_id uuid not null unique
    references public.workout_sessions(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  duration_minutes integer not null default 0,
  total_volume_kg numeric(14,2) not null default 0,

  completed_sets integer not null default 0,
  completed_exercises integer not null default 0,

  session_rpe numeric(3,1),
  notes text,

  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint workout_logs_duration_check
    check (duration_minutes between 0 and 1440),

  constraint workout_logs_session_rpe_check
    check (session_rpe is null or session_rpe between 1 and 10)
);

create index if not exists workout_logs_user_completed_idx
  on public.workout_logs(user_id, completed_at desc);

-- =========================================================
-- 10. PERSONAL RECORDS
-- =========================================================

create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  exercise_id uuid not null
    references public.exercise_library(id)
    on delete cascade,

  exercise_set_id uuid
    references public.exercise_sets(id)
    on delete set null,

  record_type text not null,
  value numeric(14,2) not null,

  achieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint personal_records_type_check
    check (
      record_type in (
        'max_weight',
        'max_set_volume',
        'estimated_1rm'
      )
    ),

  constraint personal_records_value_check
    check (value >= 0),

  unique(user_id, exercise_id, record_type)
);

create index if not exists personal_records_user_idx
  on public.personal_records(user_id, achieved_at desc);

-- =========================================================
-- 11. UPDATED_AT TRIGGERS
-- =========================================================

drop trigger if exists exercise_library_set_updated_at
  on public.exercise_library;

create trigger exercise_library_set_updated_at
before update on public.exercise_library
for each row execute function public.set_updated_at();

drop trigger if exists workout_plans_set_updated_at
  on public.workout_plans;

create trigger workout_plans_set_updated_at
before update on public.workout_plans
for each row execute function public.set_updated_at();

drop trigger if exists workout_days_set_updated_at
  on public.workout_days;

create trigger workout_days_set_updated_at
before update on public.workout_days
for each row execute function public.set_updated_at();

drop trigger if exists workout_exercises_set_updated_at
  on public.workout_exercises;

create trigger workout_exercises_set_updated_at
before update on public.workout_exercises
for each row execute function public.set_updated_at();

drop trigger if exists workout_sessions_set_updated_at
  on public.workout_sessions;

create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists workout_session_exercises_set_updated_at
  on public.workout_session_exercises;

create trigger workout_session_exercises_set_updated_at
before update on public.workout_session_exercises
for each row execute function public.set_updated_at();

drop trigger if exists exercise_sets_set_updated_at
  on public.exercise_sets;

create trigger exercise_sets_set_updated_at
before update on public.exercise_sets
for each row execute function public.set_updated_at();

drop trigger if exists personal_records_set_updated_at
  on public.personal_records;

create trigger personal_records_set_updated_at
before update on public.personal_records
for each row execute function public.set_updated_at();

-- =========================================================
-- 12. PERSONAL RECORD TRIGGER
-- =========================================================

create or replace function public.update_personal_records_from_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_exercise_id uuid;
begin
  if new.completed is not true then
    return new;
  end if;

  select
    ws.user_id,
    wse.exercise_id
  into
    v_user_id,
    v_exercise_id
  from public.workout_session_exercises as wse
  join public.workout_sessions as ws
    on ws.id = wse.workout_session_id
  where wse.id = new.session_exercise_id;

  if v_user_id is null or v_exercise_id is null then
    return new;
  end if;

  if new.weight_kg is not null then
    insert into public.personal_records (
      user_id,
      exercise_id,
      exercise_set_id,
      record_type,
      value,
      achieved_at
    )
    values (
      v_user_id,
      v_exercise_id,
      new.id,
      'max_weight',
      new.weight_kg,
      coalesce(new.completed_at, now())
    )
    on conflict (user_id, exercise_id, record_type)
    do update
    set
      exercise_set_id = excluded.exercise_set_id,
      value = excluded.value,
      achieved_at = excluded.achieved_at
    where excluded.value > public.personal_records.value;
  end if;

  if new.volume_kg > 0 then
    insert into public.personal_records (
      user_id,
      exercise_id,
      exercise_set_id,
      record_type,
      value,
      achieved_at
    )
    values (
      v_user_id,
      v_exercise_id,
      new.id,
      'max_set_volume',
      new.volume_kg,
      coalesce(new.completed_at, now())
    )
    on conflict (user_id, exercise_id, record_type)
    do update
    set
      exercise_set_id = excluded.exercise_set_id,
      value = excluded.value,
      achieved_at = excluded.achieved_at
    where excluded.value > public.personal_records.value;
  end if;

  if new.estimated_1rm_kg is not null then
    insert into public.personal_records (
      user_id,
      exercise_id,
      exercise_set_id,
      record_type,
      value,
      achieved_at
    )
    values (
      v_user_id,
      v_exercise_id,
      new.id,
      'estimated_1rm',
      new.estimated_1rm_kg,
      coalesce(new.completed_at, now())
    )
    on conflict (user_id, exercise_id, record_type)
    do update
    set
      exercise_set_id = excluded.exercise_set_id,
      value = excluded.value,
      achieved_at = excluded.achieved_at
    where excluded.value > public.personal_records.value;
  end if;

  return new;
end;
$$;

revoke all on function public.update_personal_records_from_set()
  from public;

drop trigger if exists exercise_sets_update_personal_records
  on public.exercise_sets;

create trigger exercise_sets_update_personal_records
after insert or update of completed, weight_kg, reps
on public.exercise_sets
for each row
execute function public.update_personal_records_from_set();

-- =========================================================
-- 13. ACTIVATE PLAN RPC
-- =========================================================

create or replace function public.activate_workout_plan(
  p_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  select client_id
  into v_client_id
  from public.workout_plans
  where id = p_plan_id;

  if v_client_id is null then
    raise exception 'Workout plan not found'
      using errcode = 'P0002';
  end if;

  if not public.can_manage_workout_client(v_client_id) then
    raise exception 'Not authorized to activate this plan'
      using errcode = '42501';
  end if;

  update public.workout_plans
  set status = 'paused'
  where client_id = v_client_id
    and status = 'active'
    and id <> p_plan_id;

  update public.workout_plans
  set
    status = 'active',
    start_date = coalesce(start_date, current_date)
  where id = p_plan_id;
end;
$$;

revoke all on function public.activate_workout_plan(uuid)
  from public;

grant execute on function public.activate_workout_plan(uuid)
  to authenticated;

-- =========================================================
-- 14. START WORKOUT RPC
-- =========================================================

create or replace function public.start_workout(
  p_workout_day_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());

  v_plan_id uuid;
  v_day_name text;

  v_session_id uuid;
  v_existing_session uuid;

  v_session_exercise_id uuid;
  v_exercise record;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select
    wp.id,
    wd.name
  into
    v_plan_id,
    v_day_name
  from public.workout_days as wd
  join public.workout_plans as wp
    on wp.id = wd.workout_plan_id
  where wd.id = p_workout_day_id
    and wp.client_id = v_user_id
    and wp.status = 'active';

  if v_plan_id is null then
    raise exception 'Active workout day not found'
      using errcode = 'P0002';
  end if;

  select id
  into v_existing_session
  from public.workout_sessions
  where user_id = v_user_id
    and workout_day_id = p_workout_day_id
    and session_state = 'in_progress'
  order by created_at desc
  limit 1;

  if v_existing_session is not null then
    return v_existing_session;
  end if;

  insert into public.workout_sessions (
    user_id,
    workout_plan_id,
    workout_day_id,
    title,
    name,
    status,
    session_state,
    scheduled_date,
    scheduled_for,
    started_at
  )
  values (
    v_user_id,
    v_plan_id,
    p_workout_day_id,
    v_day_name,
    v_day_name,
    'planned',
    'in_progress',
    current_date,
    now(),
    now()
  )
  returning id into v_session_id;

  for v_exercise in
    select
      we.id as workout_exercise_id,
      we.exercise_id,
      we.exercise_order,
      we.target_sets,
      we.rep_min,
      we.rep_max,
      we.target_rir,
      we.target_rpe,
      we.rest_seconds,
      we.tempo,
      we.notes,
      el.name as exercise_name
    from public.workout_exercises as we
    join public.exercise_library as el
      on el.id = we.exercise_id
    where we.workout_day_id = p_workout_day_id
    order by we.exercise_order
  loop
    insert into public.workout_session_exercises (
      workout_session_id,
      workout_exercise_id,
      exercise_id,
      exercise_order,
      display_name,
      target_sets,
      target_rep_min,
      target_rep_max,
      target_rir,
      target_rpe,
      rest_seconds,
      tempo,
      notes
    )
    values (
      v_session_id,
      v_exercise.workout_exercise_id,
      v_exercise.exercise_id,
      v_exercise.exercise_order,
      v_exercise.exercise_name,
      v_exercise.target_sets,
      v_exercise.rep_min,
      v_exercise.rep_max,
      v_exercise.target_rir,
      v_exercise.target_rpe,
      v_exercise.rest_seconds,
      v_exercise.tempo,
      v_exercise.notes
    )
    returning id into v_session_exercise_id;

    insert into public.exercise_sets (
      session_exercise_id,
      set_number,
      set_type,
      target_reps
    )
    select
      v_session_exercise_id,
      generated_set_number,
      'working',
      v_exercise.rep_max
    from generate_series(
      1,
      v_exercise.target_sets
    ) as generated_set_number;
  end loop;

  return v_session_id;
end;
$$;

revoke all on function public.start_workout(uuid)
  from public;

grant execute on function public.start_workout(uuid)
  to authenticated;

-- =========================================================
-- 15. FINISH WORKOUT RPC
-- =========================================================

create or replace function public.finish_workout(
  p_session_id uuid,
  p_notes text default null,
  p_session_rpe numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());

  v_started_at timestamptz;
  v_duration integer;

  v_total_volume numeric(14,2);
  v_completed_sets integer;
  v_completed_exercises integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select started_at
  into v_started_at
  from public.workout_sessions
  where id = p_session_id
    and user_id = v_user_id
    and session_state = 'in_progress';

  if not found then
    raise exception 'Active workout session not found'
      using errcode = 'P0002';
  end if;

  select
    coalesce(sum(es.volume_kg), 0),
    count(*) filter (where es.completed = true),
    count(distinct wse.id)
      filter (
        where es.completed = true
        and wse.is_skipped = false
      )
  into
    v_total_volume,
    v_completed_sets,
    v_completed_exercises
  from public.workout_session_exercises as wse
  left join public.exercise_sets as es
    on es.session_exercise_id = wse.id
  where wse.workout_session_id = p_session_id;

  if v_completed_sets = 0 then
    raise exception 'Complete at least one set before finishing'
      using errcode = '22023';
  end if;

  v_duration := greatest(
    1,
    floor(
      extract(
        epoch from (
          now() - coalesce(v_started_at, now())
        )
      ) / 60
    )::integer
  );

  update public.workout_sessions
  set
    status = 'completed',
    session_state = 'completed',
    completed_at = now(),
    duration_minutes = v_duration,
    total_volume_kg = v_total_volume,
    total_sets = v_completed_sets,
    session_rpe = p_session_rpe,
    notes = nullif(btrim(p_notes), '')
  where id = p_session_id
    and user_id = v_user_id;

  insert into public.workout_logs (
    workout_session_id,
    user_id,
    duration_minutes,
    total_volume_kg,
    completed_sets,
    completed_exercises,
    session_rpe,
    notes,
    completed_at
  )
  values (
    p_session_id,
    v_user_id,
    v_duration,
    v_total_volume,
    v_completed_sets,
    v_completed_exercises,
    p_session_rpe,
    nullif(btrim(p_notes), ''),
    now()
  )
  on conflict (workout_session_id)
  do update
  set
    duration_minutes = excluded.duration_minutes,
    total_volume_kg = excluded.total_volume_kg,
    completed_sets = excluded.completed_sets,
    completed_exercises = excluded.completed_exercises,
    session_rpe = excluded.session_rpe,
    notes = excluded.notes,
    completed_at = excluded.completed_at;

  return jsonb_build_object(
    'sessionId', p_session_id,
    'durationMinutes', v_duration,
    'totalVolumeKg', v_total_volume,
    'completedSets', v_completed_sets,
    'completedExercises', v_completed_exercises
  );
end;
$$;

revoke all on function public.finish_workout(
  uuid,
  text,
  numeric
) from public;

grant execute on function public.finish_workout(
  uuid,
  text,
  numeric
) to authenticated;

-- =========================================================
-- 16. PREVIOUS PERFORMANCE RPC
-- =========================================================

create or replace function public.get_previous_workout_performance(
  p_exercise_ids uuid[]
)
returns table (
  exercise_id uuid,
  performed_at timestamptz,
  sets jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest_exercise_sessions as (
    select distinct on (wse.exercise_id)
      wse.exercise_id,
      wse.id as session_exercise_id,
      ws.completed_at
    from public.workout_session_exercises as wse
    join public.workout_sessions as ws
      on ws.id = wse.workout_session_id
    where ws.user_id = (select auth.uid())
      and ws.session_state = 'completed'
      and wse.exercise_id = any(p_exercise_ids)
      and wse.is_skipped = false
    order by
      wse.exercise_id,
      ws.completed_at desc nulls last
  )
  select
    latest.exercise_id,
    latest.completed_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'setNumber', es.set_number,
          'weightKg', es.weight_kg,
          'reps', es.reps,
          'rir', es.rir,
          'rpe', es.rpe
        )
        order by es.set_number
      ) filter (where es.completed = true),
      '[]'::jsonb
    )
  from latest_exercise_sessions as latest
  left join public.exercise_sets as es
    on es.session_exercise_id = latest.session_exercise_id
  group by
    latest.exercise_id,
    latest.completed_at;
$$;

revoke all on function public.get_previous_workout_performance(uuid[])
  from public;

grant execute on function public.get_previous_workout_performance(uuid[])
  to authenticated;

-- =========================================================
-- 17. PROGRESSIVE OVERLOAD RECOMMENDATIONS
-- =========================================================

create or replace function public.get_workout_recommendations(
  p_limit integer default 8
)
returns table (
  exercise_id uuid,
  exercise_name text,
  last_weight_kg numeric,
  suggested_weight_kg numeric,
  recommendation_action text,
  reason text,
  last_performed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with performances as (
    select
      wse.id as session_exercise_id,
      wse.exercise_id,
      wse.display_name,
      wse.target_sets,
      wse.target_rep_min,
      wse.target_rep_max,
      coalesce(wse.target_rir, 2) as target_rir,
      ws.completed_at,

      count(*) filter (
        where es.completed = true
      ) as completed_sets,

      max(es.weight_kg) filter (
        where es.completed = true
      ) as last_weight,

      min(es.reps) filter (
        where es.completed = true
      ) as minimum_reps,

      bool_and(
        es.reps >= wse.target_rep_max
      ) filter (
        where es.completed = true
      ) as all_sets_hit_top_range,

      avg(es.rir) filter (
        where es.completed = true
          and es.rir is not null
      ) as average_rir

    from public.workout_session_exercises as wse
    join public.workout_sessions as ws
      on ws.id = wse.workout_session_id
    left join public.exercise_sets as es
      on es.session_exercise_id = wse.id

    where ws.user_id = (select auth.uid())
      and ws.session_state = 'completed'
      and wse.is_skipped = false

    group by
      wse.id,
      wse.exercise_id,
      wse.display_name,
      wse.target_sets,
      wse.target_rep_min,
      wse.target_rep_max,
      wse.target_rir,
      ws.completed_at
  ),

  ranked as (
    select
      performances.*,
      row_number() over (
        partition by exercise_id
        order by completed_at desc
      ) as performance_rank
    from performances
  )

  select
    ranked.exercise_id,
    ranked.display_name,

    ranked.last_weight,

    case
      when ranked.last_weight is null then null

      when ranked.completed_sets < ranked.target_sets
        then ranked.last_weight

      when ranked.all_sets_hit_top_range = true
        and coalesce(
          ranked.average_rir,
          ranked.target_rir
        ) >= ranked.target_rir
        then round(
          ranked.last_weight * 1.025 * 2
        ) / 2

      when ranked.minimum_reps < ranked.target_rep_min
        or coalesce(ranked.average_rir, 2) < 1
        then round(
          ranked.last_weight * 0.95 * 2
        ) / 2

      else ranked.last_weight
    end,

    case
      when ranked.completed_sets < ranked.target_sets
        then 'repeat'

      when ranked.all_sets_hit_top_range = true
        and coalesce(
          ranked.average_rir,
          ranked.target_rir
        ) >= ranked.target_rir
        then 'increase'

      when ranked.minimum_reps < ranked.target_rep_min
        or coalesce(ranked.average_rir, 2) < 1
        then 'reduce'

      else 'hold'
    end,

    case
      when ranked.completed_sets < ranked.target_sets
        then 'Complete every prescribed set before increasing load.'

      when ranked.all_sets_hit_top_range = true
        and coalesce(
          ranked.average_rir,
          ranked.target_rir
        ) >= ranked.target_rir
        then 'All working sets reached the top of the rep range with sufficient reps in reserve.'

      when ranked.minimum_reps < ranked.target_rep_min
        or coalesce(ranked.average_rir, 2) < 1
        then 'Performance fell below the target range or the previous load was too close to failure.'

      else 'Keep the current load and build more reps before increasing.'
    end,

    ranked.completed_at

  from ranked
  where ranked.performance_rank = 1

  order by ranked.completed_at desc
  limit greatest(1, least(p_limit, 30));
$$;

revoke all on function public.get_workout_recommendations(integer)
  from public;

grant execute on function public.get_workout_recommendations(integer)
  to authenticated;

-- =========================================================
-- 18. PRIVILEGES
-- =========================================================

revoke all on table public.exercise_library
  from anon, authenticated;

revoke all on table public.workout_plans
  from anon, authenticated;

revoke all on table public.workout_days
  from anon, authenticated;

revoke all on table public.workout_exercises
  from anon, authenticated;

revoke all on table public.workout_sessions
  from anon, authenticated;

revoke all on table public.workout_session_exercises
  from anon, authenticated;

revoke all on table public.exercise_sets
  from anon, authenticated;

revoke all on table public.workout_logs
  from anon, authenticated;

revoke all on table public.personal_records
  from anon, authenticated;

grant select, insert, update, delete
  on public.exercise_library
  to authenticated;

grant select, insert, update, delete
  on public.workout_plans
  to authenticated;

grant select, insert, update, delete
  on public.workout_days
  to authenticated;

grant select, insert, update, delete
  on public.workout_exercises
  to authenticated;

grant select, insert, update, delete
  on public.workout_sessions
  to authenticated;

grant select, insert, update, delete
  on public.workout_session_exercises
  to authenticated;

grant select, insert, update, delete
  on public.exercise_sets
  to authenticated;

grant select, insert, update, delete
  on public.workout_logs
  to authenticated;

grant select
  on public.personal_records
  to authenticated;

-- =========================================================
-- 19. ROW LEVEL SECURITY
-- =========================================================

alter table public.exercise_library enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.workout_logs enable row level security;
alter table public.personal_records enable row level security;

-- Exercise library

drop policy if exists exercise_library_select_policy
  on public.exercise_library;

create policy exercise_library_select_policy
on public.exercise_library
for select
to authenticated
using (
  owner_id is null
  or owner_id = (select auth.uid())
  or public.is_admin()
);

drop policy if exists exercise_library_insert_policy
  on public.exercise_library;

create policy exercise_library_insert_policy
on public.exercise_library
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  or public.is_admin()
);

drop policy if exists exercise_library_update_policy
  on public.exercise_library;

create policy exercise_library_update_policy
on public.exercise_library
for update
to authenticated
using (
  owner_id = (select auth.uid())
  or public.is_admin()
)
with check (
  owner_id = (select auth.uid())
  or public.is_admin()
);

drop policy if exists exercise_library_delete_policy
  on public.exercise_library;

create policy exercise_library_delete_policy
on public.exercise_library
for delete
to authenticated
using (
  owner_id = (select auth.uid())
  or public.is_admin()
);

-- Workout plans

drop policy if exists workout_plans_select_policy
  on public.workout_plans;

create policy workout_plans_select_policy
on public.workout_plans
for select
to authenticated
using (
  public.can_manage_workout_client(client_id)
);

drop policy if exists workout_plans_insert_policy
  on public.workout_plans;

create policy workout_plans_insert_policy
on public.workout_plans
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_manage_workout_client(client_id)
);

drop policy if exists workout_plans_update_policy
  on public.workout_plans;

create policy workout_plans_update_policy
on public.workout_plans
for update
to authenticated
using (
  public.can_manage_workout_client(client_id)
)
with check (
  public.can_manage_workout_client(client_id)
);

drop policy if exists workout_plans_delete_policy
  on public.workout_plans;

create policy workout_plans_delete_policy
on public.workout_plans
for delete
to authenticated
using (
  public.can_manage_workout_client(client_id)
);

-- Workout days

drop policy if exists workout_days_all_policy
  on public.workout_days;

create policy workout_days_all_policy
on public.workout_days
for all
to authenticated
using (
  exists (
    select 1
    from public.workout_plans as wp
    where wp.id = workout_days.workout_plan_id
      and public.can_manage_workout_client(wp.client_id)
  )
)
with check (
  exists (
    select 1
    from public.workout_plans as wp
    where wp.id = workout_days.workout_plan_id
      and public.can_manage_workout_client(wp.client_id)
  )
);

-- Workout exercises

drop policy if exists workout_exercises_all_policy
  on public.workout_exercises;

create policy workout_exercises_all_policy
on public.workout_exercises
for all
to authenticated
using (
  exists (
    select 1
    from public.workout_days as wd
    join public.workout_plans as wp
      on wp.id = wd.workout_plan_id
    where wd.id = workout_exercises.workout_day_id
      and public.can_manage_workout_client(wp.client_id)
  )
)
with check (
  exists (
    select 1
    from public.workout_days as wd
    join public.workout_plans as wp
      on wp.id = wd.workout_plan_id
    where wd.id = workout_exercises.workout_day_id
      and public.can_manage_workout_client(wp.client_id)
  )
);

-- Sessions

drop policy if exists workout_sessions_all_policy
  on public.workout_sessions;

create policy workout_sessions_all_policy
on public.workout_sessions
for all
to authenticated
using (
  public.can_manage_workout_client(user_id)
)
with check (
  public.can_manage_workout_client(user_id)
);

-- Session exercises

drop policy if exists workout_session_exercises_all_policy
  on public.workout_session_exercises;

create policy workout_session_exercises_all_policy
on public.workout_session_exercises
for all
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions as ws
    where ws.id = workout_session_exercises.workout_session_id
      and public.can_manage_workout_client(ws.user_id)
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions as ws
    where ws.id = workout_session_exercises.workout_session_id
      and public.can_manage_workout_client(ws.user_id)
  )
);

-- Exercise sets

drop policy if exists exercise_sets_all_policy
  on public.exercise_sets;

create policy exercise_sets_all_policy
on public.exercise_sets
for all
to authenticated
using (
  exists (
    select 1
    from public.workout_session_exercises as wse
    join public.workout_sessions as ws
      on ws.id = wse.workout_session_id
    where wse.id = exercise_sets.session_exercise_id
      and public.can_manage_workout_client(ws.user_id)
  )
)
with check (
  exists (
    select 1
    from public.workout_session_exercises as wse
    join public.workout_sessions as ws
      on ws.id = wse.workout_session_id
    where wse.id = exercise_sets.session_exercise_id
      and public.can_manage_workout_client(ws.user_id)
  )
);

-- Logs

drop policy if exists workout_logs_all_policy
  on public.workout_logs;

create policy workout_logs_all_policy
on public.workout_logs
for all
to authenticated
using (
  public.can_manage_workout_client(user_id)
)
with check (
  public.can_manage_workout_client(user_id)
);

-- Personal records

drop policy if exists personal_records_select_policy
  on public.personal_records;

create policy personal_records_select_policy
on public.personal_records
for select
to authenticated
using (
  public.can_manage_workout_client(user_id)
);

-- =========================================================
-- 20. VERIFIED EXERCISE SEED
-- =========================================================

insert into public.exercise_library (
  owner_id,
  slug,
  name,
  description,
  primary_muscle,
  secondary_muscles,
  equipment,
  movement_pattern,
  difficulty,
  instructions,
  cues,
  limitations,
  is_verified,
  is_active
)
values
(
  null,
  'barbell-bench-press',
  'Barbell Bench Press',
  'Horizontal pressing movement for chest strength and hypertrophy.',
  'chest',
  array['front_delts', 'triceps'],
  'barbell',
  'horizontal_push',
  'intermediate',
  array[
    'Set your eyes beneath the bar.',
    'Retract and depress the shoulder blades.',
    'Lower the bar under control toward the lower chest.',
    'Press upward while maintaining upper-back tension.'
  ],
  array[
    'Chest tall.',
    'Wrists stacked over elbows.',
    'Drive your feet into the floor.'
  ],
  array[
    'Use an appropriate spotter or safety arms.',
    'Reduce range if shoulder pain occurs.'
  ],
  true,
  true
),
(
  null,
  'incline-dumbbell-press',
  'Incline Dumbbell Press',
  'Incline press emphasizing the upper chest.',
  'chest',
  array['front_delts', 'triceps'],
  'dumbbell',
  'incline_push',
  'beginner',
  array[
    'Set the bench to a moderate incline.',
    'Begin with dumbbells beside the upper chest.',
    'Press upward without allowing the shoulders to roll forward.',
    'Lower with control.'
  ],
  array[
    'Keep shoulder blades stable.',
    'Press up and slightly inward.'
  ],
  array[
    'Avoid an excessively steep bench angle.'
  ],
  true,
  true
),
(
  null,
  'cable-fly',
  'Cable Fly',
  'Chest isolation exercise using continuous cable resistance.',
  'chest',
  array['front_delts'],
  'cable',
  'horizontal_adduction',
  'beginner',
  array[
    'Set the handles near chest height.',
    'Maintain a small bend in the elbows.',
    'Bring the hands together in front of the chest.',
    'Return until a controlled chest stretch is reached.'
  ],
  array[
    'Hug around the rib cage.',
    'Do not turn the movement into a press.'
  ],
  array[
    'Use a pain-free shoulder range.'
  ],
  true,
  true
),
(
  null,
  'overhead-press',
  'Barbell Overhead Press',
  'Vertical press for shoulder and triceps strength.',
  'shoulders',
  array['triceps', 'upper_chest'],
  'barbell',
  'vertical_push',
  'intermediate',
  array[
    'Start with the bar near the upper chest.',
    'Brace the trunk and glutes.',
    'Press the bar overhead.',
    'Finish with the bar stacked over the mid-foot.'
  ],
  array[
    'Ribs down.',
    'Push your head through after the bar passes.'
  ],
  array[
    'Avoid excessive lower-back extension.'
  ],
  true,
  true
),
(
  null,
  'dumbbell-lateral-raise',
  'Dumbbell Lateral Raise',
  'Isolation exercise targeting the side deltoids.',
  'side_delts',
  array['upper_traps'],
  'dumbbell',
  'shoulder_abduction',
  'beginner',
  array[
    'Hold the dumbbells beside the body.',
    'Raise the arms out to the sides.',
    'Stop around shoulder height.',
    'Lower slowly.'
  ],
  array[
    'Lead with the elbows.',
    'Keep the traps relaxed.'
  ],
  array[
    'Use light loads and controlled repetitions.'
  ],
  true,
  true
),
(
  null,
  'cable-lateral-raise',
  'Cable Lateral Raise',
  'Cable variation for continuous side-delt tension.',
  'side_delts',
  array['upper_traps'],
  'cable',
  'shoulder_abduction',
  'beginner',
  array[
    'Stand beside a low cable.',
    'Raise the working arm away from the body.',
    'Pause briefly near shoulder height.',
    'Lower under control.'
  ],
  array[
    'Keep the elbow softly bent.',
    'Move through the shoulder rather than swinging.'
  ],
  array[
    'Reduce range if shoulder irritation occurs.'
  ],
  true,
  true
),
(
  null,
  'pull-up',
  'Pull-Up',
  'Vertical pulling exercise for the lats and upper back.',
  'lats',
  array['biceps', 'upper_back'],
  'bodyweight',
  'vertical_pull',
  'intermediate',
  array[
    'Begin from a controlled hang.',
    'Pull the elbows toward the ribs.',
    'Bring the upper chest toward the bar.',
    'Lower without losing shoulder control.'
  ],
  array[
    'Drive elbows down.',
    'Avoid excessive swinging.'
  ],
  array[
    'Use assistance when full repetitions cannot be controlled.'
  ],
  true,
  true
),
(
  null,
  'lat-pulldown',
  'Lat Pulldown',
  'Machine-based vertical pull targeting the lats.',
  'lats',
  array['biceps', 'upper_back'],
  'cable',
  'vertical_pull',
  'beginner',
  array[
    'Secure the thighs beneath the pad.',
    'Pull the bar toward the upper chest.',
    'Drive the elbows down.',
    'Return to a controlled overhead stretch.'
  ],
  array[
    'Keep the chest tall.',
    'Do not pull behind the neck.'
  ],
  array[
    'Avoid excessive torso momentum.'
  ],
  true,
  true
),
(
  null,
  'chest-supported-row',
  'Chest-Supported Row',
  'Horizontal pull emphasizing the upper back with reduced lower-back fatigue.',
  'upper_back',
  array['lats', 'rear_delts', 'biceps'],
  'machine',
  'horizontal_pull',
  'beginner',
  array[
    'Place the chest firmly against the pad.',
    'Pull the handles toward the torso.',
    'Pause with the shoulder blades retracted.',
    'Return under control.'
  ],
  array[
    'Drive elbows behind you.',
    'Keep the chest against the pad.'
  ],
  array[
    'Adjust the seat to maintain a comfortable shoulder path.'
  ],
  true,
  true
),
(
  null,
  'seated-cable-row',
  'Seated Cable Row',
  'Horizontal cable pull for lats and upper back.',
  'upper_back',
  array['lats', 'rear_delts', 'biceps'],
  'cable',
  'horizontal_pull',
  'beginner',
  array[
    'Sit tall with the spine controlled.',
    'Pull the handle toward the lower ribs.',
    'Pause briefly.',
    'Reach forward without collapsing the torso.'
  ],
  array[
    'Move the elbows, not the lower back.',
    'Keep ribs controlled.'
  ],
  array[
    'Avoid excessive spinal rocking.'
  ],
  true,
  true
),
(
  null,
  'face-pull',
  'Cable Face Pull',
  'Upper-back and rear-delt exercise.',
  'rear_delts',
  array['upper_back', 'external_rotators'],
  'cable',
  'horizontal_pull',
  'beginner',
  array[
    'Set the cable around face height.',
    'Pull the rope toward the forehead.',
    'Separate the rope ends.',
    'Return slowly.'
  ],
  array[
    'Finish with hands beside the face.',
    'Keep shoulders away from the ears.'
  ],
  array[
    'Use light resistance and controlled motion.'
  ],
  true,
  true
),
(
  null,
  'barbell-curl',
  'Barbell Curl',
  'Elbow-flexion exercise for the biceps.',
  'biceps',
  array['forearms'],
  'barbell',
  'elbow_flexion',
  'beginner',
  array[
    'Stand with the elbows near the torso.',
    'Curl the bar without swinging.',
    'Squeeze the biceps.',
    'Lower under control.'
  ],
  array[
    'Keep elbows still.',
    'Avoid leaning backward.'
  ],
  array[
    'Use an EZ bar if straight-bar grip causes wrist discomfort.'
  ],
  true,
  true
),
(
  null,
  'rope-triceps-pushdown',
  'Rope Triceps Pushdown',
  'Cable exercise targeting the triceps.',
  'triceps',
  array[]::text[],
  'cable',
  'elbow_extension',
  'beginner',
  array[
    'Keep the elbows near the torso.',
    'Extend the elbows until the arms are straight.',
    'Separate the rope at the bottom.',
    'Return under control.'
  ],
  array[
    'Move only the forearms.',
    'Do not allow the shoulders to roll forward.'
  ],
  array[
    'Use a pain-free elbow range.'
  ],
  true,
  true
),
(
  null,
  'back-squat',
  'Barbell Back Squat',
  'Compound lower-body movement emphasizing the quadriceps and glutes.',
  'quadriceps',
  array['glutes', 'adductors', 'hamstrings'],
  'barbell',
  'squat',
  'intermediate',
  array[
    'Set the bar securely across the upper back.',
    'Brace before descending.',
    'Descend with the knees tracking over the feet.',
    'Drive upward while maintaining balance.'
  ],
  array[
    'Brace hard.',
    'Keep pressure through the whole foot.',
    'Drive the floor away.'
  ],
  array[
    'Use safeties and an appropriate depth.',
    'Modify when knee, hip or back pain occurs.'
  ],
  true,
  true
),
(
  null,
  'leg-press',
  'Leg Press',
  'Machine-based compound exercise for the quadriceps and glutes.',
  'quadriceps',
  array['glutes', 'hamstrings'],
  'machine',
  'squat',
  'beginner',
  array[
    'Place the feet securely on the platform.',
    'Lower the sled while maintaining pelvic control.',
    'Press through the full foot.',
    'Avoid forcefully locking the knees.'
  ],
  array[
    'Keep the lower back against the pad.',
    'Control the bottom position.'
  ],
  array[
    'Do not use a range that causes the pelvis to roll.'
  ],
  true,
  true
),
(
  null,
  'romanian-deadlift',
  'Romanian Deadlift',
  'Hip-hinge exercise targeting the hamstrings and glutes.',
  'hamstrings',
  array['glutes', 'erectors'],
  'barbell',
  'hinge',
  'intermediate',
  array[
    'Begin standing with the bar near the thighs.',
    'Push the hips backward.',
    'Keep the bar close to the legs.',
    'Stand by driving the hips forward.'
  ],
  array[
    'Soft knees.',
    'Long spine.',
    'Feel the hamstrings stretch.'
  ],
  array[
    'Do not chase depth by rounding the lower back.'
  ],
  true,
  true
),
(
  null,
  'seated-leg-curl',
  'Seated Leg Curl',
  'Knee-flexion exercise targeting the hamstrings.',
  'hamstrings',
  array[]::text[],
  'machine',
  'knee_flexion',
  'beginner',
  array[
    'Align the machine pivot with the knee.',
    'Curl the pad downward.',
    'Pause in the shortened position.',
    'Return slowly.'
  ],
  array[
    'Keep the hips against the seat.',
    'Control the eccentric.'
  ],
  array[
    'Adjust the machine carefully to the leg length.'
  ],
  true,
  true
),
(
  null,
  'leg-extension',
  'Leg Extension',
  'Knee-extension exercise targeting the quadriceps.',
  'quadriceps',
  array[]::text[],
  'machine',
  'knee_extension',
  'beginner',
  array[
    'Align the machine pivot with the knee.',
    'Extend the knees under control.',
    'Pause briefly.',
    'Lower slowly.'
  ],
  array[
    'Keep the hips on the seat.',
    'Use a controlled range.'
  ],
  array[
    'Reduce load or range if knee discomfort occurs.'
  ],
  true,
  true
),
(
  null,
  'standing-calf-raise',
  'Standing Calf Raise',
  'Ankle plantar-flexion exercise emphasizing the calves.',
  'calves',
  array[]::text[],
  'machine',
  'plantar_flexion',
  'beginner',
  array[
    'Lower the heels into a controlled stretch.',
    'Rise onto the balls of the feet.',
    'Pause at the top.',
    'Lower slowly.'
  ],
  array[
    'Use a full controlled range.',
    'Avoid bouncing.'
  ],
  array[
    'Use support to maintain balance.'
  ],
  true,
  true
)
on conflict do nothing;

commit;