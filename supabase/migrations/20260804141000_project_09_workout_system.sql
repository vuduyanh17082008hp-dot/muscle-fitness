-- Muscle Fitness — Workout System schema (Supabase / Postgres)
-- Run in Supabase SQL editor when ready to move off the local JSON store.

create extension if not exists "pgcrypto";

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
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workout_days (
  id text primary key,
  plan_id text not null references workout_plans(id) on delete cascade,
  name text not null,
  day_order int not null default 0
);

create table if not exists plan_exercises (
  id text primary key,
  day_id text not null references workout_days(id) on delete cascade,
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
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  plan_id text references workout_plans(id) on delete set null,
  day_id text references workout_days(id) on delete set null,
  name text not null,
  status text not null check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  deload boolean not null default false
);

create table if not exists session_exercises (
  id text primary key,
  session_id text not null references workout_sessions(id) on delete cascade,
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
  id text primary key,
  session_exercise_id text not null references session_exercises(id) on delete cascade,
  set_number int not null,
  weight_kg numeric not null default 0,
  reps int not null default 0,
  rir numeric,
  completed boolean not null default false,
  skipped boolean not null default false,
  completed_at timestamptz
);

create index if not exists idx_sessions_user on workout_sessions(user_id, started_at desc);
create index if not exists idx_logged_sets_se on logged_sets(session_exercise_id);

alter table exercises enable row level security;
alter table workout_plans enable row level security;
alter table workout_days enable row level security;
alter table plan_exercises enable row level security;
alter table workout_sessions enable row level security;
alter table session_exercises enable row level security;
alter table logged_sets enable row level security;

-- Example policies (adjust for your auth model):
-- create policy "public read exercises" on exercises for select using (true);
-- create policy "owner plans" on workout_plans for all using (auth.uid() = user_id);
