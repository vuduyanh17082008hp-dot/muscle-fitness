begin;

create extension if not exists pgcrypto;

-- =========================================================
-- UPDATED_AT FUNCTION
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- PERMISSION FUNCTION
-- User can manage:
-- 1. Their own workout
-- 2. A client assigned to them
-- 3. Any client when they are an admin
-- =========================================================

create or replace function public.can_manage_workout_client(
  target_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = target_client_id

    or exists (
      select 1
      from public.coach_clients as cc
      where cc.coach_id = auth.uid()
        and cc.client_id = target_client_id
    )

    or exists (
      select 1
      from public.user_roles as ur
      where ur.user_id = auth.uid()
        and ur.role::text = 'admin'
    ),

    false
  );
$$;

revoke all
on function public.can_manage_workout_client(uuid)
from public;

grant execute
on function public.can_manage_workout_client(uuid)
to authenticated;

-- =========================================================
-- WORKOUT PLANS
-- =========================================================

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null
    references auth.users(id)
    on delete cascade,

  created_by uuid not null
    references auth.users(id)
    on delete restrict,

  name text not null
    check (
      char_length(trim(name)) between 2 and 120
    ),

  description text,

  goal text,

  status text not null default 'draft'
    check (
      status in ('draft', 'active', 'archived')
    ),

  weeks integer not null default 4
    check (
      weeks between 1 and 52
    ),

  days_per_week integer not null default 3
    check (
      days_per_week between 1 and 7
    ),

  session_duration_minutes integer not null default 60
    check (
      session_duration_minutes between 15 and 300
    ),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

create index if not exists workout_plans_client_id_idx
on public.workout_plans(client_id);

create index if not exists workout_plans_created_by_idx
on public.workout_plans(created_by);

create index if not exists workout_plans_status_idx
on public.workout_plans(status);

drop trigger if exists workout_plans_set_updated_at
on public.workout_plans;

create trigger workout_plans_set_updated_at
before update
on public.workout_plans
for each row
execute function public.set_updated_at();

-- =========================================================
-- WORKOUT DAYS
-- =========================================================

create table if not exists public.workout_days (
  id uuid primary key default gen_random_uuid(),

  workout_plan_id uuid not null
    references public.workout_plans(id)
    on delete cascade,

  day_number integer not null
    check (
      day_number between 1 and 7
    ),

  name text not null
    check (
      char_length(trim(name)) between 2 and 120
    ),

  focus text,

  notes text,

  rest_day boolean not null default false,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint workout_days_plan_day_unique
    unique (workout_plan_id, day_number)
);

create index if not exists workout_days_plan_id_idx
on public.workout_days(workout_plan_id);

drop trigger if exists workout_days_set_updated_at
on public.workout_days;

create trigger workout_days_set_updated_at
before update
on public.workout_days
for each row
execute function public.set_updated_at();

-- =========================================================
-- WORKOUT EXERCISES
-- exercise_id is optional so custom exercises can still work.
-- =========================================================

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),

  workout_day_id uuid not null
    references public.workout_days(id)
    on delete cascade,

  exercise_id uuid,

  exercise_name text not null
    check (
      char_length(trim(exercise_name)) between 2 and 160
    ),

  exercise_order integer not null default 1
    check (
      exercise_order between 1 and 100
    ),

  target_sets integer not null default 3
    check (
      target_sets between 1 and 20
    ),

  rep_min integer not null default 8
    check (
      rep_min between 1 and 100
    ),

  rep_max integer not null default 12
    check (
      rep_max between 1 and 100
    ),

  rest_seconds integer not null default 90
    check (
      rest_seconds between 0 and 900
    ),

  tempo text,

  rir integer
    check (
      rir is null
      or rir between 0 and 5
    ),

  notes text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint workout_exercises_rep_range_check
    check (rep_max >= rep_min),

  constraint workout_exercises_day_order_unique
    unique (workout_day_id, exercise_order)
);

create index if not exists workout_exercises_day_id_idx
on public.workout_exercises(workout_day_id);

