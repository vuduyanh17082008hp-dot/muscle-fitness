begin;

-- =========================================================
-- INTERNAL SCHEMA
-- =========================================================

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- =========================================================
-- ENUMS
-- =========================================================

create type public.app_role as enum (
  'user',
  'coach',
  'admin'
);

create type public.gender_type as enum (
  'male',
  'female',
  'non_binary',
  'prefer_not_to_say'
);

create type public.fitness_goal as enum (
  'lose_fat',
  'build_muscle',
  'recomposition',
  'maintain',
  'improve_fitness'
);

create type public.activity_level as enum (
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'athlete'
);

create type public.training_experience as enum (
  'beginner',
  'intermediate',
  'advanced'
);

create type public.training_time as enum (
  'morning',
  'afternoon',
  'evening',
  'flexible'
);

-- =========================================================
-- TABLES
-- =========================================================

create table public.profiles (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  full_name text,
  avatar_url text,

  role public.app_role
    not null
    default 'user',

  date_of_birth date,
  gender public.gender_type,

  timezone text
    not null
    default 'UTC',

  onboarding_completed boolean
    not null
    default false,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint profiles_full_name_length
    check (
      full_name is null
      or char_length(full_name) between 1 and 100
    ),

  constraint profiles_timezone_length
    check (
      char_length(timezone) between 1 and 100
    )
);

create table public.fitness_profiles (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  height_cm numeric(5, 2),
  current_weight_kg numeric(6, 2),
  target_weight_kg numeric(6, 2),

  goal public.fitness_goal,
  activity_level public.activity_level,
  training_experience public.training_experience,

  training_days smallint,
  session_duration_minutes smallint,

  calorie_target integer,
  protein_target_g numeric(7, 2),
  carb_target_g numeric(7, 2),
  fat_target_g numeric(7, 2),

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint fitness_profiles_height_range
    check (
      height_cm is null
      or height_cm between 50 and 300
    ),

  constraint fitness_profiles_current_weight_range
    check (
      current_weight_kg is null
      or current_weight_kg between 20 and 500
    ),

  constraint fitness_profiles_target_weight_range
    check (
      target_weight_kg is null
      or target_weight_kg between 20 and 500
    ),

  constraint fitness_profiles_training_days_range
    check (
      training_days is null
      or training_days between 1 and 7
    ),

  constraint fitness_profiles_session_duration_range
    check (
      session_duration_minutes is null
      or session_duration_minutes between 15 and 360
    ),

  constraint fitness_profiles_calorie_target_range
    check (
      calorie_target is null
      or calorie_target between 800 and 10000
    ),

  constraint fitness_profiles_protein_target_range
    check (
      protein_target_g is null
      or protein_target_g between 0 and 1000
    ),

  constraint fitness_profiles_carb_target_range
    check (
      carb_target_g is null
      or carb_target_g between 0 and 1500
    ),

  constraint fitness_profiles_fat_target_range
    check (
      fat_target_g is null
      or fat_target_g between 0 and 500
    )
);

create table public.user_preferences (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  preferred_foods text[]
    not null
    default array[]::text[],

  excluded_foods text[]
    not null
    default array[]::text[],

  allergies text[]
    not null
    default array[]::text[],

  available_equipment text[]
    not null
    default array[]::text[],

  priority_muscles text[]
    not null
    default array[]::text[],

  preferred_training_time public.training_time
    not null
    default 'flexible',

  meals_per_day smallint
    not null
    default 3,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint user_preferences_meals_per_day_range
    check (
      meals_per_day between 1 and 10
    ),

  constraint user_preferences_preferred_foods_limit
    check (
      cardinality(preferred_foods) <= 50
    ),

  constraint user_preferences_excluded_foods_limit
    check (
      cardinality(excluded_foods) <= 50
    ),

  constraint user_preferences_allergies_limit
    check (
      cardinality(allergies) <= 50
    ),

  constraint user_preferences_equipment_limit
    check (
      cardinality(available_equipment) <= 100
    ),

  constraint user_preferences_priority_muscles_limit
    check (
      cardinality(priority_muscles) <= 30
    )
);

