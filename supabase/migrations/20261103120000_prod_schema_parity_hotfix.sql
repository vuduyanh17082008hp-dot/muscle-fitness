-- Production schema parity hotfix (2026-11-03).
--
-- The hosted project was built from an older workout schema (20260805090000
-- shape) and received emergency compatibility migrations on 2026-11-03. The
-- canonical workout RPCs (start_workout / finish_workout /
-- apply_recovery_workout_proposal) and account save assume the
-- 20260804190000 shape, so on hosted they failed on:
--   * workout_session_exercises.exercise_name   NOT NULL, never written by the RPCs
--   * exercise_sets.workout_session_id /
--     exercise_sets.workout_session_exercise_id NOT NULL, never written by the RPCs
--   * workout_session_exercises.exercise_id FK -> workout_exercises (RPCs store exercise_library ids)
--   * workout_session_exercises.replaced_from_exercise_id, workout_logs, body_weight_entries missing
--   * profiles.gender / fitness_profiles.goal are text there, not enums (save_account_profile casts)
--
-- Every block is guarded: on a database built from this repo's migrations it is a no-op
-- except save_account_profile, which is replaced by an equivalent that casts through the
-- column types instead of naming the enum types. Additive only: no column, row or table
-- is dropped. The one constraint replaced (session-exercise FK) is re-pointed only while
-- it still references workout_exercises.

-- 1. Legacy NOT NULL columns on session tables are derived from the canonical ones.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'workout_session_exercises' and column_name = 'exercise_name') then
    create or replace function public.workout_session_exercises_legacy_compat()
    returns trigger
    language plpgsql
    set search_path = ''
    as $f$
    begin
      if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then
        new.exercise_name := coalesce(
          nullif(btrim(new.display_name), ''),
          nullif(btrim(new.exercise_name), ''),
          (select el.name from public.exercise_library as el where el.id = new.exercise_id),
          'Exercise'
        );
      end if;
      if new.display_name is null then
        new.display_name := new.exercise_name;
      end if;
      return new;
    end;
    $f$;

    drop trigger if exists workout_session_exercises_legacy_compat on public.workout_session_exercises;
    create trigger workout_session_exercises_legacy_compat
      before insert or update on public.workout_session_exercises
      for each row execute function public.workout_session_exercises_legacy_compat();
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'exercise_sets' and column_name = 'workout_session_exercise_id') then
    create or replace function public.exercise_sets_legacy_compat()
    returns trigger
    language plpgsql
    set search_path = ''
    as $f$
    begin
      new.session_exercise_id := coalesce(new.session_exercise_id, new.workout_session_exercise_id);
      new.workout_session_exercise_id := coalesce(new.workout_session_exercise_id, new.session_exercise_id);
      if new.workout_session_id is null then
        select se.workout_session_id into new.workout_session_id
          from public.workout_session_exercises as se
         where se.id = new.session_exercise_id;
      end if;
      return new;
    end;
    $f$;

    drop trigger if exists exercise_sets_legacy_compat on public.exercise_sets;
    create trigger exercise_sets_legacy_compat
      before insert on public.exercise_sets
      for each row execute function public.exercise_sets_legacy_compat();
  end if;
end;
$$;

-- 2. Session exercises reference the exercise library, as every writer assumes.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'workout_session_exercises_exercise_id_fkey'
       and conrelid = 'public.workout_session_exercises'::regclass
       and confrelid = 'public.workout_exercises'::regclass
  ) then
    alter table public.workout_session_exercises drop constraint workout_session_exercises_exercise_id_fkey;
    alter table public.workout_session_exercises
      add constraint workout_session_exercises_exercise_id_fkey
      foreign key (exercise_id) references public.exercise_library(id) on delete restrict;
  end if;
end;
$$;

alter table public.workout_session_exercises
  add column if not exists replaced_from_exercise_id uuid references public.exercise_library(id) on delete set null;