create index if not exists workout_exercises_exercise_id_idx
on public.workout_exercises(exercise_id);

drop trigger if exists workout_exercises_set_updated_at
on public.workout_exercises;

create trigger workout_exercises_set_updated_at
before update
on public.workout_exercises
for each row
execute function public.set_updated_at();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.workout_plans
enable row level security;

alter table public.workout_days
enable row level security;

alter table public.workout_exercises
enable row level security;

-- =========================================================
-- WORKOUT PLAN POLICIES
-- =========================================================

drop policy if exists "workout_plans_select"
on public.workout_plans;

create policy "workout_plans_select"
on public.workout_plans
for select
to authenticated
using (
  public.can_manage_workout_client(client_id)
);

drop policy if exists "workout_plans_insert"
on public.workout_plans;

create policy "workout_plans_insert"
on public.workout_plans
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_manage_workout_client(client_id)
);

drop policy if exists "workout_plans_update"
on public.workout_plans;

create policy "workout_plans_update"
on public.workout_plans
for update
to authenticated
using (
  public.can_manage_workout_client(client_id)
)
with check (
  public.can_manage_workout_client(client_id)
);

drop policy if exists "workout_plans_delete"
on public.workout_plans;

create policy "workout_plans_delete"
on public.workout_plans
for delete
to authenticated
using (
  public.can_manage_workout_client(client_id)
);

-- =========================================================
-- WORKOUT DAY POLICIES
-- =========================================================

drop policy if exists "workout_days_select"
on public.workout_days;

create policy "workout_days_select"
on public.workout_days
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_plans as wp
    where wp.id = workout_days.workout_plan_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
);

drop policy if exists "workout_days_insert"
on public.workout_days;

create policy "workout_days_insert"
on public.workout_days
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_plans as wp
    where wp.id = workout_days.workout_plan_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
);

drop policy if exists "workout_days_update"
on public.workout_days;

create policy "workout_days_update"
on public.workout_days
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_plans as wp
    where wp.id = workout_days.workout_plan_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
)
with check (
  exists (
    select 1
    from public.workout_plans as wp
    where wp.id = workout_days.workout_plan_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
);

drop policy if exists "workout_days_delete"
on public.workout_days;

create policy "workout_days_delete"
on public.workout_days
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_plans as wp
    where wp.id = workout_days.workout_plan_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
);

-- =========================================================
-- WORKOUT EXERCISE POLICIES
-- =========================================================

drop policy if exists "workout_exercises_select"
on public.workout_exercises;

create policy "workout_exercises_select"
on public.workout_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_days as wd
    join public.workout_plans as wp
      on wp.id = wd.workout_plan_id
    where wd.id = workout_exercises.workout_day_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
);

drop policy if exists "workout_exercises_insert"
on public.workout_exercises;

create policy "workout_exercises_insert"
on public.workout_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_days as wd
    join public.workout_plans as wp
      on wp.id = wd.workout_plan_id
    where wd.id = workout_exercises.workout_day_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
);

drop policy if exists "workout_exercises_update"
on public.workout_exercises;

create policy "workout_exercises_update"
on public.workout_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_days as wd
    join public.workout_plans as wp
      on wp.id = wd.workout_plan_id
    where wd.id = workout_exercises.workout_day_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
)
with check (
  exists (
    select 1
    from public.workout_days as wd
    join public.workout_plans as wp
      on wp.id = wd.workout_plan_id
    where wd.id = workout_exercises.workout_day_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
);

drop policy if exists "workout_exercises_delete"
on public.workout_exercises;

create policy "workout_exercises_delete"
on public.workout_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_days as wd
    join public.workout_plans as wp
      on wp.id = wd.workout_plan_id
    where wd.id = workout_exercises.workout_day_id
      and public.can_manage_workout_client(
        wp.client_id
      )
  )
);

grant select, insert, update, delete
on public.workout_plans
to authenticated;

grant select, insert, update, delete
on public.workout_days
to authenticated;

grant select, insert, update, delete
on public.workout_exercises
to authenticated;

commit;