create table public.user_roles (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  role public.app_role
    not null
    default 'user',

  created_by uuid
    references auth.users (id)
    on delete set null,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now()
);

create table public.coach_clients (
  client_id uuid primary key
    references auth.users (id)
    on delete cascade,

  coach_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  assigned_by uuid
    references auth.users (id)
    on delete set null,

  assigned_at timestamptz
    not null
    default now(),

  constraint coach_clients_different_users
    check (
      coach_id <> client_id
    )
);

-- =========================================================
-- INDEXES
-- user_id/client_id primary keys already have indexes.
-- =========================================================

create index user_roles_role_idx
  on public.user_roles (role);

create index profiles_role_idx
  on public.profiles (role);

create index coach_clients_coach_id_idx
  on public.coach_clients (coach_id);

create index fitness_profiles_goal_idx
  on public.fitness_profiles (goal);

-- =========================================================
-- UPDATED_AT
-- =========================================================

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function private.set_updated_at();

create trigger fitness_profiles_set_updated_at
before update on public.fitness_profiles
for each row
execute function private.set_updated_at();

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row
execute function private.set_updated_at();

create trigger user_roles_set_updated_at
before update on public.user_roles
for each row
execute function private.set_updated_at();

-- =========================================================
-- AUTHORIZATION HELPERS
-- =========================================================

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'::public.app_role
  );
$$;

create or replace function private.is_assigned_coach(
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_clients as cc
    join public.user_roles as ur
      on ur.user_id = cc.coach_id
    where cc.coach_id = (select auth.uid())
      and cc.client_id = p_client_id
      and ur.role in (
        'coach'::public.app_role,
        'admin'::public.app_role
      )
  );
$$;

revoke all
on function private.is_admin()
from public;

revoke all
on function private.is_assigned_coach(uuid)
from public;

grant execute
on function private.is_admin()
to authenticated;

grant execute
on function private.is_assigned_coach(uuid)
to authenticated;

-- =========================================================
-- SYNCHRONIZE PROFILE ROLE
-- =========================================================

create or replace function private.sync_profile_role_from_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set role = new.role
  where user_id = new.user_id;

  return new;
end;
$$;

create trigger user_roles_sync_profile_role
after insert or update of role
on public.user_roles
for each row
execute function private.sync_profile_role_from_user_roles();