-- 3. workout_logs (written by finish_workout), as in 20260804190000.
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null unique references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  duration_minutes integer not null default 0,
  total_volume_kg numeric(14,2) not null default 0,
  completed_sets integer not null default 0,
  completed_exercises integer not null default 0,
  session_rpe numeric(3,1),
  notes text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint workout_logs_duration_check check (duration_minutes between 0 and 1440),
  constraint workout_logs_session_rpe_check check (session_rpe is null or session_rpe between 1 and 10)
);
create index if not exists workout_logs_user_completed_idx on public.workout_logs(user_id, completed_at desc);
alter table public.workout_logs enable row level security;
revoke all on table public.workout_logs from anon, authenticated;
grant select, insert, update, delete on public.workout_logs to authenticated;
drop policy if exists workout_logs_all_policy on public.workout_logs;
create policy workout_logs_all_policy on public.workout_logs
  for all to authenticated
  using (public.can_manage_workout_client(user_id))
  with check (public.can_manage_workout_client(user_id));

-- 4. body_weight_entries (Nutrition weight log, calorie calibration), as in 20260804153000.
create table if not exists public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null,
  weight_kg numeric(6, 2) not null,
  source text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_weight_entries_user_date_key unique (user_id, logged_on),
  constraint body_weight_entries_weight_check check (weight_kg between 20 and 500),
  constraint body_weight_entries_source_check check (source in ('manual', 'onboarding', 'check_in', 'import'))
);
create index if not exists body_weight_entries_user_date_idx on public.body_weight_entries(user_id, logged_on desc);
drop trigger if exists body_weight_entries_set_updated_at on public.body_weight_entries;
create trigger body_weight_entries_set_updated_at
  before update on public.body_weight_entries
  for each row execute function public.set_updated_at();
alter table public.body_weight_entries enable row level security;
revoke all on table public.body_weight_entries from anon, authenticated;
grant select, insert, update, delete on public.body_weight_entries to authenticated;
drop policy if exists body_weight_entries_select_own on public.body_weight_entries;
drop policy if exists body_weight_entries_insert_own on public.body_weight_entries;
drop policy if exists body_weight_entries_update_own on public.body_weight_entries;
drop policy if exists body_weight_entries_delete_own on public.body_weight_entries;
create policy body_weight_entries_select_own on public.body_weight_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy body_weight_entries_insert_own on public.body_weight_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy body_weight_entries_update_own on public.body_weight_entries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy body_weight_entries_delete_own on public.body_weight_entries
  for delete to authenticated using (user_id = (select auth.uid()));

-- 5. save_account_profile (20261011120000) without naming enum types: jsonb_populate_record
--    casts each field to the column's own type (enum here, text on hosted), so an invalid
--    value still raises 22P02 / 23514. Same contract: SECURITY INVOKER, one transaction.
create or replace function public.save_account_profile(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := nullif(auth.jwt() ->> 'email', '');
  v_profile public.profiles;
  v_fitness public.fitness_profiles;
begin
  if v_user is null then
    raise exception 'ACTION_FORBIDDEN' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_profile := jsonb_populate_record(null::public.profiles, p_payload);
  v_fitness := jsonb_populate_record(null::public.fitness_profiles, p_payload);

  insert into public.profiles (user_id, email, full_name, username, phone, date_of_birth, gender, timezone)
  values (v_user, v_email, v_profile.full_name, v_profile.username, v_profile.phone,
          v_profile.date_of_birth, v_profile.gender, v_profile.timezone)
  on conflict (user_id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = excluded.full_name,
    username = excluded.username,
    phone = excluded.phone,
    date_of_birth = excluded.date_of_birth,
    gender = excluded.gender,
    timezone = excluded.timezone;

  if v_fitness.height_cm is not null or v_fitness.weight_kg is not null or v_fitness.goal is not null
     or exists (select 1 from public.fitness_profiles where user_id = v_user) then
    insert into public.fitness_profiles (user_id, height_cm, weight_kg, goal)
    values (v_user, v_fitness.height_cm, v_fitness.weight_kg, v_fitness.goal)
    on conflict (user_id) do update set
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      goal = excluded.goal;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.save_account_profile(jsonb) from public, anon;
grant execute on function public.save_account_profile(jsonb) to authenticated;

notify pgrst, 'reload schema';
