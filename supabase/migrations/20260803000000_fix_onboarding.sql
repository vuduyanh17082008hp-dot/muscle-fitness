begin;

-- =========================================================
-- COMMON UPDATED_AT FUNCTION
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- PROFILES
-- =========================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  date_of_birth date,
  gender text,
  timezone text not null default 'Asia/Singapore',
  role text not null default 'client',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists user_id uuid,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists timezone text,
  add column if not exists role text,
  add column if not exists onboarding_completed boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.profiles
  alter column timezone set default 'Asia/Singapore',
  alter column role set default 'client',
  alter column onboarding_completed set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.profiles
set
  timezone = coalesce(timezone, 'Asia/Singapore'),
  role = coalesce(role, 'client'),
  onboarding_completed = coalesce(onboarding_completed, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

-- Nếu schema cũ dùng profiles.id, tự động chuyển sang user_id.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) then
    execute '
      update public.profiles
      set user_id = id
      where user_id is null
    ';
  end if;
end;
$$;

create unique index if not exists profiles_user_id_key
  on public.profiles(user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end;
$$;

-- =========================================================
-- FITNESS PROFILES
-- =========================================================

create table if not exists public.fitness_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  height_cm numeric(6, 2),
  weight_kg numeric(6, 2),
  goal text,
  experience text,
  training_days integer,
  session_duration_minutes integer,
  training_location text,
  available_equipment text[] not null default '{}',
  priority_muscles text[] not null default '{}',
  physical_limitations text,
  calories_target integer,
  protein_target_g integer,
  carbs_target_g integer,
  fat_target_g integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fitness_profiles
  add column if not exists user_id uuid,
  add column if not exists height_cm numeric(6, 2),
  add column if not exists weight_kg numeric(6, 2),
  add column if not exists goal text,
  add column if not exists experience text,
  add column if not exists training_days integer,
  add column if not exists session_duration_minutes integer,
  add column if not exists training_location text,
  add column if not exists available_equipment text[],
  add column if not exists priority_muscles text[],
  add column if not exists physical_limitations text,
  add column if not exists calories_target integer,
  add column if not exists protein_target_g integer,
  add column if not exists carbs_target_g integer,
  add column if not exists fat_target_g integer,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.fitness_profiles
  alter column available_equipment set default '{}',
  alter column priority_muscles set default '{}',
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.fitness_profiles
set
  available_equipment = coalesce(available_equipment, '{}'),
  priority_muscles = coalesce(priority_muscles, '{}'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists fitness_profiles_user_id_key
  on public.fitness_profiles(user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fitness_profiles_user_id_fkey'
      and conrelid = 'public.fitness_profiles'::regclass
  ) then
    alter table public.fitness_profiles
      add constraint fitness_profiles_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end;
$$;

-- =========================================================
-- USER PREFERENCES
-- =========================================================

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  meals_per_day integer,
  food_preferences text[] not null default '{}',
  excluded_foods text[] not null default '{}',
  allergies text[] not null default '{}',
  weekly_food_budget numeric(10, 2),
  cooking_ability text,
  meal_prep_frequency text,
  sleep_hours numeric(4, 1),
  daily_steps integer,
  work_schedule text,
  stress_level text,
  preferred_training_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences
  add column if not exists user_id uuid,
  add column if not exists meals_per_day integer,
  add column if not exists food_preferences text[],
  add column if not exists excluded_foods text[],
  add column if not exists allergies text[],
  add column if not exists weekly_food_budget numeric(10, 2),
  add column if not exists cooking_ability text,
  add column if not exists meal_prep_frequency text,
  add column if not exists sleep_hours numeric(4, 1),
  add column if not exists daily_steps integer,
  add column if not exists work_schedule text,
  add column if not exists stress_level text,
  add column if not exists preferred_training_time text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.user_preferences
  alter column food_preferences set default '{}',
  alter column excluded_foods set default '{}',
  alter column allergies set default '{}',
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.user_preferences
set
  food_preferences = coalesce(food_preferences, '{}'),
  excluded_foods = coalesce(excluded_foods, '{}'),
  allergies = coalesce(allergies, '{}'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists user_preferences_user_id_key
  on public.user_preferences(user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_user_id_fkey'
      and conrelid = 'public.user_preferences'::regclass
  ) then
    alter table public.user_preferences
      add constraint user_preferences_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end;
$$;

-- =========================================================
-- ONBOARDING DRAFTS
-- Đây là bảng đang bị thiếu trong ảnh.
-- =========================================================

create table if not exists public.onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_step integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding_drafts
  add column if not exists user_id uuid,
  add column if not exists current_step integer,
  add column if not exists data jsonb,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.onboarding_drafts
  alter column current_step set default 0,
  alter column data set default '{}'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.onboarding_drafts
set
  current_step = coalesce(current_step, 0),
  data = coalesce(data, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists onboarding_drafts_user_id_key
  on public.onboarding_drafts(user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'onboarding_drafts_user_id_fkey'
      and conrelid = 'public.onboarding_drafts'::regclass
  ) then
    alter table public.onboarding_drafts
      add constraint onboarding_drafts_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end;
$$;

-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================

drop trigger if exists profiles_set_updated_at
on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists fitness_profiles_set_updated_at
on public.fitness_profiles;

create trigger fitness_profiles_set_updated_at
before update on public.fitness_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at
on public.user_preferences;

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists onboarding_drafts_set_updated_at
on public.onboarding_drafts;

create trigger onboarding_drafts_set_updated_at
before update on public.onboarding_drafts
for each row
execute function public.set_updated_at();

-- =========================================================
-- AUTH USER → PROFILE TRIGGER
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_legacy_id boolean;
  metadata_name text;
  metadata_avatar text;
begin
  metadata_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  metadata_avatar := coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  );

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and udt_name = 'uuid'
  )
  into has_legacy_id;

  if has_legacy_id then
    execute $query$
      insert into public.profiles (
        id,
        user_id,
        full_name,
        avatar_url,
        timezone,
        role,
        onboarding_completed
      )
      values (
        $1,
        $1,
        $2,
        $3,
        'Asia/Singapore',
        'client',
        false
      )
      on conflict (user_id) do nothing
    $query$
    using new.id, metadata_name, metadata_avatar;
  else
    insert into public.profiles (
      user_id,
      full_name,
      avatar_url,
      timezone,
      role,
      onboarding_completed
    )
    values (
      new.id,
      metadata_name,
      metadata_avatar,
      'Asia/Singapore',
      'client',
      false
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- =========================================================
-- BACKFILL EXISTING AUTH USERS
-- =========================================================

do $$
declare
  has_legacy_id boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and udt_name = 'uuid'
  )
  into has_legacy_id;

  if has_legacy_id then
    execute $query$
      insert into public.profiles (
        id,
        user_id,
        full_name,
        avatar_url,
        timezone,
        role,
        onboarding_completed
      )
      select
        users.id,
        users.id,
        coalesce(
          users.raw_user_meta_data ->> 'full_name',
          users.raw_user_meta_data ->> 'name',
          split_part(users.email, '@', 1)
        ),
        coalesce(
          users.raw_user_meta_data ->> 'avatar_url',
          users.raw_user_meta_data ->> 'picture'
        ),
        'Asia/Singapore',
        'client',
        false
      from auth.users as users
      where not exists (
        select 1
        from public.profiles as profiles
        where profiles.user_id = users.id
      )
      on conflict (user_id) do nothing
    $query$;
  else
    insert into public.profiles (
      user_id,
      full_name,
      avatar_url,
      timezone,
      role,
      onboarding_completed
    )
    select
      users.id,
      coalesce(
        users.raw_user_meta_data ->> 'full_name',
        users.raw_user_meta_data ->> 'name',
        split_part(users.email, '@', 1)
      ),
      coalesce(
        users.raw_user_meta_data ->> 'avatar_url',
        users.raw_user_meta_data ->> 'picture'
      ),
      'Asia/Singapore',
      'client',
      false
    from auth.users as users
    where not exists (
      select 1
      from public.profiles as profiles
      where profiles.user_id = users.id
    )
    on conflict (user_id) do nothing;
  end if;
end;
$$;

-- =========================================================
-- ENABLE ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles
  enable row level security;

alter table public.fitness_profiles
  enable row level security;

alter table public.user_preferences
  enable row level security;

alter table public.onboarding_drafts
  enable row level security;

-- =========================================================
-- PROFILES POLICIES
-- =========================================================

drop policy if exists "profiles_select_own"
on public.profiles;

drop policy if exists "profiles_insert_own"
on public.profiles;

drop policy if exists "profiles_update_own"
on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

-- =========================================================
-- FITNESS PROFILES POLICIES
-- =========================================================

drop policy if exists "fitness_profiles_select_own"
on public.fitness_profiles;

drop policy if exists "fitness_profiles_insert_own"
on public.fitness_profiles;

drop policy if exists "fitness_profiles_update_own"
on public.fitness_profiles;

create policy "fitness_profiles_select_own"
on public.fitness_profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "fitness_profiles_insert_own"
on public.fitness_profiles
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "fitness_profiles_update_own"
on public.fitness_profiles
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

-- =========================================================
-- USER PREFERENCES POLICIES
-- =========================================================

drop policy if exists "user_preferences_select_own"
on public.user_preferences;

drop policy if exists "user_preferences_insert_own"
on public.user_preferences;

drop policy if exists "user_preferences_update_own"
on public.user_preferences;

create policy "user_preferences_select_own"
on public.user_preferences
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "user_preferences_insert_own"
on public.user_preferences
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "user_preferences_update_own"
on public.user_preferences
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

-- =========================================================
-- ONBOARDING DRAFT POLICIES
-- =========================================================

drop policy if exists "onboarding_drafts_select_own"
on public.onboarding_drafts;

drop policy if exists "onboarding_drafts_insert_own"
on public.onboarding_drafts;

drop policy if exists "onboarding_drafts_update_own"
on public.onboarding_drafts;

drop policy if exists "onboarding_drafts_delete_own"
on public.onboarding_drafts;

create policy "onboarding_drafts_select_own"
on public.onboarding_drafts
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "onboarding_drafts_insert_own"
on public.onboarding_drafts
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "onboarding_drafts_update_own"
on public.onboarding_drafts
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "onboarding_drafts_delete_own"
on public.onboarding_drafts
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

-- =========================================================
-- DATABASE GRANTS
-- =========================================================

grant usage on schema public
to authenticated, service_role;

grant select, insert, update
on public.profiles
to authenticated;

grant select, insert, update, delete
on public.profiles
to service_role;

grant select, insert, update
on public.fitness_profiles
to authenticated;

grant select, insert, update, delete
on public.fitness_profiles
to service_role;

grant select, insert, update
on public.user_preferences
to authenticated;

grant select, insert, update, delete
on public.user_preferences
to service_role;

grant select, insert, update, delete
on public.onboarding_drafts
to authenticated, service_role;

commit;

-- =========================================================
-- FORCE POSTGREST TO SEE THE NEW TABLES
-- =========================================================

notify pgrst, 'reload schema';

select pg_notification_queue_usage();