-- =========================================================
-- CREATE PROFILE AFTER SIGNUP
-- =========================================================

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_avatar_url text;
begin
  v_full_name := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        split_part(coalesce(new.email, ''), '@', 1)
      )
    ),
    ''
  );

  v_avatar_url := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture'
      )
    ),
    ''
  );

  insert into public.profiles (
    user_id,
    full_name,
    avatar_url
  )
  values (
    new.id,
    v_full_name,
    v_avatar_url
  )
  on conflict (user_id) do nothing;

  insert into public.fitness_profiles (
    user_id
  )
  values (
    new.id
  )
  on conflict (user_id) do nothing;

  insert into public.user_preferences (
    user_id
  )
  values (
    new.id
  )
  on conflict (user_id) do nothing;

  insert into public.user_roles (
    user_id,
    role,
    created_by
  )
  values (
    new.id,
    'user'::public.app_role,
    new.id
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all
on function private.handle_new_auth_user()
from public;

create trigger muscle_fitness_create_user_foundation
after insert
on auth.users
for each row
execute function private.handle_new_auth_user();

-- =========================================================
-- COMPLETE ONBOARDING RPC
-- =========================================================

create or replace function public.complete_onboarding(
  p_full_name text,
  p_date_of_birth date,
  p_gender public.gender_type,
  p_timezone text,
  p_height_cm numeric,
  p_current_weight_kg numeric,
  p_target_weight_kg numeric,
  p_goal public.fitness_goal,
  p_activity_level public.activity_level,
  p_training_experience public.training_experience,
  p_training_days smallint,
  p_session_duration_minutes smallint,
  p_calorie_target integer,
  p_protein_target_g numeric,
  p_carb_target_g numeric,
  p_fat_target_g numeric,
  p_preferred_foods text[],
  p_excluded_foods text[],
  p_allergies text[],
  p_available_equipment text[],
  p_priority_muscles text[],
  p_preferred_training_time public.training_time,
  p_meals_per_day smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Full name is required'
      using errcode = '22023';
  end if;

  if p_date_of_birth is null
    or p_date_of_birth > current_date
  then
    raise exception 'Date of birth is invalid'
      using errcode = '22023';
  end if;

  if p_timezone is null
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    )
  then
    raise exception 'Timezone is invalid'
      using errcode = '22023';
  end if;

  if p_height_cm is null
    or p_current_weight_kg is null
    or p_target_weight_kg is null
    or p_goal is null
    or p_activity_level is null
    or p_training_experience is null
    or p_training_days is null
    or p_session_duration_minutes is null
    or p_calorie_target is null
    or p_protein_target_g is null
    or p_carb_target_g is null
    or p_fat_target_g is null
    or p_gender is null
    or p_preferred_training_time is null
    or p_meals_per_day is null
  then
    raise exception 'Required onboarding fields are missing'
      using errcode = '22023';
  end if;

  update public.profiles
  set
    full_name = btrim(p_full_name),
    date_of_birth = p_date_of_birth,
    gender = p_gender,
    timezone = p_timezone
  where user_id = v_user_id;

  if not found then
    raise exception 'Profile does not exist for authenticated user'
      using errcode = '23503';
  end if;

  insert into public.fitness_profiles (
    user_id,
    height_cm,
    current_weight_kg,
    target_weight_kg,
    goal,
    activity_level,
    training_experience,
    training_days,
    session_duration_minutes,
    calorie_target,
    protein_target_g,
    carb_target_g,
    fat_target_g
  )
  values (
    v_user_id,
    p_height_cm,
    p_current_weight_kg,
    p_target_weight_kg,
    p_goal,
    p_activity_level,
    p_training_experience,
    p_training_days,
    p_session_duration_minutes,
    p_calorie_target,
    p_protein_target_g,
    p_carb_target_g,
    p_fat_target_g
  )
  on conflict (user_id) do update
  set
    height_cm = excluded.height_cm,
    current_weight_kg = excluded.current_weight_kg,
    target_weight_kg = excluded.target_weight_kg,
    goal = excluded.goal,
    activity_level = excluded.activity_level,
    training_experience = excluded.training_experience,
    training_days = excluded.training_days,
    session_duration_minutes = excluded.session_duration_minutes,
    calorie_target = excluded.calorie_target,
    protein_target_g = excluded.protein_target_g,
    carb_target_g = excluded.carb_target_g,
    fat_target_g = excluded.fat_target_g;

  insert into public.user_preferences (
    user_id,
    preferred_foods,
    excluded_foods,
    allergies,
    available_equipment,
    priority_muscles,
    preferred_training_time,
    meals_per_day
  )
  values (
    v_user_id,
    coalesce(p_preferred_foods, array[]::text[]),
    coalesce(p_excluded_foods, array[]::text[]),
    coalesce(p_allergies, array[]::text[]),
    coalesce(p_available_equipment, array[]::text[]),
    coalesce(p_priority_muscles, array[]::text[]),
    p_preferred_training_time,
    p_meals_per_day
  )
  on conflict (user_id) do update
  set
    preferred_foods = excluded.preferred_foods,
    excluded_foods = excluded.excluded_foods,
    allergies = excluded.allergies,
    available_equipment = excluded.available_equipment,
    priority_muscles = excluded.priority_muscles,
    preferred_training_time = excluded.preferred_training_time,
    meals_per_day = excluded.meals_per_day;

  update public.profiles
  set onboarding_completed = true
  where user_id = v_user_id;
end;
$$;

revoke all
on function public.complete_onboarding(
  text,
  date,
  public.gender_type,
  text,
  numeric,
  numeric,
  numeric,
  public.fitness_goal,
  public.activity_level,
  public.training_experience,
  smallint,
  smallint,
  integer,
  numeric,
  numeric,
  numeric,
  text[],
  text[],
  text[],
  text[],
  text[],
  public.training_time,
  smallint
)
from public;

grant execute
on function public.complete_onboarding(
  text,
  date,
  public.gender_type,
  text,
  numeric,
  numeric,
  numeric,
  public.fitness_goal,
  public.activity_level,
  public.training_experience,
  smallint,
  smallint,
  integer,
  numeric,
  numeric,
  numeric,
  text[],
  text[],
  text[],
  text[],
  text[],
  public.training_time,
  smallint
)
to authenticated;

-- =========================================================
-- FAST DASHBOARD READ
-- =========================================================

create or replace function public.get_user_foundation(
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid := (select auth.uid());

  v_target_id uuid := coalesce(
    p_user_id,
    (select auth.uid())
  );

  v_result jsonb;
begin
  if v_requester_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if v_target_id is null then
    raise exception 'Target user is required'
      using errcode = '22023';
  end if;

  if v_target_id <> v_requester_id
    and not private.is_admin()
    and not private.is_assigned_coach(v_target_id)
  then
    raise exception 'You do not have access to this user'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = v_target_id
  ) then
    raise exception 'User profile not found'
      using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'profile',
    (
      select to_jsonb(p)
      from public.profiles as p
      where p.user_id = v_target_id
    ),

    'fitnessProfile',
    (
      select to_jsonb(fp)
      from public.fitness_profiles as fp
      where fp.user_id = v_target_id
    ),

    'preferences',
    (
      select to_jsonb(up)
      from public.user_preferences as up
      where up.user_id = v_target_id
    ),

    'role',
    (
      select ur.role
      from public.user_roles as ur
      where ur.user_id = v_target_id
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- =========================================================
-- FAST COACH CLIENT LIST
-- =========================================================

create or replace function public.list_my_assigned_clients()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select role
  into v_role
  from public.user_roles
  where user_id = v_user_id;

  if v_role is null
    or v_role not in (
      'coach'::public.app_role,
      'admin'::public.app_role
    )
  then
    raise exception 'Coach access required'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assignment',
        to_jsonb(cc),

        'profile',
        to_jsonb(p),

        'fitnessProfile',
        to_jsonb(fp),

        'preferences',
        to_jsonb(up)
      )
      order by cc.assigned_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.coach_clients as cc

  join public.profiles as p
    on p.user_id = cc.client_id

  left join public.fitness_profiles as fp
    on fp.user_id = cc.client_id

  left join public.user_preferences as up
    on up.user_id = cc.client_id

  where cc.coach_id = v_user_id;

  return v_result;
end;
$$;

revoke all
on function public.get_user_foundation(uuid)
from public;

revoke all
on function public.list_my_assigned_clients()
from public;

grant execute
on function public.get_user_foundation(uuid)
to authenticated;

grant execute
on function public.list_my_assigned_clients()
to authenticated;

-- =========================================================
-- ADMIN RPCS
-- =========================================================

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required'
      using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid())
    and p_role <> 'admin'::public.app_role
  then
    raise exception 'You cannot remove your own admin role'
      using errcode = '42501';
  end if;

  insert into public.user_roles (
    user_id,
    role,
    created_by
  )
  values (
    p_user_id,
    p_role,
    (select auth.uid())
  )
  on conflict (user_id) do update
  set
    role = excluded.role,
    created_by = excluded.created_by;

  -- Security fix:
  -- A demoted coach immediately loses assigned clients.
  if p_role = 'user'::public.app_role then
    delete from public.coach_clients
    where coach_id = p_user_id;
  end if;
