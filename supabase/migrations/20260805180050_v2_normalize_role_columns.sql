-- =========================================================
-- MUSCLE FITNESS V2
-- PHASE 1 — CORE DATABASE COMPATIBILITY
-- =========================================================
--
-- Migration này sửa database remote chưa hoàn chỉnh:
--
-- - profiles đã tồn tại nhưng có thể thiếu cột.
-- - user_roles có thể chưa tồn tại.
-- - coach_clients có thể chưa tồn tại.
-- - fitness_profiles có thể chưa tồn tại.
-- - user_preferences có thể chưa tồn tại.
-- - role cũ "user" được chuẩn hóa thành "client".
--
-- Migration role enum phải chạy trước file này.
-- =========================================================

begin;

-- =========================================================
-- 1. ENSURE PROFILES TABLE EXISTS
-- =========================================================

create table if not exists public.profiles (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  full_name text,
  avatar_url text,

  role public.app_role
    not null
    default 'client'::public.app_role,

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
    default now()
);

alter table public.profiles
  add column if not exists full_name text;

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists role public.app_role;

alter table public.profiles
  add column if not exists timezone text;

alter table public.profiles
  add column if not exists onboarding_completed boolean;

alter table public.profiles
  add column if not exists created_at timestamptz;

alter table public.profiles
  add column if not exists updated_at timestamptz;

-- =========================================================
-- 2. NORMALIZE profiles.role
-- =========================================================

do $migration$
declare
  v_is_app_role boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
      and udt_schema = 'public'
      and udt_name = 'app_role'
  )
  into v_is_app_role;

  alter table public.profiles
    alter column role drop default;

  if not v_is_app_role then
    alter table public.profiles
      alter column role
      type public.app_role
      using (
        case
          when role is null then
            'client'

          when lower(btrim(role::text)) = 'user' then
            'client'

          when lower(btrim(role::text)) in (
            'client',
            'coach',
            'support',
            'admin',
            'super_admin'
          ) then
            lower(btrim(role::text))

          else
            'client'
        end
      )::public.app_role;
  end if;
end;
$migration$;

update public.profiles
set role = 'client'::public.app_role
where role is null
   or role::text = 'user';

update public.profiles
set timezone = 'UTC'
where timezone is null
   or btrim(timezone) = '';

update public.profiles
set onboarding_completed = false
where onboarding_completed is null;

update public.profiles
set created_at = now()
where created_at is null;

update public.profiles
set updated_at = now()
where updated_at is null;

alter table public.profiles
  alter column role
  set default 'client'::public.app_role;

alter table public.profiles
  alter column role
  set not null;

alter table public.profiles
  alter column timezone
  set default 'UTC';

alter table public.profiles
  alter column timezone
  set not null;

alter table public.profiles
  alter column onboarding_completed
  set default false;

alter table public.profiles
  alter column onboarding_completed
  set not null;

alter table public.profiles
  alter column created_at
  set default now();

alter table public.profiles
  alter column created_at
  set not null;

alter table public.profiles
  alter column updated_at
  set default now();

alter table public.profiles
  alter column updated_at
  set not null;

-- =========================================================
-- 3. CREATE user_roles IF MISSING
-- =========================================================

create table if not exists public.user_roles (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  role public.app_role
    not null
    default 'client'::public.app_role,

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

alter table public.user_roles
  add column if not exists role public.app_role;

alter table public.user_roles
  add column if not exists created_by uuid
    references auth.users (id)
    on delete set null;

alter table public.user_roles
  add column if not exists created_at timestamptz;

alter table public.user_roles
  add column if not exists updated_at timestamptz;

-- Required by ON CONFLICT (user_id).
create unique index if not exists user_roles_user_id_unique
  on public.user_roles (user_id);

-- =========================================================
-- 4. NORMALIZE user_roles.role
-- =========================================================

do $migration$
declare
  v_is_app_role boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_roles'
      and column_name = 'role'
      and udt_schema = 'public'
      and udt_name = 'app_role'
  )
  into v_is_app_role;

  alter table public.user_roles
    alter column role drop default;

  if not v_is_app_role then
    alter table public.user_roles
      alter column role
      type public.app_role
      using (
        case
          when role is null then
            'client'

          when lower(btrim(role::text)) = 'user' then
            'client'

          when lower(btrim(role::text)) in (
            'client',
            'coach',
            'support',
            'admin',
            'super_admin'
          ) then
            lower(btrim(role::text))

          else
            'client'
        end
      )::public.app_role;
  end if;
