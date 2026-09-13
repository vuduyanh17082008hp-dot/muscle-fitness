-- Competition-safe Demo Data Control (spec Part "2. DEMO DATA
-- CONTROL"). Purely a per-user toggle for their OWN account — turning
-- this on only ever changes what THAT user sees (wearable snapshot,
-- Experiment Lab step-count exposure), never anyone else's real data.

create table if not exists public.user_demo_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  scenario text check (
    scenario in ('recovered_athlete', 'sleep_deprived_athlete', 'high_training_load', 'recovery_warning')
  ),
  updated_at timestamptz not null default now()
);

alter table public.user_demo_settings enable row level security;

create policy "select_own" on public.user_demo_settings
  for select using (auth.uid() = user_id);

create policy "insert_own" on public.user_demo_settings
  for insert with check (auth.uid() = user_id);

create policy "update_own" on public.user_demo_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