end;
$$;

create or replace function public.admin_assign_coach(
  p_coach_id uuid,
  p_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required'
      using errcode = '42501';
  end if;

  if p_coach_id = p_client_id then
    raise exception 'Coach and client must be different users'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.user_roles
    where user_id = p_coach_id
      and role in (
        'coach'::public.app_role,
        'admin'::public.app_role
      )
  ) then
    raise exception 'Selected user does not have coach role'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = p_client_id
  ) then
    raise exception 'Client profile does not exist'
      using errcode = '23503';
  end if;

  insert into public.coach_clients (
    client_id,
    coach_id,
    assigned_by
  )
  values (
    p_client_id,
    p_coach_id,
    (select auth.uid())
  )
  on conflict (client_id) do update
  set
    coach_id = excluded.coach_id,
    assigned_by = excluded.assigned_by,
    assigned_at = now();
end;
$$;

create or replace function public.admin_unassign_coach(
  p_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required'
      using errcode = '42501';
  end if;

  delete from public.coach_clients
  where client_id = p_client_id;
end;
$$;

revoke all
on function public.admin_set_user_role(
  uuid,
  public.app_role
)
from public;

revoke all
on function public.admin_assign_coach(
  uuid,
  uuid
)
from public;

revoke all
on function public.admin_unassign_coach(uuid)
from public;

grant execute
on function public.admin_set_user_role(
  uuid,
  public.app_role
)
to authenticated;

grant execute
on function public.admin_assign_coach(
  uuid,
  uuid
)
to authenticated;

grant execute
on function public.admin_unassign_coach(uuid)
to authenticated;

-- =========================================================
-- TABLE PRIVILEGES
-- =========================================================

revoke all
on table public.profiles
from anon, authenticated;

revoke all
on table public.fitness_profiles
from anon, authenticated;

revoke all
on table public.user_preferences
from anon, authenticated;

revoke all
on table public.user_roles
from anon, authenticated;

revoke all
on table public.coach_clients
from anon, authenticated;

grant select
on table public.profiles
to authenticated;

grant update (
  full_name,
  avatar_url,
  date_of_birth,
  gender,
  timezone
)
on table public.profiles
to authenticated;

grant select, insert, update
on table public.fitness_profiles
to authenticated;

grant select, insert, update
on table public.user_preferences
to authenticated;

grant select
on table public.user_roles
to authenticated;

grant select
on table public.coach_clients
to authenticated;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles
enable row level security;

alter table public.fitness_profiles
enable row level security;

alter table public.user_preferences
enable row level security;

alter table public.user_roles
enable row level security;

alter table public.coach_clients
enable row level security;

-- Profiles

create policy profiles_select_own_assigned_or_admin
on public.profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_assigned_coach(user_id)
  or (select private.is_admin())
);

