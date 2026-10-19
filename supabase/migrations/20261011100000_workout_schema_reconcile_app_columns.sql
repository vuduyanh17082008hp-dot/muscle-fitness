-- TYPE-01 / WF-03A prerequisite: reconcile workout_days / workout_exercises with
-- the column shape the app reads and writes.
--
-- 20260804190000_project_09_workout_system.sql creates these tables with
-- day_order / target_rir / non-null exercise_id. 20260805090000_workout_system.sql
-- declares day_number / focus / rest_day / exercise_name / rir but only via
-- CREATE TABLE IF NOT EXISTS (a no-op), so a DB built from migrations never got them.
-- Purely additive: no column is dropped, renamed or retyped; existing rows are backfilled.
-- workout_plans.status ('paused' drift, SCHEMA-02) is intentionally NOT touched.

-- workout_days: day_number mirrors day_order (single source, cannot drift).
alter table public.workout_days
  add column if not exists day_number integer generated always as (day_order::integer) stored,
  add column if not exists focus text,
  add column if not exists rest_day boolean not null default false;

-- workout_exercises
alter table public.workout_exercises
  add column if not exists exercise_name text,
  add column if not exists rir integer
    constraint workout_exercises_rir_app_check check (rir is null or rir between 0 and 5);

-- Custom (non-library) exercises: keep the FK, allow NULL.
alter table public.workout_exercises
  alter column exercise_id drop not null;

update public.workout_exercises we
   set exercise_name = el.name
  from public.exercise_library el
 where we.exercise_id = el.id
   and we.exercise_name is null;

-- Fill exercise_name from the library when a writer (e.g. seed) omits it.
create or replace function public.workout_exercises_fill_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.exercise_name is null and new.exercise_id is not null then
    select name into new.exercise_name from public.exercise_library where id = new.exercise_id;
  end if;
  return new;
end;
$$;

drop trigger if exists workout_exercises_fill_name on public.workout_exercises;
create trigger workout_exercises_fill_name
  before insert on public.workout_exercises
  for each row execute function public.workout_exercises_fill_name();

alter table public.workout_exercises
  alter column exercise_name set not null;

notify pgrst, 'reload schema';
