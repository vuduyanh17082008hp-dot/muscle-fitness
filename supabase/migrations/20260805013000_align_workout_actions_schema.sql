-- Align workout schema with dashboard/workouts/actions.ts (Plan builder + player)

alter table if exists workout_plans
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists goal text,
  add column if not exists weeks int not null default 4,
  add column if not exists days_per_week int not null default 3,
  add column if not exists session_duration_minutes int not null default 60,
  add column if not exists status text not null default 'draft';

do $$ begin
  alter table workout_plans
    alter column description drop not null;
exception when undefined_column then null;
end $$;

do $$ begin
  alter table workout_plans
    alter column client_id set not null;
exception when others then null;
end $$;

alter table if exists workout_days
  add column if not exists day_number int,
  add column if not exists focus text,
  add column if not exists notes text,
  add column if not exists rest_day boolean not null default false;

update workout_days
set day_number = coalesce(day_number, greatest(day_order, 0) + 1)
where day_number is null;

do $$ begin
  alter table workout_days
    alter column day_number set not null;
exception when others then null;
end $$;

alter table if exists workout_exercises
  add column if not exists exercise_name text,
  add column if not exists target_sets int,
  add column if not exists rir int,
  add column if not exists notes text;

update workout_exercises
set
  exercise_name = coalesce(exercise_name, 'Exercise'),
  target_sets = coalesce(target_sets, sets, 3)
where exercise_name is null or target_sets is null;

do $$ begin
  alter table workout_exercises
    alter column exercise_name set not null;
exception when others then null;
end $$;

do $$ begin
  alter table workout_exercises
    alter column target_sets set not null;
exception when others then null;
end $$;

do $$ begin
  alter table workout_exercises
    alter column exercise_id drop not null;
exception when others then null;
end $$;

create unique index if not exists workout_days_plan_day_unique
  on workout_days (workout_plan_id, day_number);

create unique index if not exists workout_exercises_day_order_unique
  on workout_exercises (workout_day_id, exercise_order);

create or replace function public.can_manage_workout_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      auth.uid() = target_client_id
      or exists (
        select 1
        from public.coach_clients cc
        where cc.coach_id = auth.uid()
          and cc.client_id = target_client_id
          and cc.status = 'active'
      )
      or public.has_permission('can_manage_workout_client'::public.app_permission)
    );
$$;

grant execute on function public.can_manage_workout_client(uuid) to authenticated;
