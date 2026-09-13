-- Personal Experiment Lab (spec Part "5. PERSONAL EXPERIMENT LAB").
-- Only the DEFINITION is stored — observations are derived on demand
-- from food_logs/recovery_checkins/workout data/wearable snapshots
-- (see lib/experiments/load-daily-series.ts), so there is no separate
-- observations table or manual daily-entry write path.

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  exposure_type text not null check (exposure_type in ('late_caffeine', 'high_carb_pre_workout', 'high_step_count')),
  outcome_type text not null check (outcome_type in ('sleep_hours', 'recovery_score', 'leg_day_volume_kg')),
  window_days integer not null default 30 check (window_days between 7 and 90),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists experiments_user_created_idx on public.experiments (user_id, created_at desc);

alter table public.experiments enable row level security;

create policy "select_own" on public.experiments
  for select using (auth.uid() = user_id);

create policy "insert_own" on public.experiments
  for insert with check (auth.uid() = user_id);

create policy "update_own" on public.experiments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete_own" on public.experiments
  for delete using (auth.uid() = user_id);