end;
$migration$;

update public.user_roles
set role = 'client'::public.app_role
where role is null
   or role::text = 'user';

update public.user_roles
set created_at = now()
where created_at is null;

update public.user_roles
set updated_at = now()
where updated_at is null;

alter table public.user_roles
  alter column role
  set default 'client'::public.app_role;

alter table public.user_roles
  alter column role
  set not null;

alter table public.user_roles
  alter column created_at
  set default now();

alter table public.user_roles
  alter column created_at
  set not null;

alter table public.user_roles
  alter column updated_at
  set default now();

alter table public.user_roles
  alter column updated_at
  set not null;

-- =========================================================
-- 5. CREATE fitness_profiles IF MISSING
-- =========================================================

create table if not exists public.fitness_profiles (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  height_cm numeric(6, 2),
  weight_kg numeric(6, 2),
  target_weight_kg numeric(6, 2),

  goal text,
  training_experience text,
  training_days_per_week smallint,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint fitness_profiles_height_check
    check (
      height_cm is null
      or height_cm between 50 and 300
    ),

  constraint fitness_profiles_weight_check
    check (
      weight_kg is null
      or weight_kg between 20 and 500
    ),

  constraint fitness_profiles_target_weight_check
    check (
      target_weight_kg is null
      or target_weight_kg between 20 and 500
    ),

  constraint fitness_profiles_training_days_check
    check (
      training_days_per_week is null
      or training_days_per_week between 0 and 7
    )
);

-- =========================================================
-- 6. CREATE user_preferences IF MISSING
-- =========================================================

create table if not exists public.user_preferences (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  theme text
    not null
    default 'system',

  language text
    not null
    default 'en',

  unit_system text
    not null
    default 'metric',

  email_notifications boolean
    not null
    default true,

  push_notifications boolean
    not null
    default false,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint user_preferences_theme_check
    check (
      theme in ('system', 'light', 'dark')
    ),

  constraint user_preferences_unit_system_check
    check (
      unit_system in ('metric', 'imperial')
    )
);

-- =========================================================
-- 7. CREATE coach_clients IF MISSING
-- =========================================================

create table if not exists public.coach_clients (
  coach_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  client_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  assigned_by uuid
    references auth.users (id)
    on delete set null,

  status text
    not null
    default 'active',

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  primary key (
    coach_id,
    client_id
  ),

  constraint coach_clients_different_users
    check (
      coach_id <> client_id
    ),

  constraint coach_clients_status_check
    check (
      status in (
        'active',
        'paused',
        'ended'
      )
    )
);

create index if not exists coach_clients_client_id_idx
  on public.coach_clients (client_id);

create index if not exists coach_clients_coach_id_idx
  on public.coach_clients (coach_id);

-- =========================================================
-- 8. BACKFILL PROFILES
-- =========================================================

insert into public.profiles (
  user_id,
  full_name,
  avatar_url,
  role,
  timezone,
  onboarding_completed
)
select
  users.id,

  nullif(
    btrim(
      coalesce(
        users.raw_user_meta_data ->> 'full_name',
        users.raw_user_meta_data ->> 'name',
        split_part(
          coalesce(users.email, ''),
          '@',
          1
        )
      )
    ),
    ''
  ),

  nullif(
    btrim(
      coalesce(
        users.raw_user_meta_data ->> 'avatar_url',
        users.raw_user_meta_data ->> 'picture'
      )
    ),
    ''
  ),

  'client'::public.app_role,

  coalesce(
    nullif(
      btrim(
        users.raw_user_meta_data ->> 'timezone'
      ),
      ''
    ),
    'UTC'
  ),

  false
from auth.users as users
on conflict (user_id) do nothing;

-- =========================================================
-- 9. BACKFILL USER ROLES
-- =========================================================