create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
)
with check (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

-- Fitness profiles

create policy fitness_profiles_select_own_assigned_or_admin
on public.fitness_profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_assigned_coach(user_id)
  or (select private.is_admin())
);

create policy fitness_profiles_insert_own_or_admin
on public.fitness_profiles
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

create policy fitness_profiles_update_own_or_admin
on public.fitness_profiles
for update
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
)
with check (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

-- User preferences

create policy user_preferences_select_own_assigned_or_admin
on public.user_preferences
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_assigned_coach(user_id)
  or (select private.is_admin())
);

create policy user_preferences_insert_own_or_admin
on public.user_preferences
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

create policy user_preferences_update_own_or_admin
on public.user_preferences
for update
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
)
with check (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

-- Roles

create policy user_roles_select_own_or_admin
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

-- Coach assignments

create policy coach_clients_select_related_or_admin
on public.coach_clients
for select
to authenticated
using (
  coach_id = (select auth.uid())
  or client_id = (select auth.uid())
  or (select private.is_admin())
);

-- =========================================================
-- BACKFILL EXISTING AUTH USERS
-- =========================================================

insert into public.profiles (
  user_id,
  full_name,
  avatar_url
)
select
  u.id,

  nullif(
    btrim(
      coalesce(
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name',
        split_part(coalesce(u.email, ''), '@', 1)
      )
    ),
    ''
  ),

  nullif(
    btrim(
      coalesce(
        u.raw_user_meta_data ->> 'avatar_url',
        u.raw_user_meta_data ->> 'picture'
      )
    ),
    ''
  )

from auth.users as u
on conflict (user_id) do nothing;

insert into public.fitness_profiles (
  user_id
)
select id
from auth.users
on conflict (user_id) do nothing;

insert into public.user_preferences (
  user_id
)
select id
from auth.users
on conflict (user_id) do nothing;

insert into public.user_roles (
  user_id,
  role,
  created_by
)
select
  id,
  'user'::public.app_role,
  id
from auth.users
on conflict (user_id) do nothing;

commit;