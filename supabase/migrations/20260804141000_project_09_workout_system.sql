-- Muscle Fitness — Project 09 Workout system (aligned with app actions types)
-- Columns named to match TypeScript Database types / actions.ts

create extension if not exists "pgcrypto";

-- Auth / coaching base (safe if already present)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fitness_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text,
  experience_level text,
  training_days_per_week int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('client', 'coach', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_system text,
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (coach_id, client_id)
);

do $$ begin
  create type public.app_permission as enum (
    'can_manage_own_profile',
    'can_manage_clients',
    'can_manage_workout_client',
    'can_view_workout_client',
    'can_manage_exercises',
    'can_coach'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.app_role as enum ('client', 'coach', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists role_permissions (
  id bigserial primary key,
  role public.app_role not null,
  permission public.app_permission not null,
  unique (role, permission)
);

insert into role_permissions (role, permission) values
  ('coach', 'can_manage_workout_client'),
  ('coach', 'can_view_workout_client'),
  ('coach', 'can_manage_clients'),
  ('coach', 'can_coach'),
  ('admin', 'can_manage_workout_client'),
  ('admin', 'can_view_workout_client'),
  ('admin', 'can_manage_clients'),
  ('admin', 'can_manage_exercises'),
  ('admin', 'can_coach'),
  ('client', 'can_manage_own_profile')
on conflict do nothing;

create or replace function public.has_permission(requested_permission public.app_permission)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role::public.app_role
    where ur.user_id = auth.uid()
      and rp.permission = requested_permission
  );
$$;

create table if not exists exercises (
  id text primary key,
  name text not null,
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  equipment text not null,
  difficulty text not null,
  instructions text[] not null default '{}',
  technique_cues text[] not null default '{}',
  media_url text,
  media_type text,
  contraindications text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references auth.users(id) on delete set null,
  coach_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workout_days (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references workout_plans(id) on delete cascade,
  name text not null,
  day_order int not null default 0
);

-- Named workout_exercises (not plan_exercises) to match app/dashboard/workouts/actions.ts
create table if not exists workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references workout_days(id) on delete cascade,
  exercise_id text not null references exercises(id),
  exercise_order int not null default 0,
  sets int not null,
  rep_min int not null,
  rep_max int not null,
  target_rir numeric,
  target_rpe numeric,
  rest_seconds int not null default 90,
  tempo text,
  coach_notes text
);

create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  workout_plan_id uuid references workout_plans(id) on delete set null,
  workout_day_id uuid references workout_days(id) on delete set null,
  name text not null,
  status text not null check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  deload boolean not null default false
);

create table if not exists session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id text not null references exercises(id),
  exercise_order int not null default 0,
  planned_sets int not null,
  rep_min int not null,
  rep_max int not null,
  target_rir numeric,
  target_rpe numeric,
  rest_seconds int not null default 90,
  tempo text,
  coach_notes text,
  replaced_from_exercise_id text references exercises(id),
  skipped boolean not null default false
);

create table if not exists logged_sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references session_exercises(id) on delete cascade,
  set_number int not null,
  weight_kg numeric not null default 0,
  reps int not null default 0,
  rir numeric,
  completed boolean not null default false,
  skipped boolean not null default false,
  completed_at timestamptz
);

create index if not exists idx_sessions_user on workout_sessions(user_id, started_at desc);
create index if not exists idx_workout_exercises_day on workout_exercises(workout_day_id);
create index if not exists idx_coach_clients_coach on coach_clients(coach_id);

alter table profiles enable row level security;
alter table fitness_profiles enable row level security;
alter table user_roles enable row level security;
alter table user_preferences enable row level security;
alter table coach_clients enable row level security;
alter table exercises enable row level security;
alter table workout_plans enable row level security;
alter table workout_days enable row level security;
alter table workout_exercises enable row level security;
alter table workout_sessions enable row level security;
alter table session_exercises enable row level security;
alter table logged_sets enable row level security;