insert into public.user_roles (
  user_id,
  role,
  created_by
)
select
  profiles.user_id,
  profiles.role,
  profiles.user_id
from public.profiles as profiles
on conflict (user_id) do update
set
  role = excluded.role,
  updated_at = now();

-- =========================================================
-- 10. BACKFILL SUPPORTING ROWS
-- =========================================================

insert into public.fitness_profiles (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;

insert into public.user_preferences (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;

-- =========================================================
-- 11. ROLE CHECK FUNCTION
-- =========================================================

create or replace function public.has_any_role(
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as user_roles
    where user_roles.user_id = (
      select auth.uid()
    )
      and user_roles.role::text = any (p_roles)
  );
$$;

revoke all
on function public.has_any_role(text[])
from public;

grant execute
on function public.has_any_role(text[])
to authenticated;

-- =========================================================
-- 12. PRIVILEGES
-- =========================================================

grant select
on public.user_roles
to authenticated;

grant select
on public.coach_clients
to authenticated;

grant select, insert, update
on public.fitness_profiles
to authenticated;

grant select, insert, update
on public.user_preferences
to authenticated;

-- =========================================================
-- 13. ROW LEVEL SECURITY
-- =========================================================

alter table public.user_roles
  enable row level security;

alter table public.coach_clients
  enable row level security;

alter table public.fitness_profiles
  enable row level security;

alter table public.user_preferences
  enable row level security;

-- =========================================================
-- user_roles POLICIES
-- =========================================================

drop policy if exists user_roles_v2_select
on public.user_roles;

create policy user_roles_v2_select
on public.user_roles
for select
to authenticated
using (
  user_id = (
    select auth.uid()
  )
  or public.has_any_role(
    array[
      'admin',
      'super_admin'
    ]
  )
);

-- =========================================================
-- coach_clients POLICIES
-- =========================================================

drop policy if exists coach_clients_v2_select
on public.coach_clients;

create policy coach_clients_v2_select
on public.coach_clients
for select
to authenticated
using (
  coach_id = (
    select auth.uid()
  )
  or client_id = (
    select auth.uid()
  )
  or public.has_any_role(
    array[
      'admin',
      'super_admin'
    ]
  )
);

-- =========================================================
-- fitness_profiles POLICIES
-- =========================================================

drop policy if exists fitness_profiles_v2_select
on public.fitness_profiles;

create policy fitness_profiles_v2_select
on public.fitness_profiles
for select
to authenticated
using (
  user_id = (
    select auth.uid()
  )
  or exists (
    select 1
    from public.coach_clients as relationship
    where relationship.client_id =
      public.fitness_profiles.user_id
      and relationship.coach_id = (
        select auth.uid()
      )
  )
  or public.has_any_role(
    array[
      'admin',
      'super_admin'
    ]
  )
);

drop policy if exists fitness_profiles_v2_insert
on public.fitness_profiles;

create policy fitness_profiles_v2_insert
on public.fitness_profiles
for insert
to authenticated
with check (
  user_id = (
    select auth.uid()
  )
);

drop policy if exists fitness_profiles_v2_update
on public.fitness_profiles;

create policy fitness_profiles_v2_update
on public.fitness_profiles
for update
to authenticated
using (
  user_id = (
    select auth.uid()
  )
)
with check (
  user_id = (
    select auth.uid()
  )
);

-- =========================================================
-- user_preferences POLICIES
-- =========================================================

drop policy if exists user_preferences_v2_select
on public.user_preferences;

create policy user_preferences_v2_select
on public.user_preferences
for select
to authenticated
using (
  user_id = (
    select auth.uid()
  )
);

drop policy if exists user_preferences_v2_insert
on public.user_preferences;

create policy user_preferences_v2_insert
on public.user_preferences
for insert
to authenticated
with check (
  user_id = (
    select auth.uid()
  )
);

drop policy if exists user_preferences_v2_update
on public.user_preferences;

create policy user_preferences_v2_update
on public.user_preferences
for update
to authenticated
using (
  user_id = (
    select auth.uid()
  )
)
with check (
  user_id = (
    select auth.uid()
  )
);

commit;